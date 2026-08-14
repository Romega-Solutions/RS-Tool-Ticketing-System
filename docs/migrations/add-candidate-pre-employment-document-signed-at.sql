-- Run if add-candidate-pre-employment-documents.sql was already applied.
ALTER TABLE candidate_pre_employment_documents
  ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;
