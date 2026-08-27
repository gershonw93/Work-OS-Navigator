-- ─────────────────────────────────────────────────────────────────────────────
-- Client invoices become receivables in QuickBooks.
--
-- Until now QuickBooks only heard about money when it ARRIVED, as a Sales
-- Receipt (a sale and its payment in one record). An invoice you raised and
-- were waiting on appeared nowhere - the books showed cash in, never money
-- owed. That is cash-basis, and it is why "will a new invoice show up in QB?"
-- had the answer "no, not even when it's paid - only the payment does".
--
-- THE RULE THAT SHAPES THIS: a sale must not be counted twice. A Sales Receipt
-- already means sold AND paid. Once an invoice exists in QuickBooks, the
-- payment that settles it must be a Payment applied against it, never a second
-- Sales Receipt - otherwise every job's revenue doubles.
--
-- `qbo_txn_type` records which model wrote a payment row. The receipts pushed
-- before this migration stay valid history; this column is what lets anybody
-- reading the ledger later tell the two eras apart instead of guessing.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE client_invoices  ADD COLUMN IF NOT EXISTS qbo_id text;
ALTER TABLE client_invoices  ADD COLUMN IF NOT EXISTS qbo_synced_at timestamptz;
ALTER TABLE client_payments  ADD COLUMN IF NOT EXISTS qbo_txn_type text;

-- Everything already in QuickBooks got there as a Sales Receipt.
UPDATE client_payments
   SET qbo_txn_type = 'sales_receipt'
 WHERE qbo_id IS NOT NULL AND qbo_txn_type IS NULL;

COMMENT ON COLUMN client_invoices.qbo_id IS
  'QuickBooks Invoice id. Set when the invoice is sent - a draft is not a receivable.';
COMMENT ON COLUMN client_payments.qbo_txn_type IS
  'Which QuickBooks record this payment became: sales_receipt (standalone, incl. deposits with no invoice to settle) or payment (applied against a QBO Invoice). Never both - that would double-count the sale.';
