# Learning Management System (LMS) — Implementation Plan

## Context

Romega Solutions onboards interns and full-time hires across multiple departments. Today, foundation training and department-specific knowledge transfer happen ad-hoc (Slack/Drive/word of mouth). We're adding an in-app LMS so every signed-in user gets a "My Learning" tab listing the Foundation courses (org-wide) and their Department courses (auto-matched by `users.team`), and Admin/CEO can author and manage that content from inside the app.

**Design decisions confirmed with user:**

- **Content:** lessons can be *text-only* (markdown), *video-only*, or *mixed* — text lessons are first-class peers of video lessons, not a fallback. Video lessons use either a YouTube URL or an uploaded `.mp4` (Supabase Storage).
- **Audience:** everyone in the org. Foundation auto-assigned to all; Department courses auto-assigned via `users.team`; **Intern** courses auto-assigned to users whose normalized role is `intern`.
- **Authoring:** Admin/CEO only (i.e. `canAccessAdmin(role)`).
- **Completion gate per lesson:**
  - *Text-only:* Mark Complete enabled immediately on open.
  - *Video lesson:* Mark Complete disabled until the video reaches end (YouTube IFrame `onEnded` or native `<video> ended`).
  - *Mixed:* both gates apply — video must end AND user must click Mark Complete.
  - *Lesson with a quiz attached:* must pass the quiz before Mark Complete records (overrides the buttons above).
- **Quizzes:** optional per lesson — multiple choice + true/false; configurable pass score; multiple attempts allowed.
- **Certificates:** auto-generated PDF when a user completes 100% of a course's lessons. Surfaced on a "My Certificates" page; admin sees who is certified.
- **Cohorts / due dates:** courses can be assigned with a `due_at` to individual users or whole audiences; n8n cron triggers reminder emails 7d/3d/1d before due, and again on overdue.
- **Discussion:** per-lesson comment thread, visible to all enrolled learners; admin can pin/delete.
- **Enforcement:** two modes, configurable per course (`enforcement = 'soft' | 'hard'`).
  - *Soft:* surfaced as a card on dashboard and sidebar nav; never blocks routing (default).
  - *Hard:* if a Foundation or Intern course marked `enforcement='hard'` is incomplete for a user whose `users.is_onboarding = 1`, `proxy.ts` redirects them to `/learning` for that course until done. Existing staff (`is_onboarding=0`) are never hard-gated.

Stack alignment with [[project_stack_direction]]: pure Supabase + Next.js 16 + Drizzle. No new external dependency required (YouTube IFrame API is a script tag).

---

## Database

One new migration: `drizzle/0012_lms.sql` plus matching tables in `src/db/schema.ts`. **Eight new tables.** Assignment is mostly derived from `scope + users.team + role`, but `lms_course_assignments` exists for per-user overrides and due dates.

### `lms_courses`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| title | text NOT NULL | |
| description | text | optional summary |
| scope | text NOT NULL | `'foundation'` \| `'department'` \| `'intern'` |
| department | text | required when scope=`department`; matches `users.team` |
| cover_image_url | text | optional, signed URL |
| is_published | integer NOT NULL DEFAULT 0 | published toggle |
| enforcement | text NOT NULL DEFAULT 'soft' | `'soft'` \| `'hard'` |
| sort_order | integer NOT NULL DEFAULT 0 | per-scope ordering |
| created_by | uuid → users.id | |
| created_at, updated_at | timestamps | default `now()` |

Constraint: `CHECK (scope IN ('foundation','department','intern'))`, `CHECK (scope <> 'department' OR department IS NOT NULL)`, `CHECK (enforcement IN ('soft','hard'))`.
Index: `(scope, department, is_published)` for the learner index query.

### `lms_lessons`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| course_id | uuid → lms_courses.id ON DELETE CASCADE | |
| title | text NOT NULL | |
| lesson_type | text NOT NULL DEFAULT 'text' | `'text'` \| `'video'` \| `'mixed'` — drives the player UI |
| body_md | text | written lesson content; nullable for video-only |
| video_source | text | `'youtube'` \| `'upload'` \| NULL |
| video_url | text | YouTube full URL or storage path inside `learning-content` bucket |
| video_duration_seconds | integer | optional; informational |
| sort_order | integer NOT NULL DEFAULT 0 | |
| created_at, updated_at | timestamps | |

