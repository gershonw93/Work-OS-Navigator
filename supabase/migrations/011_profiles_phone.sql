-- The settings/profile screen reads and writes profiles.phone, but the column
-- was never created - so saving a profile (and selecting phone) errored out.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
