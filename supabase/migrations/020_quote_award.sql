-- Track when a winning quote has been awarded into a real subcontract,
-- so it isn't created twice.
ALTER TABLE quote_comparisons ADD COLUMN IF NOT EXISTS awarded_subcontract_id UUID REFERENCES subcontracts (id) ON DELETE SET NULL;
