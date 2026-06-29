-- Add notes column and expand type/status enums for compliance_documents
ALTER TABLE compliance_documents ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE compliance_documents DROP CONSTRAINT IF EXISTS compliance_documents_type_check;
ALTER TABLE compliance_documents ADD CONSTRAINT compliance_documents_type_check
  CHECK (type IN ('coi', 'license', 'w9', 'workers_comp', 'other'));

ALTER TABLE compliance_documents DROP CONSTRAINT IF EXISTS compliance_documents_status_check;
ALTER TABLE compliance_documents ADD CONSTRAINT compliance_documents_status_check
  CHECK (status IN ('missing', 'pending', 'approved', 'expired', 'expiring_soon'));
