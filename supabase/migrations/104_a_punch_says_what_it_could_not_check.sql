-- Why a punch was flagged, not just that it was.
--
-- `clock_in_flagged` was a boolean and the screens wrote their own prose beside
-- it - which is how " · no GPS" came to be printed next to a stored latitude.
-- The worker's fix was there; the JOB had no coordinates, because its address
-- ("1 Test Lane, Testville, NY 10001") geocodes to nothing. Two different
-- facts, one message, and it named the one the worker cannot do anything about.
--
-- 'ok' | 'far' | 'no_fix' | 'no_site' - see lib/punch-location.ts, which is the
-- only place the sentence for each is written.
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS clock_in_fix  TEXT;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS clock_out_fix TEXT;

-- Rows written before this column existed: a flagged punch that HAS the
-- worker's coordinates was never about the phone, whatever it was told at the
-- time. Anything else stays null rather than being guessed at.
UPDATE time_entries
   SET clock_in_fix = CASE
         WHEN clock_in_lat IS NULL THEN 'no_fix'
         WHEN clock_in_distance_m IS NULL THEN 'no_site'
         WHEN clock_in_flagged THEN 'far'
         ELSE 'ok'
       END
 WHERE clock_in_fix IS NULL;

UPDATE time_entries
   SET clock_out_fix = CASE
         WHEN clock_out_lat IS NULL THEN 'no_fix'
         WHEN clock_out_distance_m IS NULL THEN 'no_site'
         WHEN clock_out_flagged THEN 'far'
         ELSE 'ok'
       END
 WHERE clock_out_fix IS NULL AND clock_out_at IS NOT NULL;
