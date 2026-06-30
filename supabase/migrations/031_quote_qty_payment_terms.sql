-- Richer quote capture: quantity + unit price per line, payment terms on the
-- project, and a company-level default payment terms (for GCs and subs).
ALTER TABLE budget_line_items
  ADD COLUMN IF NOT EXISTS quantity NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(14, 2);
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS payment_terms TEXT;
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS default_payment_terms TEXT;
