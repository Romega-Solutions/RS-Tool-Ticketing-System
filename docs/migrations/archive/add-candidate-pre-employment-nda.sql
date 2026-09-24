-- Run this only if add-candidate-pre-employment-documents.sql was already applied
-- before NDA was added as a supported document type.
ALTER TABLE candidate_pre_employment_documents
  DROP CONSTRAINT IF EXISTS candidate_pre_employment_documents_kind_check;
ALTER TABLE candidate_pre_employment_documents
  ADD CONSTRAINT candidate_pre_employment_documents_kind_check
  CHECK (kind IN ('sow', 'job_description', 'ai_policy', 'nda'));
