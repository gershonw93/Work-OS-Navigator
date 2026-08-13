-- ===== 073_per_item_markup.sql =====
-- Markup per cost item, for cost-plus billing.
--
-- The fee used to be one flat percentage multiplied across everything billed:
--   feeEarned = vendorBilled * contractor_fee_pct
-- That is not how cost-plus is actually billed. The electrician invoices
-- $35,000, you add your 15% and bill the client $40,250 - item by item. And
-- some items are not marked up at all: a permit fee, a deposit the client paid
-- direct, something you agreed to pass through at cost. With one flat rate the
-- only way to handle those was to fudge the percentage for the whole job.
--
-- NULL markup_pct means "use the project rate", so changing the project rate
-- still moves everything that has not been given its own answer. Storing 0
-- would be a different statement - it would mean "zero on this one" and would
-- stop following the project.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS markup_pct numeric(6, 3);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS markup_excluded boolean NOT NULL DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS markup_note text;

-- Receipts are cost too, and get marked up the same way on a cost-plus job.
ALTER TABLE material_purchases ADD COLUMN IF NOT EXISTS markup_pct numeric(6, 3);
ALTER TABLE material_purchases ADD COLUMN IF NOT EXISTS markup_excluded boolean NOT NULL DEFAULT false;
