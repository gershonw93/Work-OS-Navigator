-- ===== 055_rfi_answer_link.sql =====
-- One-time answer link for an RFI: the GC sends it to the architect/designer,
-- who can read the question + attachments and submit the answer with no
-- account, exactly like compliance document requests.

ALTER TABLE rfis ADD COLUMN IF NOT EXISTS answer_token text;
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS answer_requested_name text;
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS answer_requested_email text;
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS answer_link_created_at timestamptz;
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS response_attachments jsonb;
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS responded_by_name text;
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS responded_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rfis_answer_token ON rfis (answer_token) WHERE answer_token IS NOT NULL;
