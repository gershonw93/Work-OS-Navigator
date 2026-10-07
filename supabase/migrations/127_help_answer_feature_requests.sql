-- ===== 127_help_answer_feature_requests.sql =====
-- The Help Center's answer box now says "no" plainly when somebody asks for
-- something SyteNav does not do, and offers to pass the request on. This marks
-- those rows, so "what do people ask us for that we do not have" is one query
-- rather than a read through every unanswered question.
--
-- `model` also now carries the prompt version (`claude-haiku-4-5#2`), and the
-- cache only reuses rows written under the current one - no schema change for
-- that, it is the existing column.

ALTER TABLE help_answers ADD COLUMN IF NOT EXISTS feature_request boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_help_answers_feature_request
  ON help_answers (created_at DESC) WHERE feature_request;
