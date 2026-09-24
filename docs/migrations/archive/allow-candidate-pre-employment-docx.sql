-- Run this if the candidate-pre-employment-docs bucket already exists.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]
WHERE id = 'candidate-pre-employment-docs';
