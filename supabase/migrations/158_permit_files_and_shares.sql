-- 158: A permit's paperwork lives on the permit, and goes out from it.
--
-- Two gaps found the first time the rounds were used:
--   * the corrections list is a punch list, and a punch-list item is finished
--     by a FILE (the revised site plan, the energy calc) - which had nowhere to
--     go but the next submission;
--   * the Sharing link is how a permit set reaches an expeditor and how the
--     approved permit comes back, but a share knew nothing about the permit it
--     was for, so what came back sat in the Sharing tab instead of the permit's
--     history.

-- The file(s) that close an item. [{ name, url, type, size }], same shape as a
-- round's files, so the resubmission can carry them without translating.
ALTER TABLE permit_items ADD COLUMN IF NOT EXISTS files jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Which permit a share was sent from. SET NULL: the share is a record of what
-- went to somebody outside the company and outlives the permit row.
ALTER TABLE file_shares ADD COLUMN IF NOT EXISTS permit_id uuid REFERENCES permits (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_file_shares_permit ON file_shares (permit_id) WHERE permit_id IS NOT NULL;
