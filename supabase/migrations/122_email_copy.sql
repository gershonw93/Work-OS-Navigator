-- THE WORDS, EDITABLE WITHOUT A DEPLOY - AND NOT A SECOND HOME FOR THEM.
--
-- "One fact, ONE home" is the oldest rule in this repo, and a table of email
-- copy is exactly the shape it warns about: two places that both exist, both
-- compile, and only one of which is what actually sends.
--
-- So this table is never a SOURCE. Every slug has a default written in code
-- (`COPY_SLUGS` in lib/email-copy.ts), that default is what ships, and a row
-- here REPLACES it only while somebody has deliberately put one there. No row
-- is the normal state. Deleting a row is how you go back, and the console has a
-- button for it - a stored copy nobody remembers overriding is how the code
-- version quietly becomes a lie.
--
-- THE RULES ARE NOT IN HERE. When a nudge goes, whether it goes at all, who it
-- reaches - all of that stays in `lib/onboarding-nudges.ts` where it is pinned.
-- A console that can edit conditions is a console that can send "create your
-- first job" to somebody with three of them.
CREATE TABLE IF NOT EXISTS email_copy (
  -- 'welcome' | 'nudge:<key>' | 'trial:<days-left>'. Deliberately not a CHECK:
  -- the set lives in code and grows with the sequences, and a schema that has
  -- to be migrated to add a sentence is a schema that stops the sentence being
  -- added. An unknown slug is refused by the route, which reads the code list.
  slug TEXT PRIMARY KEY,

  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  -- Null where the template has no button. Not every email has one.
  cta TEXT,

  -- WHO CHANGED THE WORDS. Six weeks later somebody asks why the welcome email
  -- says what it says, and a row with nobody against it cannot answer - the
  -- same reason `demo_notification_log` and a comp both carry a name.
  -- SET NULL, because the record has to outlive the account that made it.
  updated_by UUID REFERENCES profiles (id) ON DELETE SET NULL,
  updated_by_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE email_copy ENABLE ROW LEVEL SECURITY;
