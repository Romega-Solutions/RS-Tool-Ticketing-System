-- Rollback for drizzle/0019_positions_employment_type_check.sql.
-- Removes the CHECK only; no data changes. Rows set to 'contractual' or
-- 'internship' stay as they are (old app code shows them as "Full time").
ALTER TABLE public.positions DROP CONSTRAINT IF EXISTS positions_employment_type_check;