Constraint: `CHECK (lesson_type IN ('text','video','mixed'))`, `CHECK (lesson_type='text' OR video_url IS NOT NULL)` — video/mixed must have a video.
Index: `(course_id, sort_order)`.

### `lms_lesson_completions`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid → users.id ON DELETE CASCADE | |
| lesson_id | uuid → lms_lessons.id ON DELETE CASCADE | |
| completed_at | timestamptz NOT NULL DEFAULT now() | |

Unique: `(user_id, lesson_id)`. Index: `(user_id)`.

### `lms_quizzes` (optional per lesson)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| lesson_id | uuid → lms_lessons.id ON DELETE CASCADE UNIQUE | one quiz per lesson |
| pass_score | integer NOT NULL DEFAULT 70 | percentage 0–100 |
| max_attempts | integer | NULL = unlimited |
| created_at, updated_at | timestamps | |

### `lms_quiz_questions`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| quiz_id | uuid → lms_quizzes.id ON DELETE CASCADE | |
| prompt | text NOT NULL | |
| question_type | text NOT NULL | `'multiple_choice'` \| `'true_false'` |
| choices | jsonb NOT NULL | array `[{key:'a', text:'…'}, …]`; for true/false: `[{key:'true'},{key:'false'}]` |
| correct_keys | jsonb NOT NULL | array of correct keys (supports multi-answer MC) |
| sort_order | integer NOT NULL DEFAULT 0 | |

Index: `(quiz_id, sort_order)`.

### `lms_quiz_attempts`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid → users.id ON DELETE CASCADE | |
| quiz_id | uuid → lms_quizzes.id ON DELETE CASCADE | |
| answers | jsonb NOT NULL | `{ questionId: [chosenKeys] }` |
| score | integer NOT NULL | 0–100 |
| passed | integer NOT NULL | 0/1 |
| started_at, submitted_at | timestamptz | |

Index: `(user_id, quiz_id, submitted_at DESC)`.

### `lms_certificates`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid → users.id ON DELETE CASCADE | |
| course_id | uuid → lms_courses.id ON DELETE CASCADE | |
| issued_at | timestamptz NOT NULL DEFAULT now() | |
| pdf_path | text | storage path inside `learning-content` bucket, `certificates/{userId}/{courseId}.pdf` |
| serial | text NOT NULL UNIQUE | human-readable cert number, e.g. `RS-LMS-2026-000123` |

Unique: `(user_id, course_id)`.

### `lms_course_assignments` (per-user overrides + due dates)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid → users.id ON DELETE CASCADE | |
| course_id | uuid → lms_courses.id ON DELETE CASCADE | |
| due_at | timestamptz | nullable |
| assigned_by | uuid → users.id | admin who assigned |
| assigned_at | timestamptz NOT NULL DEFAULT now() | |
| last_reminded_at | timestamptz | tracked by the reminder cron to avoid double-sending |

Unique: `(user_id, course_id)`. Two assignment models coexist: derived (scope+team+role) for the default list, and explicit rows here for per-user due dates or special assignments.

### `lms_lesson_comments`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| lesson_id | uuid → lms_lessons.id ON DELETE CASCADE | |
| user_id | uuid → users.id ON DELETE CASCADE | |
| body | text NOT NULL | plain text; render with basic markdown |
| parent_id | uuid → lms_lesson_comments.id ON DELETE CASCADE | nullable; for one-level replies |
| pinned | integer NOT NULL DEFAULT 0 | admin-pinned |
| deleted_at | timestamptz | soft-delete (admin moderation) |
| created_at | timestamptz NOT NULL DEFAULT now() | |

Index: `(lesson_id, created_at)`.

### Supabase Storage
Add a third bucket `learning-content` (private), following the pattern of `candidate-resumes` and `onboarder-docs` in `src/lib/storage.ts`. Two path schemes:
- Videos: `lessons/{lessonId}/video.{ext}`
- Certificates: `certificates/{userId}/{courseId}.pdf`

