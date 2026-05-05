-- Run this in Supabase → SQL Editor → New query

CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  username       TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  role           TEXT NOT NULL,
  team           TEXT,
  job_title      TEXT,
  plane_member_id TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  UNIQUE (user_id, week_start)
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
  UNIQUE (user_id, week_start)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Demo users  (all passwords = Demo@1234)
-- Hash: $2b$10$DTOKt60D2dzQF8MPAEfrP.YVSeDIlpB3/1LeAnuYjKMIocxLgxq0C
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO users (username, password_hash, name, email, role, team, job_title, is_active) VALUES

  -- CEO / Admin
  ('ceo',       '$2b$10$DTOKt60D2dzQF8MPAEfrP.YVSeDIlpB3/1LeAnuYjKMIocxLgxq0C',
   'Ken Garcia',       'ken@romega-solutions.com',    'ceo',   NULL,       'Chief Executive Officer',  1),

  -- IC Leads
  ('lead_tech', '$2b$10$DTOKt60D2dzQF8MPAEfrP.YVSeDIlpB3/1LeAnuYjKMIocxLgxq0C',
   'Mark Siazon',      'mark@romega-solutions.com',   'lead',  'Tech',     'Tech Lead',                1),

  ('lead_design','$2b$10$DTOKt60D2dzQF8MPAEfrP.YVSeDIlpB3/1LeAnuYjKMIocxLgxq0C',
   'Anna Reyes',       'anna@romega-solutions.com',   'lead',  'Design',   'Design Lead',              1),

  -- Tech ICs
  ('ic_john',   '$2b$10$DTOKt60D2dzQF8MPAEfrP.YVSeDIlpB3/1LeAnuYjKMIocxLgxq0C',
   'John Santos',      'john@romega-solutions.com',   'ic',    'Tech',     'Software Engineer',        1),

  ('ic_miguel', '$2b$10$DTOKt60D2dzQF8MPAEfrP.YVSeDIlpB3/1LeAnuYjKMIocxLgxq0C',
   'Miguel Cruz',      'miguel@romega-solutions.com', 'ic',    'Tech',     'Frontend Developer',       1),

  ('ic_sofia',  '$2b$10$DTOKt60D2dzQF8MPAEfrP.YVSeDIlpB3/1LeAnuYjKMIocxLgxq0C',
   'Sofia Lim',        'sofia@romega-solutions.com',  'ic',    'Tech',     'QA Engineer',              1),

  -- Design ICs
  ('ic_trisha', '$2b$10$DTOKt60D2dzQF8MPAEfrP.YVSeDIlpB3/1LeAnuYjKMIocxLgxq0C',
   'Trisha Mendoza',   'trisha@romega-solutions.com', 'ic',    'Design',   'UI/UX Designer',           1),

  ('ic_rafael', '$2b$10$DTOKt60D2dzQF8MPAEfrP.YVSeDIlpB3/1LeAnuYjKMIocxLgxq0C',
   'Rafael Aquino',    'rafael@romega-solutions.com', 'ic',    'Design',   'Graphic Designer',         1)

ON CONFLICT (username) DO NOTHING;
