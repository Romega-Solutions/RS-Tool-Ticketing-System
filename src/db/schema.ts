import { sql } from 'drizzle-orm';
import { pgTable, text, integer, serial } from 'drizzle-orm/pg-core';

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
  isActive:      integer('is_active').notNull().default(1),
  createdAt:     text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt:     text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const timesheets = pgTable('timesheets', {
  id:              serial('id').primaryKey(),
  userId:          integer('user_id').notNull(),
  clockedInAt:     text('clocked_in_at').notNull(),
  clockedOutAt:    text('clocked_out_at'),
  durationSeconds: integer('duration_seconds'),
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
