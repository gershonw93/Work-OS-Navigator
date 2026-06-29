-- Align the invoices table with what the app actually uses. The base schema
-- only allowed draft/submitted/approved/rejected/paid and lacked several columns,
-- so creating an invoice (status 'pending_approval', company_name, etc.) failed.

-- Columns the app reads/writes
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies (id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS approved_by_name TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS lien_waiver_url TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS lien_waiver_type TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS lien_waiver_uploaded_at TIMESTAMPTZ;

-- An invoice may be created without a linked subcontract (ad-hoc billing)
ALTER TABLE invoices ALTER COLUMN subcontract_id DROP NOT NULL;

-- Allow the full status set the app uses
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('draft', 'pending_approval', 'submitted', 'approved', 'sent', 'rejected', 'paid'));
