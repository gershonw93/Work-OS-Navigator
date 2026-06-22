-- Allow milestone-only schedule items (no subcontract required)
ALTER TABLE schedule_items ALTER COLUMN subcontract_id DROP NOT NULL;

-- Add label and color for manual milestones
ALTER TABLE schedule_items ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE schedule_items ADD COLUMN IF NOT EXISTS color TEXT;
