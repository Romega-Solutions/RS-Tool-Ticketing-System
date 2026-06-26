-- Per-user weekly allotment + work schedule.
-- approved_hours_per_week is the BASE for the overtime allowance/cap (default 15h
-- = unchanged for existing users). schedule_pht_* is the daily PHT work window;
-- the PST/PDT equivalent is derived on render (src/lib/schedule.ts), never stored.
-- Additive + idempotent. Apply via scripts/apply-migration.ts (pooler can't run DDL).
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_hours_per_week integer NOT NULL DEFAULT 15;
ALTER TABLE users ADD COLUMN IF NOT EXISTS schedule_pht_start text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS schedule_pht_end  text;
