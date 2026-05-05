-- Run this in Supabase → SQL Editor → New query

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  role          TEXT NOT NULL,
  team          TEXT,
  job_title     TEXT,
  plane_member_id TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS timesheets (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL,
  clocked_in_at    TEXT NOT NULL,
  clocked_out_at   TEXT,
  duration_seconds INTEGER,
  date             TEXT NOT NULL,
  created_at       TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS weekly_reports (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL,
  week_start          TEXT NOT NULL,
  client_engagements  TEXT,
  risks               TEXT,
  ideas               TEXT,
  submitted_at        TEXT,
  updated_at          TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, week_start)
);

CREATE TABLE IF NOT EXISTS attendance (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL,
  week_start        TEXT NOT NULL,
  monday_status     TEXT,
  tuesday_status    TEXT,
  wednesday_status  TEXT,
  thursday_status   TEXT,
  friday_status     TEXT,
  notes             TEXT,
  submitted_at      TEXT,
  created_at        TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, week_start)
);

-- Seed users (ken = password123, mark = password123)
-- Passwords are bcrypt hashes — regenerate with scripts/seed.ts if needed
INSERT INTO users (username, password_hash, name, email, role, team, is_active) VALUES
  ('ken',  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Ken Garcia',  'ken@romega.solutions',  'admin', 'Core',  1),
  ('mark', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Mark Siazon', 'mark@romega.solutions', 'lead',  'Core',  1)
ON CONFLICT (username) DO NOTHING;