Upload via admin client; serve via 1-year signed URL (same TTL as resumes).

---

## Routes & files

```
src/app/(app)/
  learning/
    page.tsx                              ← learner index: Foundation + Intern + Department
    certificates/page.tsx                 ← "My Certificates" list + PDF download links
    [courseId]/
      page.tsx                            ← course detail: lesson list w/ checkmarks + due date
      [lessonId]/
        page.tsx                          ← lesson viewer (server component shell)
        lesson-player.client.tsx          ← text + video player + Mark Complete
        quiz.client.tsx                   ← quiz UI (shown when lms_quizzes row exists)
        comments.client.tsx               ← discussion thread
    actions.ts                            ← markLessonComplete, submitQuizAttempt, postComment, deleteComment
  admin/
    learning/
      page.tsx                            ← course list (admin)
      new/page.tsx                        ← create course
      [courseId]/
        page.tsx                          ← edit course + lessons list + assignments + dues
        lessons/[lessonId]/page.tsx       ← edit lesson (type, text, video, quiz editor)
        roster/page.tsx                   ← who completed what + cert status
        assign/page.tsx                   ← assign with due dates to individuals
      actions.ts                          ← admin CRUD + uploadLessonVideo + assignCourse + pinComment

src/app/api/lms/
  reminders/route.ts                      ← GET, CRON_SECRET-guarded, picks due-soon/overdue assignments and POSTs to n8n webhook
  certificates/[id]/route.ts              ← GET, streams signed-URL redirect for the PDF

src/components/lms/
  course-card.tsx                         ← cover, title, progress bar, due-date badge
  progress-bar.tsx
  youtube-player.client.tsx               ← YouTube IFrame API wrapper, fires onEnded
  upload-video-player.client.tsx          ← native <video>, fires onEnded
  text-lesson.tsx                         ← markdown renderer for text-only lessons
  quiz-runner.client.tsx                  ← question-by-question quiz UI
  quiz-editor.client.tsx                  ← admin: question CRUD
  certificate-pdf.ts                      ← server-side PDF generation (use pdf-lib; small dep)
  learning-banner.tsx                     ← dashboard reminder card
  discussion-thread.client.tsx            ← comment list + reply box

src/db/schema.ts                          ← add 8 new tables
src/lib/storage.ts                        ← add LEARNING_BUCKET + uploadLessonVideo + uploadCertificate helpers
src/lib/lms.ts                            ← shared selectors: visibleCoursesFor(user), courseProgress(user, courseId), isOverdue(assignment)
src/lib/rbac.ts                           ← add /admin/learning to canAccessPath
src/components/app-sidebar.tsx            ← add 3 nav items: My Learning, My Certificates, Manage Learning
src/proxy.ts                              ← optional hard-enforce redirect for is_onboarding=1 + hard course incomplete
drizzle/0012_lms.sql                      ← migration (all 8 tables in one migration)
```

**New dependency:** `pdf-lib` (~80kb, ESM, no native build) for certificate PDF generation. Alternative would be calling the existing n8n webhook to render a PDF, but a pure-JS dep keeps the cert path self-contained.

---

## Server actions

Mirror the recruiting/candidates pattern (`requireSession()` → role check → mutation → return result). All admin actions guard with `canAccessAdmin(session.role)` and throw 403 otherwise.

**`src/app/(app)/learning/actions.ts`** (any signed-in user)
- `markLessonComplete(lessonId)` — guarded: if a quiz exists for the lesson, refuse unless the user has a `passed=1` attempt; otherwise insert into `lms_lesson_completions` with `ON CONFLICT DO NOTHING`. After insert, check if the course is now 100% complete → call `issueCertificate(userId, courseId)` (idempotent on the unique constraint).
- `submitQuizAttempt(quizId, answers)` — grades against `correct_keys`, stores attempt, returns `{score, passed}`. If `passed`, queues a follow-up `markLessonComplete` for the parent lesson.
- `postComment(lessonId, body, parentId?)` — inserts into `lms_lesson_comments`.
- `deleteOwnComment(commentId)` — soft delete; only the author.

