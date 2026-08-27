-- ─────────────────────────────────────────────────────────────────────────────
-- One record, one QuickBooks record. Even when the button is pressed twice.
--
-- The push guard was a read: "does this row have a qbo_id yet? no? push." Two
-- requests arriving together both read null before either wrote, and both
-- created. It happened within a day of shipping - one invoice sent at
-- 17:44:38.345 produced QuickBooks invoices 291 AND 292, 100ms apart, and the
-- row kept only the second. 291 became an orphan receivable: money the client
-- appears to owe, that no payment will ever settle.
--
-- A check-then-act guard cannot fix that; the check and the act have to be one
-- statement. `qbo_claimed_at` is claimed by a conditional UPDATE, which
-- Postgres serialises - exactly one caller comes back with a row.
--
-- Stale claims expire (see lib/quickbooks-push.ts) so a push that dies
-- mid-flight does not lock a record out of QuickBooks forever.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE client_invoices ADD COLUMN IF NOT EXISTS qbo_claimed_at timestamptz;
ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS qbo_claimed_at timestamptz;
ALTER TABLE invoices        ADD COLUMN IF NOT EXISTS qbo_claimed_at timestamptz;

COMMENT ON COLUMN client_invoices.qbo_claimed_at IS
  'Set atomically before a QuickBooks push to stop two concurrent pushes both creating. Cleared on failure; treated as expired after a couple of minutes so a crashed push self-heals.';
