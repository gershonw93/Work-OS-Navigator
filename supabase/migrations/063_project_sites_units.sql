-- ===== 063_project_sites_units.sql =====
-- Bulk creation produced a flat pile of projects with addresses built by string
-- concatenation ("95 Edgecomb Ave Unit 3"). Two things were wrong with that:
--
--   1. Nothing tied the 40 units of one building together, so the projects list
--      was 40 unrelated rows and there was no way to see the building's total.
--   2. The unit was baked into the address text, which made the address
--      ungeocodable - bulk projects never got coordinates and never appeared on
--      the map.
--
-- Fix both by giving a project a parent and pulling unit/floor out of the
-- address. A "site" is an ordinary projects row flagged is_site: it holds the
-- one real, geocoded building address and its children hold the work. Every
-- existing project keeps parent_project_id NULL and is_site false, so nothing
-- about single-project creation changes.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS parent_project_id uuid REFERENCES projects (id) ON DELETE SET NULL;

-- A container: the building/subdivision itself. Holds the address, client,
-- plans and permits; the budget and schedule live on the children.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS is_site boolean NOT NULL DEFAULT false;

-- Kept separate from `address` so the address stays a clean, geocodable string
-- and every unit in a building can share the building's coordinates.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS floor text;

CREATE INDEX IF NOT EXISTS idx_projects_parent ON projects (parent_project_id)
  WHERE parent_project_id IS NOT NULL;
