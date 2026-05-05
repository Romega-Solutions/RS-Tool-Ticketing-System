import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  role: text('role').notNull(),
  team: text('team'),
  jobTitle: text('job_title'),
  planeMemberId: text('plane_member_id'),
  isActive: integer('is_active').notNull().default(1),
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
});

export const timesheets = sqliteTable('timesheets', {
  id:              integer('id').primaryKey({ autoIncrement: true }),
  userId:          integer('user_id').notNull(),
  clockedInAt:     text('clocked_in_at').notNull(),
  clockedOutAt:    text('clocked_out_at'),
  durationSeconds: integer('duration_seconds'),
  date:            text('date').notNull(),
  createdAt:       text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const weeklyReports = sqliteTable('weekly_reports', {
  id:                 integer('id').primaryKey({ autoIncrement: true }),
  userId:             integer('user_id').notNull(),
  weekStart:          text('week_start').notNull(),          // YYYY-MM-DD Monday
  clientEngagements:  text('client_engagements'),            // JSON [{activity,date,details}]
  risks:              text('risks'),                         // JSON [{description,resolution,escalation}]
  ideas:              text('ideas'),
  submittedAt:        text('submitted_at'),
  updatedAt:          text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const attendance = sqliteTable('attendance', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  weekStart: text('week_start').notNull(),
  mondayStatus: text('monday_status'),
  tuesdayStatus: text('tuesday_status'),
  wednesdayStatus: text('wednesday_status'),
  thursdayStatus: text('thursday_status'),
  fridayStatus: text('friday_status'),
  notes: text('notes'),
  submittedAt: text('submitted_at'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});