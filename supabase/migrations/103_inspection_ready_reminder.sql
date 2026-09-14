-- ─────────────────────────────────────────────────────────────────────────────
-- Nobody was warned.
--
-- THE GAP, asked plainly: "if the inspection date is approaching and it's not
-- ready, who gets notified?" Nobody. The only scheduled job in the app was
-- /api/cron/compliance-reminders, and vercel.json listed exactly that one path.
-- A visit booked for Friday that nobody had marked ready was silent right up to
-- the morning the inspector turned up.
--
-- This column is the once-per-booking gate on the new warning - the same shape
-- as `compliance_documents.reminder_sent_at`. The PATCH route clears it
-- whenever `scheduled_date` changes, because a reminder that fires once per ROW
-- rather than once per BOOKING is one you cannot rely on: move a visit to next
-- month and a spent gate would mean the warning never comes again.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE inspections ADD COLUMN IF NOT EXISTS ready_reminder_sent_at timestamptz;