**`src/app/(app)/admin/learning/actions.ts`** (admin only — `canAccessAdmin(role)`)
- Courses: `createCourse`, `updateCourse`, `deleteCourse`, `togglePublishCourse`, `setEnforcement(courseId, 'soft'|'hard')`.
- Lessons: `createLesson`, `updateLesson` (handles `lesson_type` transitions), `deleteLesson`, `reorderLessons`.
- Video: `uploadLessonVideo(lessonId, file)` → `learning-content` bucket; `setYoutubeVideo(lessonId, url)`.
- Quiz: `upsertQuiz(lessonId, passScore, maxAttempts)`, `createQuestion`, `updateQuestion`, `deleteQuestion`, `reorderQuestions`.
- Assignments: `assignCourse(courseId, userIds[], dueAt?)` — bulk insert into `lms_course_assignments` with conflict do update; `unassignCourse(courseId, userId)`.
- Certificates: `issueCertificate(userId, courseId)` — internal helper called from `markLessonComplete`; renders PDF via `certificate-pdf.ts`, uploads to bucket, inserts row. Idempotent.
- Comments moderation: `pinComment(commentId, pinned)`, `adminDeleteComment(commentId)`.

Validation via zod schemas at the top of each actions file (same pattern recruiting uses).

---

## RBAC additions

In `src/lib/rbac.ts` → `canAccessPath()`:
- `/learning` and `/learning/certificates` — open to all signed-in users.
- `/admin/learning` — gate with `canAccessAdmin(role)`.

Plus a new helper `hasIncompleteHardCourse(userId): Promise<{ courseId, slug } | null>` in `src/lib/lms.ts`, used by the proxy when hard enforcement is on.

---

## Sidebar

In `src/components/app-sidebar.tsx` `navItems`:
```ts
{ href: '/learning', label: 'My Learning', icon: GraduationCap, category: 'main' }
{ href: '/learning/certificates', label: 'My Certificates', icon: Award, category: 'main' }
{ href: '/admin/learning', label: 'Manage Learning', icon: BookOpen, category: 'admin' }
```
The existing `category: 'admin'` filter (`canAccessAdmin(role)`) already gates the manage entry. The learner entries are visible to everyone.

---

## Lesson player & completion gate

`<LessonPlayer>` is the top-level client component on a lesson page. It branches on `lesson.lesson_type`:

- `'text'` → render markdown via `<TextLesson body={lesson.body_md} />` (uses `react-markdown` — confirm during impl whether the project already has a renderer; if not, install). Mark Complete enabled immediately.
- `'video'` → render `<YouTubePlayer>` or `<UploadVideoPlayer>` based on `video_source`. Mark Complete disabled until `onEnded` fires.
- `'mixed'` → render both text + video; Mark Complete disabled until `onEnded`.

**YouTube** (`youtube-player.client.tsx`):
- Load `https://www.youtube.com/iframe_api` once via a script tag (memoized on `window.YT`).
- Instantiate `new YT.Player(...)` against a `<div ref={...}>`.
- Subscribe to `onStateChange`; when `event.data === YT.PlayerState.ENDED` (0), call `onWatchedToEnd()`.

**Upload** (`upload-video-player.client.tsx`):
- Plain `<video controls src={signedUrl} onEnded={onWatchedToEnd} />`.

**Quiz integration:** if the lesson has a `lms_quizzes` row, `<LessonPlayer>` swaps the Mark Complete button for `<QuizRunner>`. The Mark Complete server action is only fired automatically by `submitQuizAttempt` on a passing attempt.

**Trust model:** client-trusted on the video gate (this is internal staff tooling). Quiz grading is server-side — the action looks up `correct_keys` and computes the score; the client never sees the answer key.

---

## Quizzes

Quizzes are **optional and per-lesson**. A lesson without a `lms_quizzes` row behaves exactly as before (Mark Complete based on video/text gate). Quiz UI:

