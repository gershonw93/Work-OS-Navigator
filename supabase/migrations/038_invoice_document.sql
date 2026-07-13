-- ===== 038_invoice_document.sql =====
-- Let the GC attach the subcontractor's actual invoice file (PDF/photo) to an
-- invoice record. Subs don't need an account - the GC records the invoice and
-- staples the vendor's document to it here.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS document_url text,
  ADD COLUMN IF NOT EXISTS document_name text;
