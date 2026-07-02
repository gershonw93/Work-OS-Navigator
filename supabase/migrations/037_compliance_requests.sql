-- ===== 037_compliance_requests.sql =====
-- Request compliance documents from a subcontractor/supplier by email, the same
-- way quotes are requested: a one-time public link (no account) where the vendor
-- uploads their COI / license / W-9 / workers' comp. On submit, the files land as
-- pending compliance_documents rows for that company + project.

CREATE TABLE IF NOT EXISTS compliance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects (id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies (id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL,
  doc_types text[] NOT NULL DEFAULT '{}',   -- which docs are being requested
  vendor_name text,
  vendor_email text,
  status text NOT NULL DEFAULT 'pending',    -- pending | viewed | submitted
  created_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  viewed_at timestamptz,
  submitted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_compliance_requests_project ON compliance_requests (project_id);
CREATE INDEX IF NOT EXISTS idx_compliance_requests_company ON compliance_requests (company_id);
CREATE INDEX IF NOT EXISTS idx_compliance_requests_token ON compliance_requests (token);