- Admin opens the lesson editor → "Quiz" tab → enables it (creates the `lms_quizzes` row) → adds questions one at a time via `<QuizEditor>`. Each question has a prompt, type (`multiple_choice` / `true_false`), choices, and correct keys.
- Learner sees questions rendered one at a time by `<QuizRunner>`. On submit, the action grades server-side, stores the attempt, and returns `{score, passed}`. If passed → lesson auto-marked complete. If failed → show score + which questions were wrong (but NOT the right answers), allow retry unless `max_attempts` hit.

Grading logic in `submitQuizAttempt`: for each question, the user's chosen keys are compared to `correct_keys` as a set; all-correct = 1 point. Score = `(correctCount / totalQuestions) * 100`, rounded. Pass = `score >= quiz.pass_score`.

---

## Certificates

Auto-issued by `markLessonComplete` when a user's completion count for a course equals the course's lesson count. The helper `issueCertificate(userId, courseId)`:

1. Acquire idempotency via the unique `(user_id, course_id)` constraint — do nothing if already issued.
2. Generate the PDF via `src/components/lms/certificate-pdf.ts` using `pdf-lib`. Layout: RS logo top-center, "Certificate of Completion", learner name (full name + member_code), course title, issue date, signature placeholder for the CEO, and a serial like `RS-LMS-2026-000123`. Source the RS brand colors (`--rs-primary-500` for accents) from existing tokens.
3. Upload to `learning-content` bucket at `certificates/{userId}/{courseId}.pdf` via the admin client.
4. Insert a `lms_certificates` row.
5. Revalidate `/learning/certificates`.

**Download route:** `GET /api/lms/certificates/[id]` — verifies the requesting session owns the cert (or is admin), generates a fresh 1y signed URL, redirects to it.

**Serial generation:** `RS-LMS-{YYYY}-{6-digit zero-padded sequence}`. The sequence is a Postgres `SEQUENCE lms_certificate_serial` created in the migration; the action calls `SELECT nextval(...)` inside the same transaction as the insert.

---

## Cohorts, due dates, and reminders

`lms_course_assignments` stores per-user overrides — primarily used for setting due dates. Derived assignments (Foundation/Department/Intern) don't need rows here unless a due date is set.

**Admin assignment UI** (`/admin/learning/[courseId]/assign`):
- Multi-select of users (with team and role badges) + optional due-date picker → `assignCourse(courseId, userIds, dueAt)` bulk-inserts.
- Bulk presets: "All Foundation audience" (skip — already auto-assigned), "All interns due in 30 days", "Whole Recruitment team due in 14 days".

**Reminder cron** (`GET /api/lms/reminders`):
- Guarded by `CRON_SECRET` (header check — pattern already established per [[project_prod_audit_fixes]]).
- Selects assignments where `due_at` is within 7d / 3d / 1d / overdue *and* the user has not completed the course *and* `last_reminded_at` is not within the same window.
- For each, POST to the n8n reminder webhook (env var `N8N_LMS_REMINDER_WEBHOOK_URL`) with `{ userId, email, courseTitle, dueAt, daysRemaining }`. n8n sends the email.
- Update `last_reminded_at`.
- Scheduled via Vercel Cron in `vercel.json` (or `vercel.ts` per the platform update) — daily at 09:00 PHT.

---

## Discussion / comments

Per-lesson thread, rendered as `<DiscussionThread>` under the lesson body. Two levels deep (top-level comments + one level of replies). Markdown rendering for the comment body uses the same `react-markdown` setup as lessons. Pinned comments float to the top. Admin can soft-delete any comment (sets `deleted_at`); authors can soft-delete their own.

No real-time updates in MVP — `revalidatePath` on the lesson route after each post. Could be upgraded to Supabase Realtime later but YAGNI for now.

---

## Hard enforcement

Opt-in per course via `lms_courses.enforcement = 'hard'`. Only applies to learners whose `users.is_onboarding = 1` — never blocks regularized staff or admins.

`src/proxy.ts` addition (placed *after* the existing access checks, before the response):

