-- ===== 049_company_roles.sql =====
-- Company-level role customization: edit what a standard role (Project
-- Manager, Office Staff, etc.) can do, or create a brand new user class from
-- scratch. One row per (company, role_key); `permissions` is a full
-- resource → {view,create,edit,delete} map, same shape as the hardcoded
-- defaults in lib/permissions.ts.
--   is_custom = false → this row OVERRIDES a built-in role's hardcoded defaults
--   is_custom = true  → this row DEFINES a brand-new role that didn't exist before

CREATE TABLE IF NOT EXISTS company_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies (id) ON DELETE CASCADE,
  role_key text NOT NULL,
  label text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_custom boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_roles_company_key ON company_roles (company_id, role_key);
