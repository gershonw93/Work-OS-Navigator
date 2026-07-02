-- Company logo, shown on generated PDFs (daily logs, invoices, reports).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url TEXT;
