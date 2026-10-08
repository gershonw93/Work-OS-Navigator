-- ===== 129_credit_on_account.sql =====
-- Credit on account: a client payment can hold whatever is not applied to an
-- invoice as the client's credit, to be applied to an invoice later.
--
-- `on_account` is the DECISION, made when the payment is recorded: "keep what
-- is left over as credit". Without it a payment must be applied exactly or be
-- a deposit (a Sales Receipt in QuickBooks), as before - money left over with
-- nowhere declared to go is a typo, not a choice.
--
-- The credit itself is NOT stored. It is the payment's amount minus what its
-- client_payment_allocations rows have applied, so it cannot drift from them,
-- and applying credit later is just another allocation row on that payment.
--
-- In QuickBooks an on-account payment is always a Payment (never a Sales
-- Receipt) with the unapplied remainder left as the customer's credit - the
-- way QuickBooks records it itself. Applying credit later REWRITES that
-- Payment's lines rather than creating a second record. `qbo_reapply_needed`
-- marks a payment whose lines here have moved on from what QuickBooks holds,
-- for the backlog sync to finish when the push could not.

ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS on_account boolean NOT NULL DEFAULT false;
ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS qbo_reapply_needed boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_client_payments_on_account
  ON client_payments (project_id) WHERE on_account;
CREATE INDEX IF NOT EXISTS idx_client_payments_reapply
  ON client_payments (project_id) WHERE qbo_reapply_needed;
