-- ===== 052_project_billing_mode.sql =====
-- How a project bills, chosen when the job is set up. Decides which money flow
-- shows so a job isn't cluttered with both:
--   'simple' -> regular invoices + client payments/escrow (residential, small)
--   'aia'    -> AIA progress billing / pay applications (commercial, big jobs)

ALTER TABLE projects ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'simple'
  CHECK (billing_mode IN ('simple', 'aia'));
ALTER TABLE projects ADD COLUMN IF NOT EXISTS default_retainage_pct numeric(6, 3) NOT NULL DEFAULT 10;
