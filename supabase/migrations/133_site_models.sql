-- House models: "30 houses, three models - upload each model's plans once,
-- and say which houses get which." A model belongs to a SITE (the group of
-- houses Bulk Add makes) and carries what every house of that model needs:
-- a budget template, its plan sets (left / right / either garage side), the
-- inspections it requires and its punch items. Applying it COPIES them into
-- each chosen house, because houses drift (a change order on lot 12, pins on a
-- plan tied to that house's own tasks), and every copy remembers where it came
-- from so applying again adds only what is missing.

CREATE TABLE IF NOT EXISTS site_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- A model is a fact about its group; it goes with the group.
  site_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  name text NOT NULL,
  -- The template outlives nothing here: deleting it just unsets the link.
  budget_template_id uuid REFERENCES budget_templates (id) ON DELETE SET NULL,
  created_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_site_model_name ON site_models (site_id, lower(name));
ALTER TABLE site_models ENABLE ROW LEVEL SECURITY;

-- Which model a house is. Deleting the model leaves the house, unassigned.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS model_id uuid REFERENCES site_models (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_projects_model ON projects (model_id) WHERE model_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS site_model_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES site_models (id) ON DELETE CASCADE,
  name text NOT NULL,
  plan_type text NOT NULL DEFAULT 'architectural',
  -- 'any' goes to every house; 'left'/'right' only to houses whose garage is
  -- on that side. A house with no garage side set gets neither, and is told.
  handing text NOT NULL DEFAULT 'any' CHECK (handing IN ('any', 'left', 'right')),
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE site_model_plans ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS site_model_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES site_models (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('inspection', 'punch')),
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE site_model_items ENABLE ROW LEVEL SECURITY;

-- project_plans has carried folder_id and storage_path on the live database
-- with no migration behind them; written down here so a fresh install has
-- them too. Plus where a copied plan came from.
ALTER TABLE project_plans ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES plan_folders (id) ON DELETE SET NULL;
ALTER TABLE project_plans ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE project_plans ADD COLUMN IF NOT EXISTS source_model_plan_id uuid REFERENCES site_model_plans (id) ON DELETE SET NULL;

-- A punch item is a task with a kind, so it gets assignees, due dates, photos
-- and plan pins for free. 'task' is every task that exists today.
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'task';
DO $$ BEGIN
  ALTER TABLE project_tasks ADD CONSTRAINT project_tasks_kind_check CHECK (kind IN ('task', 'punch'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS source_model_item_id uuid REFERENCES site_model_items (id) ON DELETE SET NULL;
