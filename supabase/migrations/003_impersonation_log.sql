-- Audit log for platform-owner impersonation ("log in as" for customer support)
CREATE TABLE IF NOT EXISTS impersonation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,          -- the super-admin who impersonated
  actor_email text,
  target_id uuid NOT NULL,         -- the user who was impersonated
  target_email text,
  target_company_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_impersonation_log_actor ON impersonation_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_log_target ON impersonation_log(target_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_log_created ON impersonation_log(created_at DESC);
