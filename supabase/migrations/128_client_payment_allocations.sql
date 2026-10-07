-- ===== 128_client_payment_allocations.sql =====
-- Which client invoices a payment pays, and how much of it went to each.
--
-- WHY. A payment could name ONE invoice (`client_payments.client_invoice_id`),
-- and pressing Mark paid set that invoice to `paid` whatever amount was typed.
-- So $5,000 against a $10,000 invoice read "Paid" here while QuickBooks -
-- which applies the payment's real amount - still showed $5,000 owed, and one
-- cheque covering two invoices could not be recorded at all.
--
-- THIS TABLE IS THE ONE HOME FOR THE LINK. Every payment that named an invoice
-- is copied in below, for its whole amount (which is what it applied before),
-- and `client_payments.client_invoice_id` is no longer read or written. It is
-- left in place rather than dropped so a deploy still running the old code for
-- a minute does not fail every payment it records.
--
-- CASCADE BOTH WAYS. A row is a fact about one payment and one invoice and means
-- nothing without either: delete the payment and its split goes with it, and
-- only a DRAFT invoice can be deleted, which nothing can have paid.

CREATE TABLE IF NOT EXISTS client_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES client_payments (id) ON DELETE CASCADE,
  client_invoice_id uuid NOT NULL REFERENCES client_invoices (id) ON DELETE CASCADE,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- One share per invoice per payment. Two rows for the same pair would be the
  -- same money counted against the invoice twice.
  UNIQUE (payment_id, client_invoice_id)
);
CREATE INDEX IF NOT EXISTS idx_client_payment_allocations_invoice
  ON client_payment_allocations (client_invoice_id);
-- Reached only by the server with the service key, like every other table.
ALTER TABLE client_payment_allocations ENABLE ROW LEVEL SECURITY;

INSERT INTO client_payment_allocations (payment_id, client_invoice_id, amount)
SELECT p.id, p.client_invoice_id, p.amount
  FROM client_payments p
 WHERE p.client_invoice_id IS NOT NULL
   AND p.amount > 0
ON CONFLICT (payment_id, client_invoice_id) DO NOTHING;

COMMENT ON COLUMN client_payments.client_invoice_id IS
  'DEPRECATED by 128 - read client_payment_allocations. Kept only so old code mid-deploy does not fail; nothing reads or writes it.';
