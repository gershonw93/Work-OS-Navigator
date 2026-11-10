-- 164: the gates for the two morning permit reminders (lib/permit-reminders.ts).
--
-- A reminder fires ONCE per thing it is about, claimed by one conditional
-- UPDATE before anything is sent - two overlapping runs cannot both win.
--
--  * permit_rounds.chase_reminded_at - "follow up with the township" goes once
--    per SUBMISSION. A resubmission is a new round, so it can be chased again.
--  * permits.expiry_reminder_for - the expiry date the warning was sent for.
--    A date, not a timestamp: renewing the permit moves expiry_date, which
--    re-arms the warning for the new date without anything clearing a flag.
ALTER TABLE public.permit_rounds ADD COLUMN IF NOT EXISTS chase_reminded_at timestamptz;
ALTER TABLE public.permits ADD COLUMN IF NOT EXISTS expiry_reminder_for date;
