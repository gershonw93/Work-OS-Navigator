-- Store a named contact person on a company (e.g. the rep on a quote).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_name TEXT;
