CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"network" integer NOT NULL DEFAULT 2,
	"next_sequence" integer NOT NULL DEFAULT 1,
	"archived" integer NOT NULL DEFAULT 0,
	"created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updated_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "projects_identifier_unique" UNIQUE("identifier")
);
--> statement-breakpoint
CREATE TABLE "project_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" text NOT NULL,
	"group" text NOT NULL,
	"color" text NOT NULL DEFAULT '#6b7280',
	"sequence" integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "work_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"sequence_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"priority" text NOT NULL DEFAULT 'none',
	"state_id" integer,
	"target_date" text,
	"completed_at" text,
	"created_by" integer,
	"created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updated_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "work_item_assignees" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_item_id" integer NOT NULL,
	"member_key" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_states" ADD CONSTRAINT "project_states_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "project_states"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "work_item_assignees" ADD CONSTRAINT "work_item_assignees_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_project_seq_unique" UNIQUE("project_id","sequence_id");
