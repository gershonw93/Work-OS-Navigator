-- ─────────────────────────────────────────────────────────────────────────────
-- The inspection nobody booked, on a date nobody confirmed.
--
-- THE BUG. `inspections` had ONE date column, `scheduled_date`, and the request
-- form wrote the requester's PREFERRED date into it. The card then labelled it
-- "Scheduled Date". So the field's wish and the jurisdiction's answer were the
-- same field, and the second one never existed.
--
-- It got worse downstream. The one-click "Scheduled" pill is guarded by "you
-- cannot be scheduled without a date" - and there was always a date, because
-- the requester had typed one. So a single tap turned a preference into a
-- booking with no call made. And the Master Calendar and the subscribed ICS
-- feed include ANY inspection carrying a `scheduled_date`, whatever its status,
-- so a merely REQUESTED inspection has been showing up as a confirmed
-- appointment on the company calendar and in people's Outlook and Google feeds.
-- Nobody reported that one because a calendar entry looks right until you ring
-- the inspector.
--
-- `scheduled_date` KEEPS ITS NAME and gains its real meaning: the confirmed
-- booking. That is deliberate rather than lazy - six places already read it and
-- every one of them means "booked" (master calendar, the ICS feed, the
-- overview's upcoming list, My Jobs). Renaming would touch all six; giving the
-- column the meaning they already assume makes them correct for free.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE inspections ADD COLUMN IF NOT EXISTS requested_date date;

-- The record of the call, which had nowhere to land. The scheduler's whole job
-- is to ring the jurisdiction and come back with an answer, and there was no
-- field for who they reached or what they were given.
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS booked_with text;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS booking_reference text;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS booked_at timestamptz;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS booked_by_name text;

-- ── Backfill, and the ORDER matters ─────────────────────────────────────────
--
-- 1. Every existing `scheduled_date` was typed at request time as a preference,
--    whatever happened to the row afterwards. So it IS the requested date, on
--    every row, and that is copied first - nothing is lost before anything is
--    cleared.
UPDATE inspections
   SET requested_date = scheduled_date
 WHERE requested_date IS NULL
   AND scheduled_date IS NOT NULL;

-- 2. ...and THEN the false claim goes. A row still sitting at `requested` or
--    `not_scheduled` was never booked by anybody, and those are exactly the
--    rows appearing on the calendar as appointments. The date survives in
--    `requested_date` above; only the assertion that it is booked is removed.
--
--    Rows already `scheduled`/`passed`/`failed`/`pending_reinspection` keep
--    theirs: somebody acted on them, and it is the only date they have.
UPDATE inspections
   SET scheduled_date = NULL
 WHERE status IN ('requested', 'not_scheduled');
