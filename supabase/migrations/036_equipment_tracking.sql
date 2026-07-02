-- ===== 036_equipment_tracking.sql =====
-- Equipment / tool tracking: what the company owns, who took it, and where it is.
-- Current holder + location = the equipment's latest OPEN assignment
-- (checked_in_at IS NULL). A NULL project_id means it's back at the shop/yard.

CREATE TABLE IF NOT EXISTS equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies (id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  asset_tag text,
  status text NOT NULL DEFAULT 'available', -- available | checked_out | maintenance | retired
  photo_url text,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equipment_company ON equipment (company_id);

CREATE TABLE IF NOT EXISTS equipment_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid REFERENCES equipment (id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies (id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects (id) ON DELETE SET NULL, -- NULL = shop / yard
  holder_name text,               -- person or crew who has it
  holder_profile_id uuid REFERENCES profiles (id) ON DELETE SET NULL,
  checked_out_at timestamptz DEFAULT now(),
  checked_in_at timestamptz,      -- NULL = still out
  note text,
  created_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equipment_assignments_equipment ON equipment_assignments (equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_assignments_open ON equipment_assignments (equipment_id) WHERE checked_in_at IS NULL;
