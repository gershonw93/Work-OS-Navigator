-- THE FIRST BULK MAIL SYTENAV HAS EVER SENT.
--
-- Every existing send is transactional or a notification: it goes to one person
-- because of something that happened to them. `lib/email.ts` says so in as many
-- words - a signed one-click unsubscribe "is for bulk mail, which this is not".
-- A campaign IS bulk mail, so the way out ships in the same migration as the way
-- in, or the feature does not ship.

-- ── The campaign ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,

  -- A key from SEGMENTS in lib/campaign-audience.ts. Deliberately not a CHECK:
  -- the list lives in code and grows, and a schema that must be migrated to add
  -- an audience is a schema that stops the audience being added. An unknown key
  -- is refused by the route, which reads the code list.
  segment TEXT NOT NULL,
  -- Only for the 'one address' and 'pasted list' segments.
  custom_emails TEXT[],

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed')),
  scheduled_for TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,

  -- WHO SENT IT. Six weeks later somebody asks why they got mail about a
  -- feature they do not use, and a row with nobody against it cannot answer -
  -- the same reason demo_notification_log and a comp both carry a name.
  -- SET NULL, because the record has to outlive the account that sent it.
  created_by UUID REFERENCES profiles (id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON email_campaigns (status, scheduled_for);

ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;

-- ── One row per person, written BEFORE anything is sent ─────────────────────
--
-- Three jobs, and the send does not work without any of them:
--
--   * THE GATE. A unique index is what stops an overlapping cron run mailing
--     somebody twice - the second copy is what gets a person to unsubscribe.
--   * THE RECORD. "Who got this, and when" is the question that arrives, and a
--     count cannot answer it.
--   * RESUMABILITY. A chunk that dies leaves every other row untouched, so the
--     next run picks up exactly what is left. Nothing about a campaign is sent
--     in the request that starts it: a hundred recipients in one serverless
--     invocation is a timeout with half the list mailed and no record of which
--     half.
CREATE TABLE IF NOT EXISTS campaign_recipients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES email_campaigns (id) ON DELETE CASCADE,

  -- SET NULL on the person, and the address kept as text beside it: the record
  -- of what we sent has to outlive the account it went to, which is exactly
  -- when somebody asks about it.
  profile_id UUID REFERENCES profiles (id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  first_name TEXT,
  company_name TEXT,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  -- Why it failed, or why it was skipped. A send that went nowhere with no
  -- reason recorded is unrecoverable from anywhere.
  reason TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_campaign_recipient
  ON campaign_recipients (campaign_id, lower(email));
-- The drain query is always "this campaign, still pending".
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_pending
  ON campaign_recipients (campaign_id, status);

ALTER TABLE campaign_recipients ENABLE ROW LEVEL SECURITY;

-- ── The way out ─────────────────────────────────────────────────────────────
--
-- KEYED ON THE ADDRESS, NOT ON A PROFILE ID, for three reasons that all point
-- the same way: an unsubscribe link has to work from an inbox with no login,
-- the address may not map to a profile at all (a pasted list), and a
-- suppression must outlive the deletion of the account it belonged to. An
-- unsubscribe that a later account deletion quietly undoes is worse than none.
--
-- IT SUPPRESSES BROADCASTS ONLY. `sendEmail` never consults this table - if it
-- did, one unsubscribe would start silently eating invoices, password resets
-- and bid requests. The campaign sender asks it; nothing else does, and that is
-- pinned.
CREATE TABLE IF NOT EXISTS email_suppressions (
  email TEXT PRIMARY KEY,
  -- 'unsubscribed' | 'bounced' | 'complained' | 'manual'
  reason TEXT NOT NULL DEFAULT 'unsubscribed',
  -- Which campaign, or which hand, put them here.
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE email_suppressions ENABLE ROW LEVEL SECURITY;
