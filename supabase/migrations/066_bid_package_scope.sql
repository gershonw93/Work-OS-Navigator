

-- ===== 066_bid_package_scope.sql =====
-- Every bidder should answer the SAME questions: who supplies the material,
-- what is in scope, what is excluded, and what you need back besides a price.
-- That works with nothing but a set of plans, and it is what actually makes
-- bids comparable. Defaults per trade live in lib/trade-scopes.ts; these
-- columns store what was actually sent.

ALTER TABLE bid_packages ADD COLUMN IF NOT EXISTS package_type text NOT NULL DEFAULT 'turnkey';
ALTER TABLE bid_packages ADD COLUMN IF NOT EXISTS material_by text NOT NULL DEFAULT 'sub';
ALTER TABLE bid_packages ADD COLUMN IF NOT EXISTS included jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bid_packages ADD COLUMN IF NOT EXISTS excluded jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bid_packages ADD COLUMN IF NOT EXISTS ask_for jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bid_packages ADD COLUMN IF NOT EXISTS item_list jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE bid_requests ADD COLUMN IF NOT EXISTS package_type text NOT NULL DEFAULT 'turnkey';
ALTER TABLE bid_requests ADD COLUMN IF NOT EXISTS material_by text NOT NULL DEFAULT 'sub';
ALTER TABLE bid_requests ADD COLUMN IF NOT EXISTS included jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bid_requests ADD COLUMN IF NOT EXISTS excluded jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bid_requests ADD COLUMN IF NOT EXISTS ask_for jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bid_requests ADD COLUMN IF NOT EXISTS item_list jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS company_trade_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies (id) ON DELETE CASCADE,
  trade text NOT NULL,
  package_type text,
  material_by text,
  included jsonb NOT NULL DEFAULT '[]'::jsonb,
  excluded jsonb NOT NULL DEFAULT '[]'::jsonb,
  ask_for jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_trade_scopes_unique
  ON company_trade_scopes (company_id, lower(trade));
