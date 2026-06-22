-- Manually-added (off-platform) subcontractors + their uploaded proposals
ALTER TABLE subcontracts ADD COLUMN IF NOT EXISTS added_manually boolean DEFAULT false;
ALTER TABLE subcontracts ADD COLUMN IF NOT EXISTS proposal_url text;
