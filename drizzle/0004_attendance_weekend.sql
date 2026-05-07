ALTER TABLE attendance
ADD COLUMN IF NOT EXISTS saturday_status text;

ALTER TABLE attendance
ADD COLUMN IF NOT EXISTS sunday_status text;
