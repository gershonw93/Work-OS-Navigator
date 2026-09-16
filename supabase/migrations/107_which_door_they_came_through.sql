-- ===== 107_which_door_they_came_through.sql =====
-- The super admin can now START an invite, rather than only approving one that
-- somebody asked for. Both land in `access_requests`, because the token, the
-- signup unlock, the resend and the revoke are all the same machinery - but
-- they are NOT the same event, and the row has to remember which it was.
--
-- Why it matters beyond bookkeeping: the two doors get different EMAILS.
-- Somebody who applied is told "you're approved", which is true. Somebody the
-- owner invited out of the blue never applied, and telling them their request
-- was approved asks them to remember a request they never made - the exact bug
-- that split one template into three (lib/email.ts).
--
-- Default 'request', because every row that existed before this came through
-- the waitlist.

ALTER TABLE access_requests
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'request';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'access_requests_source_check'
  ) THEN
    ALTER TABLE access_requests
      ADD CONSTRAINT access_requests_source_check
      CHECK (source IN ('request', 'invite'));
  END IF;
END $$;

COMMENT ON COLUMN access_requests.source IS
  'request = they asked and an admin approved (the waitlist). invite = the platform owner started it and they never asked. Decides which email template is the truthful one.';
