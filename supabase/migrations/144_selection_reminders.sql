-- "Remind the client" on a selection.
--
-- The stamp is the record of having chased somebody: the row says "Reminded
-- Oct 15" so the next person does not send a third one the same afternoon,
-- and "did we ever ask them?" has an answer. Written ONLY after a confirmed
-- send (lib/send-link.ts) - a reminder stamped over a failed email is a claim
-- that we asked when we did not.
ALTER TABLE project_selections ADD COLUMN IF NOT EXISTS client_reminded_at timestamptz;
ALTER TABLE project_selections ADD COLUMN IF NOT EXISTS client_reminded_to text;
