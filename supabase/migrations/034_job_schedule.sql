-- Sub job scheduling: when they can start, how long it will take, and crew size.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS sched_start DATE,
  ADD COLUMN IF NOT EXISTS sched_days INTEGER,
  ADD COLUMN IF NOT EXISTS sched_workers INTEGER;
