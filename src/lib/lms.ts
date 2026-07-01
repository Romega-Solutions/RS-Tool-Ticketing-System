import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeRole, type AppRole } from '@/lib/rbac';
import { computeQuizGate, type QuizGate } from '@/lib/lms-quiz';
import { unstable_cache } from 'next/cache';
import { LMS_COURSES_TAG } from '@/lib/cache-tags';

export type LmsScope = 'foundation' | 'department' | 'intern';
export type LessonType = 'text' | 'video' | 'mixed';
export type LmsEnforcement = 'soft' | 'hard';

export type LmsCourse = {
  id:             number;
  title:          string;
  description:    string | null;
  scope:          LmsScope;
  department:     string | null;
  coverImageUrl:  string | null;
  isPublished:    number;
  enforcement:    LmsEnforcement;
  sortOrder:      number;
  createdAt:      string;
  updatedAt:      string;
};

export type LmsLesson = {
  id:                   number;
  courseId:             number;
  title:                string;
  lessonType:           LessonType;
  bodyMd:               string | null;
  videoSource:          'youtube' | 'upload' | null;
  videoUrl:             string | null;
  videoDurationSeconds: number | null;
  sortOrder:            number;
};

export type CourseAudience = { role: AppRole; team: string | null; userId: number };

// Does this user belong to a course's auto-assigned audience?
// (foundation = everyone; intern = normalized role 'intern'; department = team match)
export function userInCourseAudience(course: LmsCourse, user: CourseAudience): boolean {
  if (course.scope === 'foundation') return true;
  if (course.scope === 'intern')     return user.role === 'intern';
  if (course.scope === 'department') {
    return !!course.department && (user.team ?? '') === course.department;
  }
  return false;
}

// Published courses visible to the user, ordered by scope priority then sort_order.
// Foundation first, then Intern (if applicable), then the user's Department.
const getCachedPublishedCourseRows = unstable_cache(
  async () => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('lms_courses')
      .select('id, title, description, scope, department, cover_image_url, is_published, enforcement, sort_order, created_at, updated_at')
      .eq('is_published', 1)
      .order('sort_order', { ascending: true });
    if (error) throw new Error(`visibleCoursesFor: ${error.message}`);
    return data ?? [];
  },
  ['lms-published-courses'],
  { revalidate: 300, tags: [LMS_COURSES_TAG] },
);

export async function visibleCoursesFor(user: CourseAudience): Promise<LmsCourse[]> {
  const rows = await getCachedPublishedCourseRows();
  const all = rows.map(rowToCourse);
  const visible = all.filter(c => userInCourseAudience(c, user));
  // Stable scope ordering: foundation → intern → department
  const rank: Record<LmsScope, number> = { foundation: 0, intern: 1, department: 2 };
  return visible.sort((a, b) =>
    rank[a.scope] - rank[b.scope] || a.sortOrder - b.sortOrder
  );
}

// Single course detail + lesson list (used by the course page).
export async function getCourseWithLessons(courseId: number): Promise<{
  course: LmsCourse;
  lessons: LmsLesson[];
} | null> {
  const admin = createAdminClient();
  const { data: courseRow } = await admin
    .from('lms_courses')
    .select('*')
    .eq('id', courseId)
    .maybeSingle();
  if (!courseRow) return null;

  const { data: lessonRows, error: le } = await admin
    .from('lms_lessons')
    .select('*')
    .eq('course_id', courseId)
    .order('sort_order', { ascending: true });
  if (le) throw new Error(`getCourseWithLessons lessons: ${le.message}`);

  return {
    course: rowToCourse(courseRow),
    lessons: (lessonRows ?? []).map(rowToLesson),
  };
}

// Progress is the fraction of lessons this user has completed in this course.
// Returns { completed: n, total: n, percent: 0–100 }.
export async function courseProgress(userId: number, courseId: number): Promise<{
  completed: number;
  total:     number;
  percent:   number;
}> {
  const admin = createAdminClient();
  const { data: lessonIds, error: le } = await admin
    .from('lms_lessons').select('id').eq('course_id', courseId);
  if (le) throw new Error(`courseProgress lessons: ${le.message}`);
  const ids = (lessonIds ?? []).map((r: { id: number }) => r.id);
  const total = ids.length;
  if (total === 0) return { completed: 0, total: 0, percent: 0 };

  const { data: completions, error: ce } = await admin
    .from('lms_lesson_completions')
    .select('lesson_id')
    .eq('user_id', userId)
    .in('lesson_id', ids);
  if (ce) throw new Error(`courseProgress completions: ${ce.message}`);
  const completed = (completions ?? []).length;

  return { completed, total, percent: Math.round((completed / total) * 100) };
}

