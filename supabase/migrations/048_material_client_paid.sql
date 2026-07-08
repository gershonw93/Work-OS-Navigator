-- ===== 048_material_client_paid.sql =====
-- Track whether the customer already paid for a material purchase directly
-- (e.g. reimbursed the GC, or paid the store themselves), so cost vs. what the
-- client still owes stays accurate.
ALTER TABLE material_purchases
  ADD COLUMN IF NOT EXISTS client_paid boolean NOT NULL DEFAULT false;
