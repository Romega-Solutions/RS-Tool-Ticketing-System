// Hard-enforcement gate. Only applies to users whose users.is_onboarding = 1
// AND who have an incomplete published 'hard' course they belong to.
// Admin/CEO never trigger this — they don't have is_onboarding=1.

import { createAdminClient } from '@/lib/supabase/admin';
import { userInCourseAudience, type LmsCourse } from '@/lib/lms';
import { normalizeRole, type AppRole } from '@/lib/rbac';

export type EnforcementUser = {
  userId:       number;
  role:         AppRole;
  team:         string | null;
  isOnboarding: boolean;
};

// Returns the first hard course this user is required to complete before
// being allowed elsewhere, or null if no blocking course exists.
//
// Priority: Foundation > Intern > Department, then sort_order.
export async function hasIncompleteHardCourse(user: EnforcementUser): Promise<{ courseId: number } | null> {
  if (!user.isOnboarding) return null;          // regularized staff are never gated
  if (user.role === 'admin') return null;       // never gate admins

  const admin = createAdminClient();
  const { data: courses, error } = await admin
    .from('lms_courses')
    .select('id, title, description, scope, department, cover_image_url, is_published, enforcement, sort_order, created_at, updated_at')
    .eq('is_published', 1)
    .eq('enforcement', 'hard')
    .order('sort_order', { ascending: true });
  if (error || !courses || courses.length === 0) return null;

  type Row = {
    id: number; title: string; description: string | null; scope: string;
    department: string | null; cover_image_url: string | null;
    is_published: number; enforcement: string; sort_order: number;
    created_at: string; updated_at: string;
  };
  const list: LmsCourse[] = (courses as Row[]).map(c => ({
    id: c.id, title: c.title, description: c.description,
    scope: c.scope === 'department' || c.scope === 'intern' ? c.scope : 'foundation',
    department: c.department, coverImageUrl: c.cover_image_url,
    isPublished: c.is_published,
    enforcement: c.enforcement === 'hard' ? 'hard' : 'soft',
    sortOrder: c.sort_order, createdAt: c.created_at, updatedAt: c.updated_at,
  }));

  // Stable scope priority.
  const rank: Record<string, number> = { foundation: 0, intern: 1, department: 2 };
  list.sort((a, b) => rank[a.scope] - rank[b.scope] || a.sortOrder - b.sortOrder);

  for (const course of list) {
    if (!userInCourseAudience(course, { userId: user.userId, role: user.role, team: user.team })) {
      continue;
    }
    const { data: lessons } = await admin
      .from('lms_lessons').select('id').eq('course_id', course.id);
    const lessonIds = ((lessons ?? []) as { id: number }[]).map(l => l.id);
    if (lessonIds.length === 0) continue; // empty course can't block anyone

    const { data: completed } = await admin
      .from('lms_lesson_completions').select('lesson_id')
      .eq('user_id', user.userId).in('lesson_id', lessonIds);
    if ((completed?.length ?? 0) < lessonIds.length) {
      return { courseId: course.id };
    }
  }
  return null;
}

// Whether the request should bypass hard-enforcement. Always allow /learning
// itself (so the gated user can actually finish the course), /login, /logout,
// and the API routes (so server actions and webhook routes keep working).
export function isPathExemptFromHardEnforcement(pathname: string): boolean {
  if (!pathname) return true;
  if (pathname.startsWith('/learning')) return true;
  if (pathname === '/login') return true;
  if (pathname === '/logout') return true;
  if (pathname === '/profile') return true;
  if (pathname.startsWith('/api/')) return true;
  return false;
}

// Re-export so the layout doesn't need a separate rbac import.
export { normalizeRole };