```ts
if (session?.isOnboarding && !pathname.startsWith('/learning')) {
  const blockingCourse = await hasIncompleteHardCourse(session.id);
  if (blockingCourse) {
    return NextResponse.redirect(new URL(`/learning/${blockingCourse.courseId}`, request.url));
  }
}
```

`hasIncompleteHardCourse(userId)` returns the first published `enforcement='hard'` course (Foundation or Intern, in that priority) whose lesson completion count for this user is less than its total lesson count. Returns `null` once all hard courses are done.

**Safety:** admins are never affected (their `is_onboarding` is 0). To prevent accidental lockout during testing, the proxy also bypasses if `pathname.startsWith('/api/')` or `/login` or `/logout`.

---

## UI shape

**`/learning` (learner index):** Up to three sections in this order — *Foundation* (always shown), *Intern Track* (only if the user's normalized role is `intern`), *[user's team] Department* (only if the user has a `team`). Each course card shows cover image, title, progress bar, an "Overdue" or "Due in X days" badge if an assignment row exists, and a Continue / Start button. Hard-enforced courses get a red "Required" badge.

**`/learning/certificates`:** Grid of issued certificates with course title, issue date, serial, and a Download button hitting `/api/lms/certificates/[id]`.

**`/learning/[courseId]`:** Header with course title + description + due date if any, then a vertical list of lessons in `sort_order`. Each row shows a green checkmark + lesson type icon (📄 text, ▶ video, 📋 quiz). Click → lesson page.

**`/learning/[courseId]/[lessonId]`:** Lesson title, body markdown (for `text` and `mixed`), video player (for `video` and `mixed`), then either a Mark Complete button or `<QuizRunner>` if a quiz exists. Below that, `<DiscussionThread>`. Prev / Next lesson links at the bottom.

**`/admin/learning`:** Table of all courses — columns Title, Scope, Department, Enforcement (soft/hard badge), Lessons, Published, Created. "New Course" button. Inline publish + enforcement toggles.

**`/admin/learning/[courseId]`:** Course metadata form (title, description, scope selector `Foundation`/`Department`/`Intern`, department dropdown enabled only when scope=`Department` and populated from distinct `users.team` values, cover image upload, publish toggle, enforcement toggle). Lessons table below with drag-to-reorder via `@dnd-kit`. Tabs to Roster and Assign.

**`/admin/learning/[courseId]/lessons/[lessonId]`:** Lesson editor — title, lesson-type selector (`Text` / `Video` / `Mixed`), markdown textarea, video source radio (`YouTube URL` vs `Upload .mp4`), corresponding input, optional duration field. Quiz tab embeds `<QuizEditor>`: pass-score input, max-attempts input, and a list of questions with add/edit/delete/reorder.

**`/admin/learning/[courseId]/roster`:** Table of users (audience derived from scope — all active users if `Foundation`, users where `normalizeRole(role)='intern'` if `Intern`, users where `team = course.department` if `Department`, plus any explicit `lms_course_assignments` rows). Columns Name, Email, % complete, Best quiz score (if quizzes), Certified (✓/—), Due date, Last activity.

**`/admin/learning/[courseId]/assign`:** Multi-select user picker (with team and role filters) + due-date picker + "Assign" button. Existing assignments listed with edit/remove.

**Dashboard learning card:** `<LearningBanner />` on `/dashboard` and `/my-tasks` showing incomplete soft courses with progress; hard-enforced incomplete courses for onboarding users render a separate red "Required training" card.

---

## Verification

After implementation, run end-to-end:

1. **Migration & schema**
   - `npx drizzle-kit generate` produces `0012_lms.sql` matching the manual SQL.
   - `npx drizzle-kit migrate` applies cleanly.
   - In Supabase, confirm all 8 tables exist with foreign keys, the `lms_certificate_serial` sequence exists, and the `learning-content` bucket exists.
2. **Lint & build:** `npm run verify` (lint + build) passes.
3. **Admin flow (sign in as CEO):**
   - Create a Foundation course with three lessons: one *text-only*, one *video* (YouTube URL), one *mixed* (text + uploaded `.mp4`). Publish it. Leave enforcement = soft.
   - Attach a 3-question multiple-choice quiz to the video lesson with pass score 70.
   - Create a Department course scoped to `team='Recruitment'` with one text lesson. Publish, enforcement = soft.
   - Create an Intern course with one text lesson + one quiz lesson. Publish, enforcement = **hard**.
   - Assign the Foundation course to one specific user with a due date 3 days out.
