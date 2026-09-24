-- Recruitment-owned documents. Run in Supabase SQL Editor.
CREATE TABLE IF NOT EXISTS candidate_pre_employment_documents (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('sow', 'job_description', 'ai_policy', 'nda')),
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  signed_url TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  UNIQUE (candidate_id, kind)
);
ALTER TABLE candidate_pre_employment_documents ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('candidate-pre-employment-docs', 'candidate-pre-employment-docs', false, 10000000, ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO NOTHING;
