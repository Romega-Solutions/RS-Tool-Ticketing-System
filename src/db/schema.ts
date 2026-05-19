import { sql } from 'drizzle-orm';
import { pgTable, text, integer, serial, jsonb, numeric } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id:            serial('id').primaryKey(),
  username:      text('username').notNull().unique(),
  passwordHash:  text('password_hash').notNull(),
  name:          text('name').notNull(),
  email:         text('email').notNull().unique(),
  role:          text('role').notNull(),
  team:          text('team'),
  jobTitle:      text('job_title'),
  planeMemberId: text('plane_member_id'),
  hourlyRateUsd: numeric('hourly_rate_usd', { precision: 10, scale: 2 }),
  isActive:               integer('is_active').notNull().default(1),
  reminderEnabled:        integer('reminder_enabled').notNull().default(1),
  reminderIntervalMinutes: integer('reminder_interval_minutes').notNull().default(120),
  createdAt:              text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt:              text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const timesheets = pgTable('timesheets', {
  id:              serial('id').primaryKey(),
  userId:          integer('user_id').notNull(),
  clockedInAt:     text('clocked_in_at').notNull(),
  clockedOutAt:    text('clocked_out_at'),
  durationSeconds: integer('duration_seconds'),
  isOvertime:      integer('is_overtime').notNull().default(0),
  overtimeSeconds: integer('overtime_seconds'),
  notes:           text('notes'),
  date:            text('date').notNull(),
  createdAt:       text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const weeklyReports = pgTable('weekly_reports', {
  id:                serial('id').primaryKey(),
  userId:            integer('user_id').notNull(),
  weekStart:         text('week_start').notNull(),
  clientEngagements: text('client_engagements'),
  risks:             text('risks'),
  ideas:             text('ideas'),
  submittedAt:       text('submitted_at'),
  updatedAt:         text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const candidates = pgTable('candidates', {
  id:             serial('id').primaryKey(),
  fullName:       text('full_name').notNull(),
  email:          text('email'),
  phone:          text('phone'),
  position:       text('position'),
  source:         text('source'),
  status:         text('status').notNull().default('applied'),
  rating:         integer('rating'),
  notes:          text('notes'),
  linkedinUrl:    text('linkedin_url'),
  resumeUrl:      text('resume_url'),
  // Resume-parsed fields (populated by n8n + Claude)
  location:       text('location'),
  website:        text('website'),
  summary:        text('summary'),
  skills:         jsonb('skills'),
  experience:     jsonb('experience'),
  education:      jsonb('education'),
  certifications: jsonb('certifications'),
  languages:      jsonb('languages'),
  parsedAt:       text('parsed_at'),
  assignedTo:     integer('assigned_to'),
  createdAt:      text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt:      text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const leads = pgTable('leads', {
  id:         serial('id').primaryKey(),
  name:       text('name').notNull(),
  email:      text('email'),
  company:    text('company'),
  stage:      text('stage').notNull().default('new'),
  value:      integer('value').notNull().default(0),
  notes:      text('notes'),
  assignedTo: integer('assigned_to'),
  createdAt:  text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt:  text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const briefings = pgTable('briefings', {
  id:          serial('id').primaryKey(),
  date:        text('date').notNull().unique(),
  stats:       jsonb('stats').notNull(),
  narrative:   text('narrative'),
  model:       text('model'),
  tokensIn:    integer('tokens_in'),
  tokensOut:   integer('tokens_out'),
  generatedAt: text('generated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  generatedBy: integer('generated_by'),
});

export const statusDrafts = pgTable('status_drafts', {
  id:          serial('id').primaryKey(),
  weekStart:   text('week_start').notNull().unique(),
  stats:       jsonb('stats').notNull(),
  draft:       text('draft'),
  model:       text('model'),
  tokensIn:    integer('tokens_in'),
  tokensOut:   integer('tokens_out'),
  generatedAt: text('generated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  generatedBy: integer('generated_by'),
});

export const contentDrafts = pgTable('content_drafts', {
  id:           serial('id').primaryKey(),
  sourceTitle:  text('source_title').notNull(),
  sourceType:   text('source_type').notNull(),
  sourceContent:text('source_content').notNull(),
  outputs:      jsonb('outputs').notNull(),
  model:        text('model'),
  tokensIn:     integer('tokens_in'),
  tokensOut:    integer('tokens_out'),
  createdAt:    text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  createdBy:    integer('created_by'),
});

export const attendance = pgTable('attendance', {
  id:              serial('id').primaryKey(),
  userId:          integer('user_id').notNull(),
  weekStart:       text('week_start').notNull(),
  mondayStatus:    text('monday_status'),
  tuesdayStatus:   text('tuesday_status'),
  wednesdayStatus: text('wednesday_status'),
  thursdayStatus:  text('thursday_status'),
  fridayStatus:    text('friday_status'),
  saturdayStatus:  text('saturday_status'),
  sundayStatus:    text('sunday_status'),
  notes:           text('notes'),
  submittedAt:     text('submitted_at'),
  createdAt:       text('created_at').default(sql`CURRENT_TIMESTAMP`),
});
