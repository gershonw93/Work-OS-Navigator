-- One cheque split across the houses of a development.
--
-- Each house's share is an ordinary client_payments row on that house, so its
-- balance, its invoices' paid status and Funds Received need nothing new. This
-- table is the cheque itself - the amount the bank saw, its date, method and
-- reference - and `client_payments.payment_group_id` ties the shares to it.
--
-- When every share pays invoices already in QuickBooks under one customer, the
-- cheque goes across as ONE QuickBooks Payment (qbo_id here, copied onto each
-- share), so it matches the single deposit on the bank statement.
--
-- CASCADE both ways that matter: deleting the development, or the cheque,
-- takes the shares with it - a share is a fact about this cheque alone.

CREATE TABLE IF NOT EXISTS client_payment_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  development_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  paid_date date,
  method text,
  reference text,
  memo text,
  qbo_id text,
  qbo_synced_at timestamptz,
  qbo_claimed_at timestamptz,
  created_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_payment_groups_development ON client_payment_groups (development_id);
ALTER TABLE client_payment_groups ENABLE ROW LEVEL SECURITY;

ALTER TABLE client_payments
  ADD COLUMN IF NOT EXISTS payment_group_id uuid REFERENCES client_payment_groups (id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_client_payments_group ON client_payments (payment_group_id) WHERE payment_group_id IS NOT NULL;