4. **Learner flow — non-intern IC with `team='Recruitment'`, `is_onboarding=0`:**
   - `/learning` shows Foundation + Recruitment Department courses; Intern course NOT visible.
   - Text lesson: Mark Complete is enabled immediately; click; checkmark appears.
   - Video lesson: Mark Complete disabled until video ends, then quiz appears; fail once, retry, pass, lesson auto-completes.
   - Mixed lesson: Mark Complete disabled until uploaded `.mp4` ends.
   - On the third completion, a certificate row + PDF are auto-created; `/learning/certificates` lists it; clicking Download streams the PDF via the signed URL.
   - Post a comment on the video lesson; refresh; comment persists. Soft-delete own comment; deleted state shows.
5. **Intern flow — user where `normalizeRole(role)='intern'`, `is_onboarding=1`:**
   - On login, proxy redirects them straight to the Intern course (hard enforcement). They cannot navigate to `/dashboard` until it's complete.
   - Complete all Intern lessons (incl. passing the quiz). Subsequent navigation works normally.
   - `/learning/certificates` shows the Intern course certificate.
6. **Cross-role check:**
   - Different department user (non-intern): Recruitment department course AND Intern course both NOT visible.
   - Sign in as admin → `/admin/learning` reachable, all CRUD works. Sign in as IC → `/admin/learning` redirects to default landing.
7. **Soft enforcement check:** Foundation incomplete → dashboard shows `<LearningBanner>`; nothing is blocked for a non-onboarding user.
8. **Reminder cron:** Hit `GET /api/lms/reminders` with the `CRON_SECRET` header. Verify it picks up the 3-day-out assignment and posts to the n8n webhook (mock the webhook to a `httpbin` or `webhook.site` URL for testing). Verify `last_reminded_at` updates so a second call does nothing.
9. **Quiz security:** Inspect the network response of `submitQuizAttempt` — confirm `correct_keys` is never sent to the client.

---

## Out of scope (still deferred)

- **SCORM / xAPI import** — no external course-content standard support.
- **Live cohorts with scheduled sessions** — no calendar / event integration in this slice.
- **Drag-and-drop quiz question import / CSV upload** — admin must add questions one at a time.
- **In-app real-time notifications** — comments and reminders go via existing email/n8n, not the in-app toast system.
- **Per-question shuffling / question banks** — questions render in `sort_order` for every attempt.

---

## Phasing recommendation

The expanded scope is roughly a 3–4 week build. I recommend shipping in three PR-sized phases so each is independently usable and reviewable:

**Phase 1 — Core LMS (Foundation/Department/Intern + text/video lessons + completion + soft enforcement)**
- 3 tables: `lms_courses`, `lms_lessons`, `lms_lesson_completions`.
- All learner pages, all admin CRUD pages except quiz/assign/cert.
- Sidebar nav, `<LearningBanner>`.
- Verification steps 1–4 (excluding quiz/cert parts) + 6 + 7.

**Phase 2 — Quizzes + Certificates**
- Add `lms_quizzes`, `lms_quiz_questions`, `lms_quiz_attempts`, `lms_certificates`, the serial sequence, the `learning-content` certs path.
- `<QuizEditor>`, `<QuizRunner>`, `certificate-pdf.ts`, `/learning/certificates`, download API route, `pdf-lib` dep.
- Verification step 4 quiz parts + step 9.

**Phase 3 — Cohorts/Reminders + Discussion + Hard enforcement**
- Add `lms_course_assignments`, `lms_lesson_comments`.
- Assign page, reminder cron route, n8n webhook env var.
- `<DiscussionThread>`, comment moderation.
- Proxy hard-enforcement gate.
- Verification steps 5 + 8.

Each phase ends with `npm run verify` + the relevant verification steps, then commits behind a single descriptive subject line per [[feedback_commit_style]].
