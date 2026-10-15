-- One home for every question a client asks from their portal link.
--
-- 146 made `selection_messages`. Asked to "make em all" - invoices, payment
-- requests, and the job as a whole - the answer is ONE table, not four: four
-- tables of client messages would be four places to read before anybody could
-- say "the client is waiting on us", and the fifth door would be added to one
-- of them and not the others. The table had no rows when this ran.
--
-- WHAT A MESSAGE IS ABOUT is at most one foreign key, each ON DELETE CASCADE
-- (a question about an invoice that no longer exists is about nothing). None
-- of them set means the question is about the job itself.
ALTER TABLE IF EXISTS selection_messages RENAME TO client_messages;

ALTER TABLE client_messages ALTER COLUMN selection_id DROP NOT NULL;
ALTER TABLE client_messages ADD COLUMN IF NOT EXISTS client_invoice_id uuid REFERENCES client_invoices (id) ON DELETE CASCADE;
ALTER TABLE client_messages ADD COLUMN IF NOT EXISTS payment_request_id uuid REFERENCES client_payment_requests (id) ON DELETE CASCADE;

ALTER TABLE client_messages DROP CONSTRAINT IF EXISTS client_messages_one_subject;
ALTER TABLE client_messages ADD CONSTRAINT client_messages_one_subject
  CHECK (num_nonnulls(selection_id, client_invoice_id, payment_request_id) <= 1);

CREATE INDEX IF NOT EXISTS idx_client_messages_invoice ON client_messages (client_invoice_id, created_at) WHERE client_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_messages_request ON client_messages (payment_request_id, created_at) WHERE payment_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_messages_project ON client_messages (project_id, created_at);