// Map a list of course IDs to progress in one round-trip — used by the index page.
export async function progressForCourses(userId: number, courseIds: number[]): Promise<Map<number, { completed: number; total: number; percent: number }>> {
  const out = new Map<number, { completed: number; total: number; percent: number }>();
  if (courseIds.length === 0) return out;

  const admin = createAdminClient();
  const { data: lessons, error: le } = await admin
    .from('lms_lessons')
    .select('id, course_id')
    .in('course_id', courseIds);
  if (le) throw new Error(`progressForCourses lessons: ${le.message}`);

  const lessonsByCourse = new Map<number, number[]>();
  for (const row of (lessons ?? []) as { id: number; course_id: number }[]) {
    const arr = lessonsByCourse.get(row.course_id) ?? [];
    arr.push(row.id);
    lessonsByCourse.set(row.course_id, arr);
  }

  const allLessonIds = (lessons ?? []).map((r: { id: number }) => r.id);
  let completedIds = new Set<number>();
  if (allLessonIds.length > 0) {
    const { data: completions, error: ce } = await admin
      .from('lms_lesson_completions')
      .select('lesson_id')
      .eq('user_id', userId)
      .in('lesson_id', allLessonIds);
    if (ce) throw new Error(`progressForCourses completions: ${ce.message}`);
    completedIds = new Set((completions ?? []).map((r: { lesson_id: number }) => r.lesson_id));
  }

  for (const courseId of courseIds) {
    const ids = lessonsByCourse.get(courseId) ?? [];
    const total = ids.length;
    const completed = ids.filter(id => completedIds.has(id)).length;
    out.set(courseId, {
      completed,
      total,
      percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    });
  }
  return out;
}

// "Can this lesson be marked complete right now?" — used by the lesson UI and
// by markLessonComplete on the server. Quiz gating is layered on top of this
// in Phase 2; today only the type-based gate exists.
export function canMarkComplete(args: {
  lessonType:    LessonType;
  watchedToEnd:  boolean;
}): boolean {
  if (args.lessonType === 'text')  return true;
  if (args.lessonType === 'video') return args.watchedToEnd;
  // mixed: requires watching to end
  return args.watchedToEnd;
}

// Quiz gate (sequential progression): resolve the preceding lessons + this
// user's completions, then defer the locked/remaining decision to the pure
// computeQuizGate helper. Used by the lesson page (UI) and submitQuizAttempt
// (server enforcement) so the lock can't be bypassed via the URL/API.
export async function quizGateFor(userId: number, quizLessonId: number): Promise<QuizGate> {
  const admin = createAdminClient();

  const { data: quizLesson } = await admin
    .from('lms_lessons')
    .select('course_id, sort_order')
    .eq('id', quizLessonId)
    .maybeSingle();
  if (!quizLesson) return { locked: false, remaining: [], nextLessonId: null };

  const { data: preceding } = await admin
    .from('lms_lessons')
    .select('id, title, sort_order')
    .eq('course_id', quizLesson.course_id)
    .lt('sort_order', quizLesson.sort_order)
    .order('sort_order', { ascending: true });

  const precedingLessons = ((preceding ?? []) as { id: number; title: string }[])
    .map(l => ({ id: l.id, title: l.title }));
  if (precedingLessons.length === 0) return { locked: false, remaining: [], nextLessonId: null };

  const ids = precedingLessons.map(l => l.id);
  const { data: completions } = await admin
    .from('lms_lesson_completions')
    .select('lesson_id')
    .eq('user_id', userId)
    .in('lesson_id', ids);
  const completedLessonIds = ((completions ?? []) as { lesson_id: number }[]).map(r => r.lesson_id);

  return computeQuizGate({ precedingLessons, completedLessonIds });
}

// Coerce arbitrary DB strings to a known scope literal; defaults to 'foundation' on garbage.
function asScope(v: unknown): LmsScope {
  return v === 'department' || v === 'intern' ? v : 'foundation';
}
function asEnforcement(v: unknown): LmsEnforcement {
  return v === 'hard' ? 'hard' : 'soft';
}
function asLessonType(v: unknown): LessonType {
  return v === 'video' || v === 'mixed' ? v : 'text';
}
function asVideoSource(v: unknown): 'youtube' | 'upload' | null {
  return v === 'youtube' || v === 'upload' ? v : null;
}

type CourseRow = {
  id: number; title: string; description: string | null; scope: string;
  department: string | null; cover_image_url: string | null;
  is_published: number; enforcement: string; sort_order: number;
  created_at: string; updated_at: string;
};
function rowToCourse(r: CourseRow): LmsCourse {
  return {
    id:             r.id,
    title:          r.title,
    description:    r.description,
    scope:          asScope(r.scope),
    department:     r.department,
    coverImageUrl:  r.cover_image_url,
    isPublished:    r.is_published,
    enforcement:    asEnforcement(r.enforcement),
    sortOrder:      r.sort_order,
    createdAt:      r.created_at,
    updatedAt:      r.updated_at,
  };
}

type LessonRow = {
  id: number; course_id: number; title: string; lesson_type: string;
  body_md: string | null; video_source: string | null; video_url: string | null;
  video_duration_seconds: number | null; sort_order: number;
};
function rowToLesson(r: LessonRow): LmsLesson {
  return {
    id:                   r.id,
    courseId:             r.course_id,
    title:                r.title,
    lessonType:           asLessonType(r.lesson_type),
    bodyMd:               r.body_md,
    videoSource:          asVideoSource(r.video_source),
    videoUrl:             r.video_url,
    videoDurationSeconds: r.video_duration_seconds,
    sortOrder:            r.sort_order,
  };
}

// Re-export normalizeRole so callers don't need a second import.
export { normalizeRole };
