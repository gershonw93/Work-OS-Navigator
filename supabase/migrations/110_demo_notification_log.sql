-- A record of every notification sent from the demo control board.
--
-- WHY THIS TABLE EXISTS. The board sends a REAL email and a REAL bell to a
-- REAL person, with copy written to look like a genuine event - that is the
-- whole point of it for a live demo. Which means that six weeks later somebody
-- can ask "why did I get an email about a change order that does not exist",
-- and without this there is no way on earth to answer them.
--
-- It is not an impersonation, so it does not belong in `impersonation_log`:
-- that table answers "who looked at what as whom", and conflating the two
-- would make both harder to read. Two facts, two tables.

CREATE TABLE IF NOT EXISTS demo_notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The super admin who pressed it. SET NULL rather than CASCADE: the record
  -- that a demo mail went out must outlive the account that sent it, which is
  -- exactly when somebody comes asking.
  sent_by UUID REFERENCES profiles (id) ON DELETE SET NULL,
  sent_by_email TEXT,

  -- Who received it. Same rule, and the email is kept as text because that is
  -- the thing a person quotes back at you.
  recipient_id UUID REFERENCES profiles (id) ON DELETE SET NULL,
  recipient_email TEXT,

  notification_type TEXT NOT NULL,
  title TEXT,
  message TEXT,

  -- What ACTUALLY went out, not what was asked for. A preference can silence
  -- the email, and "we sent it" would then be a lie in the audit trail.
  in_app_count INT NOT NULL DEFAULT 0,
  email_count INT NOT NULL DEFAULT 0,
  push_count INT NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demo_notification_log_created ON demo_notification_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_demo_notification_log_recipient ON demo_notification_log (recipient_id);

ALTER TABLE demo_notification_log ENABLE ROW LEVEL SECURITY;
