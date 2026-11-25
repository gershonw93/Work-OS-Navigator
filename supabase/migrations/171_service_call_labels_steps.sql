-- 171: labels and steps on a service call.
--
-- The same two things the shared Tasks carry (migration 167), for the same
-- reason: a sub wants to tag a call (Electrical, Warranty, Urgent is already
-- `priority`) and to list what to do on site and tick it off. Both live on the
-- call row as jsonb - a step is a line under a call, it cannot leave it, and
-- it goes when the call goes. Who ticked a step, and when, is stamped by the
-- route (lib/task-extras.ts `stampSubtasks`), never read from a request.
--
-- They are the SUB's business records: `gcView` builds what a contractor sees
-- field by field, so neither column reaches a GC.
--
-- Additive, with defaults, so the code in production before this ships reads
-- and writes calls exactly as it did.
ALTER TABLE public.service_calls ADD COLUMN IF NOT EXISTS labels jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.service_calls ADD COLUMN IF NOT EXISTS steps jsonb NOT NULL DEFAULT '[]'::jsonb;
