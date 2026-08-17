-- ===== 078_setup_dismissals.sql =====
-- Who has hidden the setup checklist on which job.
--
-- It was in localStorage, which is the BROWSER, not the person. Two things
-- wrong with that:
--
--   * hide it on the laptop and it is still there on the phone, because the
--     two browsers know nothing about each other
--   * two people sharing a machine share the dismissal, so one person hiding
--     it takes it away from the other
--
-- Keyed on (user, project) it means what it should: this person, on this job,
-- has seen enough - everywhere they sign in, and nobody else affected.
--
-- Deliberately NOT on the project row. Setup guidance is a per-person thing;
-- an admin who knows the app should not be able to hide the walkthrough from
-- somebody who has just joined.

CREATE TABLE IF NOT EXISTS project_setup_dismissals (
  user_id uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_setup_dismissals_user
  ON project_setup_dismissals (user_id);

COMMENT ON TABLE project_setup_dismissals IS
  'One row per person per job who has hidden the setup checklist. Absence means show it.';
