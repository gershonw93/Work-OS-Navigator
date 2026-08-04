-- ===== 061_daily_log_field_review.sql =====
-- A crew member filing from the mobile field view can only enter a note and
-- photos, but that created a full standalone daily log with empty weather,
-- crew, survey, and signature. Those submissions are really observations the
-- site manager should review, act on (a task), or fold into the day's record.
--
-- Rather than a second table, mark where a log came from and whether it has
-- been reviewed. Field entries land as 'pending' and are excluded from the
-- client-facing PDF until a manager reviews them.

ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'office';
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'reviewed';
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS reviewed_by uuid;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS reviewed_by_name text;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- Link a task back to the field entry it came from, so the observation and
-- the work it created stay connected.
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS source_daily_log_id uuid;

-- Everything that already exists was filed the old way: treat it as office
-- and already reviewed so nothing silently drops out of existing exports.
UPDATE daily_logs SET source = 'office' WHERE source IS NULL;
UPDATE daily_logs SET review_status = 'reviewed' WHERE review_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_daily_logs_review
  ON daily_logs (project_id, review_status);
