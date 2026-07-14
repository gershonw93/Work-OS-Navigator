-- ===== 053_company_billing_defaults.sql =====
-- Account-level defaults that pre-fill new projects, so a company sets its
-- normal way of billing once instead of per job.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS default_billing_mode text NOT NULL DEFAULT 'simple'
  CHECK (default_billing_mode IN ('simple', 'aia'));
ALTER TABLE companies ADD COLUMN IF NOT EXISTS default_retainage_pct numeric(6, 3) NOT NULL DEFAULT 10;
