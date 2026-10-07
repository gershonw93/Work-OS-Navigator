-- ===== 126_help_answers.sql =====
-- AI short answers on the public Help Center (help.sytenav.com).
--
-- ONE TABLE, THREE JOBS - the same shape as campaign_recipients:
--   the LIMIT  - questions per visitor per hour, and model calls per day, are
--                counted off these rows; nothing else meters this route,
--                because a visitor has no company to meter against
--   the CACHE  - a question already answered is served from `answer` rather
--                than paying for it twice
--   the RECORD - what people ask that the articles do NOT answer
--                (answered = false) is the list of articles to write next
--
-- THE ROW GOES IN BEFORE THE MODEL IS CALLED, with `answer` null, and is filled
-- when one comes back - the scan meter's rule. Written afterwards, a call that
-- timed out would cost money and leave no trace against the daily cap.
--
-- NO IP ADDRESS IS STORED. `visitor` is an HMAC of it, enough to count one
-- visitor's questions in an hour and useless for anything else.
--
-- Touches no company and no profile: anonymous by design, so there is no
-- ON DELETE decision to make.

CREATE TABLE IF NOT EXISTS help_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  -- Case, punctuation and spacing folded (`questionKey` in lib/help/answer.ts).
  question_key text NOT NULL,
  visitor text NOT NULL,
  -- Null until the model answers; stays null for a call that failed.
  answer text,
  answered boolean,
  sources text[] NOT NULL DEFAULT '{}',
  -- True when this row was served from an earlier answer - it cost nothing,
  -- so it does not count against the daily cap.
  from_cache boolean NOT NULL DEFAULT false,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Reached only by the server with the service key, like every other table.
ALTER TABLE help_answers ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_help_answers_key ON help_answers (question_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_help_answers_visitor ON help_answers (visitor, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_help_answers_created ON help_answers (created_at DESC);
