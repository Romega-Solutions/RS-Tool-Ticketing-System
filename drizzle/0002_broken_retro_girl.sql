CREATE TABLE "timesheet_edit_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"timesheet_id" integer,
	"date" text NOT NULL,
	"current_clock_in" text,
	"current_clock_out" text,
	"requested_clock_in" text,
	"requested_clock_out" text,
	"reason" text NOT NULL,
	"document_path" text,
	"document_name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"decided_by" integer,
	"decided_at" text,
	"decision_comment" text
);
