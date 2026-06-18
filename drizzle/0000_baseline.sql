CREATE TABLE "attendance" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"week_start" text NOT NULL,
	"monday_status" text,
	"tuesday_status" text,
	"wednesday_status" text,
	"thursday_status" text,
	"friday_status" text,
	"saturday_status" text,
	"sunday_status" text,
	"notes" text,
	"submitted_at" text,
	"edited_by" integer,
	"edited_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" integer NOT NULL,
	"action" text NOT NULL,
	"target_user_id" integer,
	"details" jsonb,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "briefings" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"stats" jsonb NOT NULL,
	"narrative" text,
	"model" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"generated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"generated_by" integer,
	CONSTRAINT "briefings_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"position" text,
	"source" text,
	"status" text DEFAULT 'applied' NOT NULL,
	"rating" integer,
	"notes" text,
	"linkedin_url" text,
	"resume_url" text,
	"location" text,
	"website" text,
	"summary" text,
	"skills" jsonb,
	"experience" jsonb,
	"education" jsonb,
	"certifications" jsonb,
	"languages" jsonb,
	"parsed_at" text,
	"assigned_to" integer,
	"is_public_talent" boolean DEFAULT false NOT NULL,
	"consent_status" text DEFAULT 'none' NOT NULL,
	"consent_token" text,
	"consent_requested_at" text,
	"consent_agreed_at" text,
	"consent_agreed_ip" text,
	"consent_method" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_drafts" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_title" text NOT NULL,
	"source_type" text NOT NULL,
	"source_content" text NOT NULL,
	"outputs" jsonb NOT NULL,
	"model" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE "cycles" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"archived" integer DEFAULT 0 NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#6b7280' NOT NULL,
	CONSTRAINT "labels_project_name_unique" UNIQUE("project_id","name")
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"company" text,
	"stage" text DEFAULT 'new' NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"assigned_to" integer,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms_certificates" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"course_id" integer NOT NULL,
	"issued_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"pdf_path" text,
	"serial" text NOT NULL,
	CONSTRAINT "lms_certificates_serial_unique" UNIQUE("serial"),
	CONSTRAINT "lms_certificates_user_course_unique" UNIQUE("user_id","course_id")
);
--> statement-breakpoint
CREATE TABLE "lms_course_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"course_id" integer NOT NULL,
	"due_at" text,
	"assigned_by" integer,
	"assigned_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"last_reminded_at" text,
	CONSTRAINT "lms_course_assignments_user_course_unique" UNIQUE("user_id","course_id")
);
--> statement-breakpoint
CREATE TABLE "lms_courses" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"scope" text NOT NULL,
	"department" text,
	"cover_image_url" text,
	"is_published" integer DEFAULT 0 NOT NULL,
	"enforcement" text DEFAULT 'soft' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms_lesson_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"lesson_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"body" text NOT NULL,
	"parent_id" integer,
	"pinned" integer DEFAULT 0 NOT NULL,
	"deleted_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms_lesson_completions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"lesson_id" integer NOT NULL,
	"completed_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "lms_lesson_completions_user_lesson_unique" UNIQUE("user_id","lesson_id")
);
--> statement-breakpoint
CREATE TABLE "lms_lessons" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_id" integer NOT NULL,
	"title" text NOT NULL,
	"lesson_type" text DEFAULT 'text' NOT NULL,
	"body_md" text,
	"video_source" text,
	"video_url" text,
	"video_duration_seconds" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms_quiz_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"quiz_id" integer NOT NULL,
	"answers" jsonb NOT NULL,
	"score" integer NOT NULL,
	"passed" integer NOT NULL,
	"started_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"submitted_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms_quiz_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"quiz_id" integer NOT NULL,
	"prompt" text NOT NULL,
	"question_type" text NOT NULL,
	"choices" jsonb NOT NULL,
	"correct_keys" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms_quizzes" (
	"id" serial PRIMARY KEY NOT NULL,
	"lesson_id" integer NOT NULL,
	"pass_score" integer DEFAULT 70 NOT NULL,
	"max_attempts" integer,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "lms_quizzes_lesson_id_unique" UNIQUE("lesson_id")
);
--> statement-breakpoint
CREATE TABLE "overtime_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"week_start" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"requested_at" text DEFAULT CURRENT_TIMESTAMP,
	"decided_by" integer,
	"decided_at" text,
	"approved_until" text
);
--> statement-breakpoint
CREATE TABLE "presence_pings" (
	"id" text PRIMARY KEY NOT NULL,
	"from_user_id" integer NOT NULL,
	"from_name" text NOT NULL,
	"from_role" text NOT NULL,
	"from_team" text,
	"from_photo_url" text,
	"to_user_id" integer NOT NULL,
	"message" text NOT NULL,
	"response_message" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" text NOT NULL,
	"deadline_at" text NOT NULL,
	"acknowledged_at" text,
	"missed_at" text,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "project_members_unique" UNIQUE("project_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "project_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" text NOT NULL,
	"group" text NOT NULL,
	"color" text DEFAULT '#6b7280' NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"team" text,
	"network" integer DEFAULT 2 NOT NULL,
	"next_sequence" integer DEFAULT 1 NOT NULL,
	"archived" integer DEFAULT 0 NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "projects_identifier_unique" UNIQUE("identifier")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"project_id" integer,
	"name" text NOT NULL,
	"filters" jsonb NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "status_drafts" (
	"id" serial PRIMARY KEY NOT NULL,
	"week_start" text NOT NULL,
	"stats" jsonb NOT NULL,
	"draft" text,
	"model" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"generated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"generated_by" integer,
	CONSTRAINT "status_drafts_week_start_unique" UNIQUE("week_start")
);
--> statement-breakpoint
CREATE TABLE "timesheets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"clocked_in_at" text NOT NULL,
	"clocked_out_at" text,
	"duration_seconds" integer,
	"is_overtime" integer DEFAULT 0 NOT NULL,
	"overtime_seconds" integer,
	"overtime_consent_until" text,
	"notes" text,
	"date" text NOT NULL,
	"edited_by" integer,
	"edited_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"team" text,
	"job_title" text,
	"member_code" text,
	"hourly_rate_usd" numeric(10, 2),
	"is_active" integer DEFAULT 1 NOT NULL,
	"is_onboarding" integer DEFAULT 0 NOT NULL,
	"reminder_enabled" integer DEFAULT 1 NOT NULL,
	"reminder_interval_minutes" integer DEFAULT 120 NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "weekly_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"week_start" text NOT NULL,
	"client_engagements" text,
	"risks" text,
	"ideas" text,
	"submitted_at" text,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "work_item_activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_item_id" integer NOT NULL,
	"actor_id" integer NOT NULL,
	"action" text NOT NULL,
	"from_value" text,
	"to_value" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_item_assignees" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_item_id" integer NOT NULL,
	"user_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_item_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_item_id" integer NOT NULL,
	"author_id" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_item_labels" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_item_id" integer NOT NULL,
	"label_id" integer NOT NULL,
	CONSTRAINT "work_item_labels_unique" UNIQUE("work_item_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "work_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"sequence_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"priority" text DEFAULT 'none' NOT NULL,
	"state_id" integer,
	"cycle_id" integer,
	"parent_id" integer,
	"target_date" text,
	"completed_at" text,
	"archived" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "work_items_project_seq_unique" UNIQUE("project_id","sequence_id")
);
--> statement-breakpoint
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_certificates" ADD CONSTRAINT "lms_certificates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_certificates" ADD CONSTRAINT "lms_certificates_course_id_lms_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."lms_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_course_assignments" ADD CONSTRAINT "lms_course_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_course_assignments" ADD CONSTRAINT "lms_course_assignments_course_id_lms_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."lms_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_course_assignments" ADD CONSTRAINT "lms_course_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_courses" ADD CONSTRAINT "lms_courses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_lesson_comments" ADD CONSTRAINT "lms_lesson_comments_lesson_id_lms_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lms_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_lesson_comments" ADD CONSTRAINT "lms_lesson_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_lesson_completions" ADD CONSTRAINT "lms_lesson_completions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_lesson_completions" ADD CONSTRAINT "lms_lesson_completions_lesson_id_lms_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lms_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_lessons" ADD CONSTRAINT "lms_lessons_course_id_lms_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."lms_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_quiz_attempts" ADD CONSTRAINT "lms_quiz_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_quiz_attempts" ADD CONSTRAINT "lms_quiz_attempts_quiz_id_lms_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."lms_quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_quiz_questions" ADD CONSTRAINT "lms_quiz_questions_quiz_id_lms_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."lms_quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_quizzes" ADD CONSTRAINT "lms_quizzes_lesson_id_lms_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lms_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presence_pings" ADD CONSTRAINT "presence_pings_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presence_pings" ADD CONSTRAINT "presence_pings_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_states" ADD CONSTRAINT "project_states_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_activity" ADD CONSTRAINT "work_item_activity_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_activity" ADD CONSTRAINT "work_item_activity_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_assignees" ADD CONSTRAINT "work_item_assignees_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_assignees" ADD CONSTRAINT "work_item_assignees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_comments" ADD CONSTRAINT "work_item_comments_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_comments" ADD CONSTRAINT "work_item_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_labels" ADD CONSTRAINT "work_item_labels_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_labels" ADD CONSTRAINT "work_item_labels_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_state_id_project_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."project_states"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "presence_pings_from_created_idx" ON "presence_pings" USING btree ("from_user_id","created_at");--> statement-breakpoint
CREATE INDEX "presence_pings_to_created_idx" ON "presence_pings" USING btree ("to_user_id","created_at");--> statement-breakpoint
CREATE INDEX "presence_pings_status_deadline_idx" ON "presence_pings" USING btree ("status","deadline_at");