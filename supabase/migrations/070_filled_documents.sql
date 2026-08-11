-- ===== 070_filled_documents.sql =====
-- Filling a PDF saves a NEW file and never touches the original, so the two
-- need a link between them: which document this was filled from, by whom, and
-- when. Not for legal weight - this fills in text and is deliberately not a
-- signature tool - but so "who typed that number in?" has an answer later.

ALTER TABLE company_files
  ADD COLUMN IF NOT EXISTS filled_from_id uuid REFERENCES company_files (id) ON DELETE SET NULL;
ALTER TABLE company_files
  ADD COLUMN IF NOT EXISTS filled_by text;
ALTER TABLE company_files
  ADD COLUMN IF NOT EXISTS filled_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_company_files_filled_from
  ON company_files (filled_from_id) WHERE filled_from_id IS NOT NULL;
