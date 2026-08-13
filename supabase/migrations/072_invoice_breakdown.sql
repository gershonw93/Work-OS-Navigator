-- ===== 072_invoice_breakdown.sql =====
-- Keep an invoice's breakdown, not just its total.
--
-- The scan already reads line items, subtotal, tax and retainage off the
-- document and then threw all of it away, storing a single `amount`. So the
-- most useful question about an invoice - what am I actually being charged for?
-- - could only be answered by opening the PDF, and the quote check could only
-- run at the moment of scanning, never afterwards.
--
-- line_items is [{ description, qty, unit, unit_price, amount }]; the same
-- shape subcontracts already use for quoted lines, so the two compare directly.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS line_items jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subtotal numeric(15, 2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax numeric(15, 2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS retainage numeric(15, 2);

-- The quote comparison as it stood when the invoice was recorded. Kept rather
-- than recomputed so the card still shows what was flagged at the time, even
-- after the contract is revised by a change order.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS quote_check jsonb;
