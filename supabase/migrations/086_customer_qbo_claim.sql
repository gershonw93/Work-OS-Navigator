-- Customers push to QuickBooks the moment you add one, instead of appearing
-- lazily the first time somebody happens to invoice them - so the same
-- double-press race the invoices had needs closing here too.
--
-- See lib/quickbooks-push.ts: the claim is a conditional UPDATE, which is the
-- only guard that actually holds when two requests arrive together.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS qbo_claimed_at timestamptz;

COMMENT ON COLUMN customers.qbo_claimed_at IS
  'Set atomically before a QuickBooks push so two concurrent creates cannot both make a Customer. Same mechanism as client_invoices.qbo_claimed_at.';
