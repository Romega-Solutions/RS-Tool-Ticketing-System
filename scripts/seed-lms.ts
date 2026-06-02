/**
 * Seeds sample LMS content (courses + lessons + one quiz) into Supabase.
 * Idempotent: a course is skipped if one with the same title already exists,
 * so re-running won't create duplicates.
 *
 *   npx tsx scripts/seed-lms.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.
 * Courses are auto-assigned by scope: 'foundation' → everyone,
 * 'intern' → users whose normalized role is intern, 'department' → users.team match.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY || SERVICE_KEY === 'your-service-role-key-here') {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type LessonSeed = {
  title: string;
  lessonType: 'text' | 'video' | 'mixed';
  bodyMd?: string;
  videoSource?: 'youtube' | 'upload';
  videoUrl?: string;
  videoDurationSeconds?: number;
  // optional quiz attached to this lesson (must pass before completion)
  quiz?: {
    passScore: number;
    questions: {
      prompt: string;
      questionType: 'multiple_choice' | 'true_false';
      choices: { key: string; text: string }[];
      correctKeys: string[];
    }[];
  };
};

type CourseSeed = {
  title: string;
  description: string;
  scope: 'foundation' | 'department' | 'intern';
  department?: string;          // required when scope === 'department'
  enforcement: 'soft' | 'hard';
  sortOrder: number;
  lessons: LessonSeed[];
};

const COURSES: CourseSeed[] = [
  {
    title: 'Welcome to Romega Solutions',
    description: 'Company overview, values, tools, and how we work. Required for everyone.',
    scope: 'foundation',
    enforcement: 'soft',
    sortOrder: 0,
    lessons: [
      {
        title: 'Who We Are',
        lessonType: 'text',
        bodyMd:
          '# Welcome 👋\n\nRomega Solutions is a remote-first team. This short course gets you oriented.\n\n## Our Values\n- **Ownership** — see it, own it, ship it.\n- **Clarity** — write things down.\n- **Care** — for clients and for each other.\n',
      },
      {
        title: 'How We Work (video)',
        lessonType: 'video',
        videoSource: 'youtube',
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        videoDurationSeconds: 212,
        bodyMd: 'Watch the full clip to unlock **Mark Complete**.',
      },
      {
        title: 'Quick Check',
        lessonType: 'text',
        bodyMd: 'A two-question check to confirm the basics stuck. Pass to complete the course.',
        quiz: {
          passScore: 70,
          questions: [
            {
              prompt: 'Romega Solutions is primarily a…',
              questionType: 'multiple_choice',
              choices: [
                { key: 'a', text: 'Remote-first team' },
                { key: 'b', text: 'Single-office company' },
                { key: 'c', text: 'Hardware manufacturer' },
              ],
              correctKeys: ['a'],
            },
            {
              prompt: '"Write things down" reflects our value of Clarity.',
              questionType: 'true_false',
              choices: [
                { key: 'true', text: 'True' },
                { key: 'false', text: 'False' },
              ],
              correctKeys: ['true'],
            },
          ],
        },
      },
    ],
  },
  {
    title: 'Intern Bootcamp',
    description: 'First-week essentials for interns — comms, tooling, and expectations.',
    scope: 'intern',
    enforcement: 'soft',
    sortOrder: 0,
    lessons: [
      {
        title: 'Your First Week',
        lessonType: 'text',
        bodyMd: '## First Week Checklist\n\n1. Set up your accounts.\n2. Meet your buddy.\n3. Read the team handbook.\n',
      },
      {
        title: 'Communication Norms',
        lessonType: 'text',
        bodyMd: 'Default to async. Over-communicate progress. Ask early.',
      },
    ],
  },
  {
    title: 'AI & Technology — Engineering Standards',
    description: 'Coding standards, review etiquette, and deployment basics for the AI & Technology team.',
    scope: 'department',
    department: 'AI & Technology', // must match users.team exactly
    enforcement: 'soft',
    sortOrder: 0,
    lessons: [
      {
        title: 'Code Review Etiquette',
        lessonType: 'text',
        bodyMd: '## Reviews\n- Review within one business day.\n- Be kind, be specific.\n- Approve only what you understand.\n',
      },
      {
        title: 'Shipping Safely',
        lessonType: 'text',
        bodyMd: 'Small PRs. Tests first. Deploy behind flags when risky.',
      },
    ],
  },
];

async function courseExists(title: string): Promise<boolean> {
  const { data } = await sb.from('lms_courses').select('id').eq('title', title).maybeSingle();
  return !!data;
}

async function seedCourse(c: CourseSeed) {
  if (await courseExists(c.title)) {
    console.log(`• "${c.title}" already exists — skipping`);
    return;
  }

  const { data: course, error: ce } = await sb
    .from('lms_courses')
    .insert({
      title:        c.title,
      description:  c.description,
      scope:        c.scope,
      department:   c.scope === 'department' ? c.department ?? null : null,
      is_published: 1,
      enforcement:  c.enforcement,
      sort_order:   c.sortOrder,
    })
    .select('id')
    .single();
  if (ce || !course) throw new Error(`insert course "${c.title}": ${ce?.message ?? 'no row'}`);

  let order = 0;
  for (const l of c.lessons) {
    const { data: lesson, error: le } = await sb
      .from('lms_lessons')
      .insert({
        course_id:              course.id,
        title:                  l.title,
        lesson_type:            l.lessonType,
        body_md:                l.bodyMd ?? null,
        video_source:           l.videoSource ?? null,
        video_url:              l.videoUrl ?? null,
        video_duration_seconds: l.videoDurationSeconds ?? null,
        sort_order:             order++,
      })
      .select('id')
      .single();
    if (le || !lesson) throw new Error(`insert lesson "${l.title}": ${le?.message ?? 'no row'}`);

    if (l.quiz) {
      const { data: quiz, error: qe } = await sb
        .from('lms_quizzes')
        .insert({ lesson_id: lesson.id, pass_score: l.quiz.passScore })
        .select('id')
        .single();
      if (qe || !quiz) throw new Error(`insert quiz for "${l.title}": ${qe?.message ?? 'no row'}`);

      let qOrder = 0;
      for (const q of l.quiz.questions) {
        const { error: qqe } = await sb.from('lms_quiz_questions').insert({
          quiz_id:       quiz.id,
          prompt:        q.prompt,
          question_type: q.questionType,
          choices:       q.choices,
          correct_keys:  q.correctKeys,
          sort_order:    qOrder++,
        });
        if (qqe) throw new Error(`insert question: ${qqe.message}`);
      }
    }
  }
  console.log(`✓ "${c.title}" (${c.scope}) — ${c.lessons.length} lessons, published`);
}

async function main() {
  console.log('Seeding sample LMS content…\n');
  for (const c of COURSES) await seedCourse(c);
  console.log('\nDone. Visit /learning (as any user) and /admin/learning to manage.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
