-- 157: A permit is a conversation, not a status.
--
-- Until now a permit was one row with one status and one file. Submitting it,
-- getting corrections back, resubmitting and finally getting it approved all
-- overwrote the same dropdown, so the app knew where a permit ENDED and
-- nothing about how it got there: when it went in, what the city asked for,
-- whether the ball is with them or with us. On a twenty-house development that
-- history lived in 250 emails.
--
-- A ROUND is one submission and the answer to it. The answer is NULL while the
-- reviewer has it - which is the fact "who has it now" is derived from, so it
-- is never stored as a second column that could disagree.
--
-- An ITEM is one thing the reviewer asked for. Done or not done; the count of
-- open items is what "with us" means.

CREATE TABLE IF NOT EXISTS permit_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The round is a fact about this permit alone, so it goes with it.
  permit_id uuid NOT NULL REFERENCES permits (id) ON DELETE CASCADE,
  -- Carried so a development board can read every house's rounds in one query.
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,

  submitted_on date NOT NULL,
  submitted_note text,
  -- When the reviewer said they would answer, if they said. Past it, the
  -- permit reads as overdue rather than merely waiting.
  expected_by date,
  -- [{ name, url, type, size }] - what went in, and what came back.
  sent_files jsonb NOT NULL DEFAULT '[]'::jsonb,

  outcome text CHECK (outcome IN ('approved', 'corrections', 'rejected')),
  outcome_on date,
  outcome_note text,
  received_files jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- A record of work that outlives the account that typed it.
  created_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_by_name text,
  outcome_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- An answer has a date, and a date is an answer.
  CONSTRAINT permit_rounds_outcome_dated CHECK ((outcome IS NULL) = (outcome_on IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_permit_rounds_permit ON permit_rounds (permit_id, submitted_on);
CREATE INDEX IF NOT EXISTS idx_permit_rounds_project ON permit_rounds (project_id);

-- ONE OPEN ROUND PER PERMIT. A double press on "Log submission" - or the same
-- house picked twice in a bulk submit - must not leave two rounds both waiting
-- on the city. The gate is the index, not a check-then-insert.
CREATE UNIQUE INDEX IF NOT EXISTS permit_rounds_one_open
  ON permit_rounds (permit_id) WHERE outcome IS NULL;

CREATE TABLE IF NOT EXISTS permit_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id uuid NOT NULL REFERENCES permits (id) ON DELETE CASCADE,
  -- The answer that asked for it. SET NULL: an item somebody typed in by hand
  -- (the city emailed another ask) belongs to no round.
  round_id uuid REFERENCES permit_rounds (id) ON DELETE SET NULL,
  label text NOT NULL CHECK (length(btrim(label)) > 0),
  done_at timestamptz,
  done_by_name text,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_permit_items_permit ON permit_items (permit_id);

-- Every route reads and writes these with the service role, behind
-- requirePermission + ownedProject. RLS on with no policy means the anon key
-- reads nothing, the same as the other recent tables.
ALTER TABLE permit_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE permit_items ENABLE ROW LEVEL SECURITY;
