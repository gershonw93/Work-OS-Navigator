-- ─────────────────────────────────────────────────────────────────────────────
-- THE MIGRATIONS DESCRIBED A DIFFERENT TABLE THAN THE ONE IN PRODUCTION.
--
-- `daily_logs` has 29 columns on the live database. `supabase/migrations/`
-- accounted for 20. NINE existed only in production, with no migration and no
-- mention in the combined file: a fresh environment built from
-- `_combined_008-113.sql` got a `daily_logs` the app writes to and cannot -
-- which is the single thing that file exists to prevent.
--
-- Found while answering "when a daily log marks a delayed delivery, can it
-- connect the dots?". The answer needed `delays`, and `delays` is one of the
-- nine. Building the feature first would have shipped something that worked on
-- exactly one database.
--
-- Every statement here is `IF NOT EXISTS`, so this is a no-op against
-- production and a repair everywhere else. That is the point: it is a
-- reconciliation, not a change.
--
-- ── AND IT COLLAPSES TWO HOMES FOR ONE FACT ──────────────────────────────────
--
-- `weather` and `weather_condition` BOTH held data, which is the failure
-- "one fact, ONE home" is about: both names exist, both compile, and the one a
-- reader picks decides whether they get the right answer. The UI chained
-- `weather ?? weather_condition`, and a `??` between two guesses is the tell.
--
-- Counted before writing this, because a data migration that has not been
-- counted is a guess with a DELETE in it:
--
--   weather only .................. 70 rows   (the live column - the POST
--                                              route writes it)
--   weather_condition only ......... 4 rows   (the fossil)
--   BOTH, disagreeing .............. 0 rows
--   neither ........................ 5 rows
--
-- Zero disagreements, so the merge cannot lose an answer. Same for the
-- temperature pair: `temp_f` 0 rows, `temperature` 4 rows, values plain "90"
-- and "79" - an integer cast, not a parse.
--
-- Those four rows are the same June-2026 logs that carry the three `delays`
-- entries. One older form wrote `weather_condition`, `temperature` and
-- `delays` together and was replaced by the current one, which writes `weather`
-- and drops the rest. This migration is that form's estate.
--
-- THE DEAD COLUMNS ARE DROPPED, not left beside the live ones. A second home
-- nobody writes is not a backup, it is the next reader's trap - and leaving
-- both is what produced the `??` chaining in the first place.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── The nine, reconciled ─────────────────────────────────────────────────────

-- Written by the POST route since the "Logged by" line was blank without it,
-- and backfilled by 060 - but never actually added by a migration.
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS created_by_name text;

-- The delay rows: [{ type, description, schedule_item_id? }]. JSONB rather
-- than a child table because a delay has no life of its own - it is read with
-- its log, written with its log, and deleted with its log, exactly like
-- `subs_on_site` beside it.
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS delays jsonb DEFAULT '[]'::jsonb;

-- Posted by the mobile field view and dropped by the route until now.
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS has_issues boolean DEFAULT false;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS issue_description text;

-- The per-person roster. `workers_onsite` (integer) is the derived total and
-- stays; this is who they were.
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS workers_on_site jsonb DEFAULT '[]'::jsonb;

-- Photos attached inline. `daily_log_photos` is the richer child table; this
-- column predates it and still holds rows.
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS photos jsonb DEFAULT '[]'::jsonb;

-- The winning temperature column: INTEGER, which is what /api/weather returns
-- and what the PATCH route already whitelists.
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS temp_f integer;

-- The two fossils, added so that a fresh environment can run the merge below
-- and reach the same shape as production. They are dropped at the end.
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS weather_condition text;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS temperature text;

-- ── The merge ────────────────────────────────────────────────────────────────
-- ONLY where the live column is empty, so a real answer is never overwritten.
-- With zero disagreements today this is exactly the four fossil rows, and the
-- guard is what keeps it safe if it is ever replayed.

UPDATE daily_logs
   SET weather = weather_condition
 WHERE weather IS NULL AND weather_condition IS NOT NULL;

-- `~ '^[0-9]+$'` because the column is TEXT: a value like "58F" would throw on
-- cast and take the whole migration with it. Today every value is bare digits;
-- this is the guard for the one that is not.
UPDATE daily_logs
   SET temp_f = temperature::integer
 WHERE temp_f IS NULL
   AND temperature IS NOT NULL
   AND btrim(temperature) ~ '^[0-9]+$';

ALTER TABLE daily_logs DROP COLUMN IF EXISTS weather_condition;
ALTER TABLE daily_logs DROP COLUMN IF EXISTS temperature;
