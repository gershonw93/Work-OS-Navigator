-- ===== 042_calendar_feed.sql =====
-- Private per-user token for the iCal calendar subscription feed. Optional — the
-- in-app Master Calendar is unchanged; this just lets a user mirror those events
-- into Google/Apple/Outlook via a secret subscribe URL.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS calendar_token text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_calendar_token ON profiles (calendar_token) WHERE calendar_token IS NOT NULL;
