-- THE FIRST FIFTEEN DAYS, FOR SOMEBODY WHO HAS NOT COME BACK.
--
-- A new company got a trial and then silence: no welcome, no direction, and the
-- first automated mail we ever sent was the trial warning on day 12. The app's
-- own onboarding is a per-PROJECT setup checklist, so it is invisible until a
-- project exists - which is exactly the step somebody who drifted has not taken.
--
-- ONE ROW PER NUDGE SENT, rather than a column holding the last one. Two
-- reasons, and the second is the one that matters:
--
--   * the gate and the record are the same thing. A unique index makes "have we
--     said this already" a constraint rather than a rule somebody remembers.
--   * a counter answers "how many" and nothing else. Six weeks later the
--     question is WHICH ones a company got and when, because that is what tells
--     you whether the sequence is working or whether somebody got four emails
--     in a week. A column cannot answer it and cannot be recounted.
--
-- CASCADE on the company: what we said to a company is a fact about that
-- company alone, and means nothing once it is gone.
CREATE TABLE IF NOT EXISTS onboarding_nudges_sent (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,

  -- A key from NUDGES in lib/onboarding-nudges.ts ('first_project', 'budget',
  -- 'invite_team', 'subs', 'scan'). Deliberately not a CHECK: the list is
  -- editable copy, and a schema that has to be migrated to add a sentence is a
  -- schema that stops the sentence being added.
  nudge_key TEXT NOT NULL,

  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- THE GATE. Without it a re-run - or two crons overlapping on a slow morning -
-- sends the same nudge twice, and the second one is the one that gets somebody
-- to unsubscribe.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_onboarding_nudge
  ON onboarding_nudges_sent (company_id, nudge_key);

CREATE INDEX IF NOT EXISTS idx_onboarding_nudges_company
  ON onboarding_nudges_sent (company_id);

ALTER TABLE onboarding_nudges_sent ENABLE ROW LEVEL SECURITY;
