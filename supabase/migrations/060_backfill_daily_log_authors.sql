-- ===== 060_backfill_daily_log_authors.sql =====
-- daily_logs stored created_by (the user id) but the POST never stamped
-- created_by_name, which is the field the log list and the PDF actually
-- render. Every log therefore showed "Logged by" with nothing after it, so
-- there was no way to tell who filed a log - including logs filed from the
-- mobile field view.
--
-- The insert now sets created_by_name, and the list endpoint resolves any
-- missing name from created_by. This backfills the rows written before that.

UPDATE daily_logs dl
SET created_by_name = COALESCE(p.full_name, p.email)
FROM profiles p
WHERE dl.created_by = p.id
  AND (dl.created_by_name IS NULL OR btrim(dl.created_by_name) = '')
  AND COALESCE(p.full_name, p.email) IS NOT NULL;
