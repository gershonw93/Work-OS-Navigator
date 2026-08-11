

-- ===== 067_priced_items.sql =====
-- The other half of the item list.
--
-- 066 gave a package its item_list - the lines the GC sends out. This stores
-- what comes back: the same lines with a unit price against each one, so two
-- quotes on the same package can be compared line for line instead of total
-- against total.

ALTER TABLE bid_submissions ADD COLUMN IF NOT EXISTS priced_items jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS priced_items jsonb NOT NULL DEFAULT '[]'::jsonb;
