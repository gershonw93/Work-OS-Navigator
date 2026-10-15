-- The Friday summary's gate: one row per company per week, written BEFORE the
-- letters go. Two runs overlapping (a retry, a manual trigger beside the
-- schedule) would otherwise send the whole company the same summary twice, and
-- the second copy is what gets a digest switched off. A 23505 on insert means
-- another run has this week; it is not an error.
--
-- ON DELETE CASCADE: the row is a fact about that company alone.
CREATE TABLE IF NOT EXISTS weekly_summary_sends (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  week_ending  date NOT NULL,
  recipients   integer,
  emailed      integer,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, week_ending)
);

ALTER TABLE weekly_summary_sends ENABLE ROW LEVEL SECURITY;
