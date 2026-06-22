-- Scope of work as structured line items (description + amount), e.g. from an AI-parsed proposal
ALTER TABLE subcontracts ADD COLUMN IF NOT EXISTS line_items jsonb DEFAULT '[]'::jsonb;
