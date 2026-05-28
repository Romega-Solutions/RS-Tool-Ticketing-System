-- LMS — Learning Management System (all 3 phases of tables).
-- Phase 1 ships the first three tables (courses, lessons, completions) live
-- in the UI; the remaining tables exist but are unused until Phases 2 + 3
-- land. Apply via Supabase SQL Editor — see docs/migrations/add-lms.sql.

CREATE TABLE IF NOT EXISTS "lms_courses" (
  "id"               serial PRIMARY KEY,
  "title"            text NOT NULL,
  "description"      text,
  "scope"            text NOT NULL,
  "department"       text,
  "cover_image_url"  text,
  "is_published"     integer NOT NULL DEFAULT 0,
  "enforcement"      text NOT NULL DEFAULT 'soft',
  "sort_order"       integer NOT NULL DEFAULT 0,
  "created_by"       integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"       text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lms_courses_scope_chk"       CHECK ("scope" IN ('foundation','department','intern')),
  CONSTRAINT "lms_courses_dept_chk"        CHECK ("scope" <> 'department' OR "department" IS NOT NULL),
  CONSTRAINT "lms_courses_enforcement_chk" CHECK ("enforcement" IN ('soft','hard'))
);
CREATE INDEX IF NOT EXISTS "lms_courses_scope_dept_pub_idx"
  ON "lms_courses" ("scope", "department", "is_published");

CREATE TABLE IF NOT EXISTS "lms_lessons" (
  "id"                     serial PRIMARY KEY,
  "course_id"              integer NOT NULL REFERENCES "lms_courses"("id") ON DELETE CASCADE,
  "title"                  text NOT NULL,
  "lesson_type"            text NOT NULL DEFAULT 'text',
  "body_md"                text,
  "video_source"           text,
  "video_url"              text,
  "video_duration_seconds" integer,
  "sort_order"             integer NOT NULL DEFAULT 0,
  "created_at"             text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"             text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lms_lessons_type_chk" CHECK ("lesson_type" IN ('text','video','mixed')),
  CONSTRAINT "lms_lessons_video_chk" CHECK ("lesson_type" = 'text' OR "video_url" IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS "lms_lessons_course_order_idx" ON "lms_lessons" ("course_id", "sort_order");

CREATE TABLE IF NOT EXISTS "lms_lesson_completions" (
  "id"           serial PRIMARY KEY,
  "user_id"      integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "lesson_id"    integer NOT NULL REFERENCES "lms_lessons"("id") ON DELETE CASCADE,
  "completed_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lms_lesson_completions_user_lesson_unique" UNIQUE ("user_id", "lesson_id")
);
CREATE INDEX IF NOT EXISTS "lms_lesson_completions_user_idx" ON "lms_lesson_completions" ("user_id");

-- ── Phase 2 stub tables ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "lms_quizzes" (
  "id"           serial PRIMARY KEY,
  "lesson_id"    integer NOT NULL UNIQUE REFERENCES "lms_lessons"("id") ON DELETE CASCADE,
  "pass_score"   integer NOT NULL DEFAULT 70,
  "max_attempts" integer,
  "created_at"   text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   text NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "lms_quiz_questions" (
  "id"            serial PRIMARY KEY,
  "quiz_id"       integer NOT NULL REFERENCES "lms_quizzes"("id") ON DELETE CASCADE,
  "prompt"        text NOT NULL,
  "question_type" text NOT NULL,
  "choices"       jsonb NOT NULL,
  "correct_keys"  jsonb NOT NULL,
  "sort_order"    integer NOT NULL DEFAULT 0,
  CONSTRAINT "lms_quiz_questions_type_chk" CHECK ("question_type" IN ('multiple_choice','true_false'))
);
CREATE INDEX IF NOT EXISTS "lms_quiz_questions_quiz_order_idx" ON "lms_quiz_questions" ("quiz_id", "sort_order");

CREATE TABLE IF NOT EXISTS "lms_quiz_attempts" (
  "id"           serial PRIMARY KEY,
  "user_id"      integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "quiz_id"      integer NOT NULL REFERENCES "lms_quizzes"("id") ON DELETE CASCADE,
  "answers"      jsonb NOT NULL,
  "score"        integer NOT NULL,
  "passed"       integer NOT NULL,
  "started_at"   text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submitted_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "lms_quiz_attempts_user_quiz_idx" ON "lms_quiz_attempts" ("user_id", "quiz_id", "submitted_at" DESC);

CREATE TABLE IF NOT EXISTS "lms_certificates" (
  "id"        serial PRIMARY KEY,
  "user_id"   integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "course_id" integer NOT NULL REFERENCES "lms_courses"("id") ON DELETE CASCADE,
  "issued_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "pdf_path"  text,
  "serial"    text NOT NULL UNIQUE,
  CONSTRAINT "lms_certificates_user_course_unique" UNIQUE ("user_id", "course_id")
);

CREATE SEQUENCE IF NOT EXISTS lms_certificate_serial START 1;

-- ── Phase 3 stub tables ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "lms_course_assignments" (
  "id"               serial PRIMARY KEY,
  "user_id"          integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "course_id"        integer NOT NULL REFERENCES "lms_courses"("id") ON DELETE CASCADE,
  "due_at"           text,
  "assigned_by"      integer REFERENCES "users"("id") ON DELETE SET NULL,
  "assigned_at"      text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_reminded_at" text,
  CONSTRAINT "lms_course_assignments_user_course_unique" UNIQUE ("user_id", "course_id")
);

CREATE TABLE IF NOT EXISTS "lms_lesson_comments" (
  "id"         serial PRIMARY KEY,
  "lesson_id"  integer NOT NULL REFERENCES "lms_lessons"("id") ON DELETE CASCADE,
  "user_id"    integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body"       text NOT NULL,
  "parent_id"  integer,
  "pinned"     integer NOT NULL DEFAULT 0,
  "deleted_at" text,
  "created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "lms_lesson_comments_lesson_idx" ON "lms_lesson_comments" ("lesson_id", "created_at");
