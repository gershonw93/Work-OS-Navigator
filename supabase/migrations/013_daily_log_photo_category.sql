-- Tag each work-log photo to a part of the log (Work / Safety / Quality / General).
ALTER TABLE daily_log_photos ADD COLUMN IF NOT EXISTS category TEXT;
