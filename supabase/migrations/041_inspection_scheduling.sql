-- ===== 041_inspection_scheduling.sql =====
-- Inspection request → schedule → result workflow. A site manager or sub requests
-- an inspection and assigns who should schedule it; that person is notified, and
-- the requester is notified back when it's scheduled and when it passes/fails.

ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS trade text,
  ADD COLUMN IF NOT EXISTS completed_date date,
  ADD COLUMN IF NOT EXISTS inspector_name text,
  ADD COLUMN IF NOT EXISTS inspector_phone text,
  ADD COLUMN IF NOT EXISTS scheduling_phone text,
  ADD COLUMN IF NOT EXISTS card_image_url text,
  ADD COLUMN IF NOT EXISTS ready_marked_by text,
  ADD COLUMN IF NOT EXISTS ready_marked_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_time text,               -- preferred/confirmed time of day
  ADD COLUMN IF NOT EXISTS requested_by_id uuid REFERENCES profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requested_by_name text,
  ADD COLUMN IF NOT EXISTS scheduler_profile_id uuid REFERENCES profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scheduler_name text;

-- Allow the full set of workflow statuses.
ALTER TABLE inspections DROP CONSTRAINT IF EXISTS inspections_status_check;
