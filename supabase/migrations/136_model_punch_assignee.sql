-- Who a house model's punch item goes to.
--
-- A punch item on a model becomes a task on every house the model is applied
-- to, and a task with nobody on it reads "Unassigned" thirty times over. So
-- the model can say who does it, once: a teammate, a sub from the Directory,
-- or just a name.
--
-- NOT a roster id. `project_team_members` is per job, and a model belongs to
-- the development, not to any one house - so a teammate is stored as their
-- PROFILE and turned into that house's roster row when the model is applied.
--
-- The name rides beside the id, as on `project_task_assignees`: SET NULL
-- leaves a row that still says who it was for, and a typed name has no id at
-- all.

ALTER TABLE site_model_items
  ADD COLUMN IF NOT EXISTS assignee_profile_id uuid REFERENCES profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assignee_company_id uuid REFERENCES companies (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assignee_name text;
