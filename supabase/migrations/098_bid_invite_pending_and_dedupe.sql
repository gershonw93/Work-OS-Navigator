-- ─────────────────────────────────────────────────────────────────────────────
-- A quote invite starts as "nobody has been told yet", and one sub cannot be
-- invited to one request twice.
--
-- THE BUG. `status` was NOT NULL DEFAULT 'invited', so a row was BORN claiming
-- the sub had been told. Two things followed from that one default:
--
--   * the row read "Invited" the instant you pressed + Invite, though nothing
--     had been sent (the invites route sent no email at all - fixed separately);
--   * `isReminder` in the send route reads this status, so the FIRST real email
--     came out as "Still need your price" - a chase for a request the sub had
--     never received. The route's own comment said "it starts null until
--     somebody is actually told", which is what the schema should always have
--     said and never did.
--
-- 'pending' is that missing state. Only a confirmed send moves a row to
-- 'invited'.
--
-- NO BACKFILL, deliberately. Existing 'invited' rows cannot be sorted into
-- "really emailed" and "never emailed" from here, and guessing either re-sends
-- to somebody who already has it or hides somebody who does not.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE bid_invites DROP CONSTRAINT IF EXISTS bid_invites_status_check;

ALTER TABLE bid_invites
  ADD CONSTRAINT bid_invites_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'invited'::text, 'viewed'::text, 'submitted'::text, 'declined'::text]));

ALTER TABLE bid_invites ALTER COLUMN status SET DEFAULT 'pending';

-- ─────────────────────────────────────────────────────────────────────────────
-- One sub, one invite, one request.
--
-- Pressing + Invite twice made two rows. That was untidy while nothing sent;
-- now that the first press really emails, it would be two identical emails to
-- the same sub, so the constraint has to land in the same change as the send.
--
-- PARTIAL, on purpose: an invitee may legitimately have a name and no email
-- (you have their number, not their inbox), and several such rows on one
-- request are fine. It is a repeated ADDRESS, or a repeated directory company,
-- that is the mistake.
--
-- lower() because Sub@x.com and sub@x.com are one inbox.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS uq_bid_invites_req_email
  ON bid_invites (bid_request_id, lower(vendor_email))
  WHERE vendor_email IS NOT NULL AND vendor_email <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_bid_invites_req_company
  ON bid_invites (bid_request_id, vendor_company_id)
  WHERE vendor_company_id IS NOT NULL;
