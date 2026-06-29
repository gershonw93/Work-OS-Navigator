-- Track when an expiry reminder was last sent for a compliance doc so the
-- daily reminder job notifies once per expiry cycle (not every run).
ALTER TABLE compliance_documents ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
