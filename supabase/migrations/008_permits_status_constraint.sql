-- Fix permits status check constraint to match what the UI actually uses.
-- Original schema had: not_started, submitted, issued, expired, closed
-- UI/API evolved to use: pending, approved, active, recorded, expired, rejected

ALTER TABLE permits DROP CONSTRAINT IF EXISTS permits_status_check;

ALTER TABLE permits
  ADD CONSTRAINT permits_status_check
  CHECK (status IN ('pending', 'approved', 'active', 'recorded', 'expired', 'rejected'));

-- Migrate any rows with old status values to their closest equivalent
UPDATE permits SET status = 'pending'  WHERE status = 'not_started';
UPDATE permits SET status = 'pending'  WHERE status = 'submitted';
UPDATE permits SET status = 'approved' WHERE status = 'issued';
UPDATE permits SET status = 'rejected' WHERE status = 'closed';
