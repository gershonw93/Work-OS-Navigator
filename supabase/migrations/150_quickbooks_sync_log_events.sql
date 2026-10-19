-- The QuickBooks sync log as an event table: every push, void and failure.
--
-- `quickbooks_sync_log` (057) already had the shape - record, action, QB id,
-- status, message, time - and is what Settings > QuickBooks > Recent sync
-- activity reads, so this extends it rather than adding a second table that
-- would hold the same fact. Two things it could not say:
--
--   * WHAT WAS DONE. Every row was written with action = 'create', so a void,
--     an amount correction and a first push read the same, and a failed void
--     looked like a failed create of a record that already existed.
--   * WHICH RECORD, once it is gone. A delete voids in QuickBooks and then
--     removes the row, so entity_id points at nothing; record_label keeps the
--     name ("INV-0004", a bill number, a cheque reference) beside the event.
ALTER TABLE quickbooks_sync_log ADD COLUMN IF NOT EXISTS record_label text;

-- Rows written before the action was recorded, re-labelled from their message.
-- Only rows still carrying the old hardcoded 'create' are touched.
UPDATE quickbooks_sync_log SET action = 'void'
 WHERE action = 'create'
   AND (message ILIKE 'Void:%' OR message ILIKE 'Voided%' OR message ILIKE 'Already voided%'
        OR message ILIKE 'Already gone%' OR message ILIKE 'Payment voided%');
UPDATE quickbooks_sync_log SET action = 'update'
 WHERE action = 'create'
   AND (message ILIKE 'Refresh:%' OR message ILIKE 'Formatting refreshed%' OR message ILIKE 'Update:%'
        OR message ILIKE 'Amount updated%' OR message ILIKE 'Details updated%'
        OR message ILIKE 'Credit applied%' OR message ILIKE 'Applying credit:%');

COMMENT ON COLUMN quickbooks_sync_log.action IS 'create | update | void';
CREATE INDEX IF NOT EXISTS idx_qbo_sync_log_entity ON quickbooks_sync_log (entity_id, created_at DESC);
