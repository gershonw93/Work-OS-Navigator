-- ===== 057_quickbooks.sql =====
-- QuickBooks Online integration, phase 1 (SyteNav -> QBO push).
-- Per-company OAuth2 connection + entity id mapping so we never create
-- duplicates, plus a sync log for visibility/retry. All access is service-role
-- from the API layer; RLS stays on with no policy (deny to the public anon key),
-- matching the rest of the schema. Tokens live here and never touch the client.

CREATE TABLE IF NOT EXISTS quickbooks_connections (
  company_id uuid PRIMARY KEY REFERENCES companies (id) ON DELETE CASCADE,
  realm_id text NOT NULL,                 -- QBO company (realm) id
  qbo_company_name text,
  environment text NOT NULL DEFAULT 'sandbox', -- 'sandbox' | 'production'
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  access_expires_at timestamptz,          -- access token ~1h
  refresh_expires_at timestamptz,         -- refresh token ~100d
  status text NOT NULL DEFAULT 'connected', -- 'connected' | 'expired' | 'revoked'
  connected_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE quickbooks_connections ENABLE ROW LEVEL SECURITY;

-- Short-lived state tokens for the OAuth handshake (CSRF + which company).
CREATE TABLE IF NOT EXISTS quickbooks_oauth_states (
  state text PRIMARY KEY,
  company_id uuid REFERENCES companies (id) ON DELETE CASCADE,
  created_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE quickbooks_oauth_states ENABLE ROW LEVEL SECURITY;

-- What synced, when, and whether it worked - for the Settings sync panel + retry.
CREATE TABLE IF NOT EXISTS quickbooks_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies (id) ON DELETE CASCADE,
  entity_type text NOT NULL,              -- 'customer' | 'vendor' | 'bill' | 'payment'
  entity_id uuid,                         -- the SyteNav row
  direction text NOT NULL DEFAULT 'push', -- future: 'pull'
  action text,                            -- 'create' | 'update'
  status text NOT NULL,                   -- 'success' | 'error'
  qbo_id text,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE quickbooks_sync_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_qbo_sync_log_company ON quickbooks_sync_log (company_id, created_at DESC);

-- Entity id mapping: link each SyteNav row to its QBO counterpart.
ALTER TABLE customers       ADD COLUMN IF NOT EXISTS qbo_id text;
ALTER TABLE customers       ADD COLUMN IF NOT EXISTS qbo_synced_at timestamptz;
ALTER TABLE companies       ADD COLUMN IF NOT EXISTS qbo_vendor_id text;
ALTER TABLE companies       ADD COLUMN IF NOT EXISTS qbo_vendor_synced_at timestamptz;
ALTER TABLE invoices        ADD COLUMN IF NOT EXISTS qbo_id text;
ALTER TABLE invoices        ADD COLUMN IF NOT EXISTS qbo_synced_at timestamptz;
ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS qbo_id text;
ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS qbo_synced_at timestamptz;
