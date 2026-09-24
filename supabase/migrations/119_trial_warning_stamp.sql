-- WARNING A COMPANY THAT ITS TRIAL IS NEARLY UP.
--
-- The trial shipped with an in-app banner three days out, which only reaches
-- somebody who opens the app - and the company most likely to lose its account
-- to an expiring trial is the one that has not logged in this week.
--
-- ONE COLUMN, AND IT IS A GATE RATHER THAN A LOG. It holds the last milestone
-- written about, counted in DAYS LEFT (3, then 1, then 0 - days 12, 14 and 15
-- of a fifteen-day trial). Without it the job writes to the same company every
-- morning about the same deadline, which is how people learn to filter mail
-- from us.
--
-- NULLABLE, and null means "nothing said yet" rather than zero. Zero is a
-- milestone - the last one - so a NOT NULL DEFAULT 0 would read as "we have
-- already sent the final warning" for every company on the table, including
-- every future one. A default is a claim.
ALTER TABLE company_billing ADD COLUMN IF NOT EXISTS trial_warned_days_left INTEGER;

-- Anything that MOVES the deadline has to clear this, or a company whose trial
-- was extended keeps a stamp about a date that no longer exists and is never
-- warned again - silently, for the rest of its life, because the milestones
-- only ever count down. The admin routes clear it, and `trialWarning()` also
-- resets it from the dates alone, so it does not depend on every future writer
-- of `trial_ends_at` remembering. This is the same shape as
-- `ready_reminder_sent_at` having to be cleared when an inspection is rebooked.
COMMENT ON COLUMN company_billing.trial_warned_days_left IS
  'Last trial warning sent, in days remaining. Clear whenever trial_ends_at moves.';
