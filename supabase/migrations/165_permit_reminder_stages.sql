-- 165: an expiring permit is warned more than once.
--
-- "if i dont follow up with an expiring permit - will it keep reminding?" It
-- did not: one warning 30 days out, then silence through the day it lapsed.
-- Now 30 days, 7 days, and once it has expired (lib/permit-reminders.ts).
-- expiry_reminder_stage is the LAST step sent for expiry_reminder_for: 30, 7,
-- or -1 (expired). A renewal moves expiry_date, which starts the steps again.
--
-- The rows 164 already warned were warned at 30 days; say so, or they would
-- be warned at 30 days a second time.
ALTER TABLE public.permits ADD COLUMN IF NOT EXISTS expiry_reminder_stage integer;
UPDATE public.permits SET expiry_reminder_stage = 30
 WHERE expiry_reminder_for IS NOT NULL AND expiry_reminder_stage IS NULL;
