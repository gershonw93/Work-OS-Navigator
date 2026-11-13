-- 167: labels and subtasks on the shared Tasks.
--
-- Both live on the task row as jsonb. A subtask is a line UNDER a task - it
-- has no stage of its own, cannot leave its task, and goes when the task goes -
-- so it is not a table. Each carries text, done, an optional due date, note
-- and assignee, and who ticked it and when (written by the route, never taken
-- from a request). Shape and rules: lib/task-extras.ts.
--
-- Additive, with defaults, so the code in production before this ships reads
-- and writes tasks exactly as it did.
ALTER TABLE public.project_tasks ADD COLUMN IF NOT EXISTS labels jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.project_tasks ADD COLUMN IF NOT EXISTS subtasks jsonb NOT NULL DEFAULT '[]'::jsonb;
