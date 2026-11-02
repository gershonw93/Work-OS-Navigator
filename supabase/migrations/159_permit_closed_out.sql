-- 159: A permit can be CLOSED OUT.
--
-- The redesigned Permits screen walks every permit along four steps - Apply,
-- City review, Issued, Closed out - and the last one had no status to land on.
-- 'recorded' is a filed Notice of Commencement, not a finished permit, and
-- 008 had mapped the old 'closed' onto 'rejected', which is the opposite fact.
-- Closed out is set by a person (the Close out button), only once the permit
-- was issued, and it drops the permit to the bottom of the Issued group.

ALTER TABLE permits DROP CONSTRAINT IF EXISTS permits_status_check;
ALTER TABLE permits
  ADD CONSTRAINT permits_status_check
  CHECK (status IN ('pending', 'approved', 'active', 'recorded', 'expired', 'rejected', 'closed'));
