-- Change orders on the client's portal link.
--
-- SHARED, NEVER AUTOMATIC. Half the change orders on file are tied to a
-- subcontract, and their amount is what the SUB charges us - our cost, not the
-- client's price. Showing every change order would hand a homeowner the GC's
-- margin. So one appears on the link only once somebody presses Share, and
-- `client_shared_at` is written by that press and nothing else.
--
-- THE CLIENT'S ANSWER IS A RECORD, NOT THE DECISION. Approving a change order
-- moves money (it raises the subcontract and what the client is billed) and
-- stays a person's on the Change Orders tab. The client's approve/decline is
-- stored beside it - who, when, and any note - so the GC approves with the
-- client's yes in front of them, and "did they agree to this?" has an answer.
ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS client_shared_at timestamptz;
ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS client_shared_by uuid REFERENCES profiles (id) ON DELETE SET NULL;
ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS client_response text;
ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS client_response_at timestamptz;
ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS client_response_name text;
ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS client_response_note text;
ALTER TABLE change_orders DROP CONSTRAINT IF EXISTS change_orders_client_response_check;
ALTER TABLE change_orders ADD CONSTRAINT change_orders_client_response_check
  CHECK (client_response IS NULL OR client_response IN ('approved', 'declined'));

-- And they can ask about one, in the same table as every other client question.
ALTER TABLE client_messages ADD COLUMN IF NOT EXISTS change_order_id uuid REFERENCES change_orders (id) ON DELETE CASCADE;
ALTER TABLE client_messages DROP CONSTRAINT IF EXISTS client_messages_one_subject;
ALTER TABLE client_messages ADD CONSTRAINT client_messages_one_subject
  CHECK (num_nonnulls(selection_id, client_invoice_id, payment_request_id, change_order_id) <= 1);
CREATE INDEX IF NOT EXISTS idx_client_messages_change_order ON client_messages (change_order_id, created_at) WHERE change_order_id IS NOT NULL;
