-- Sub's own job is quote-driven: upload a quote (AI-scanned into line items),
-- then convert Quote/Pending → Active. Line items live in budget_line_items
-- and carry a progress % used by the Progress view.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS quote_file_url TEXT,
  ADD COLUMN IF NOT EXISTS quote_file_name TEXT,
  ADD COLUMN IF NOT EXISTS quote_total NUMERIC(14, 2);
ALTER TABLE budget_line_items
  ADD COLUMN IF NOT EXISTS progress_pct NUMERIC(5, 2) NOT NULL DEFAULT 0;
