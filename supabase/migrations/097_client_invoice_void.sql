-- ─────────────────────────────────────────────────────────────────────────────
-- One fact nothing could express: this invoice's void reached QuickBooks.
--
-- THE BUG. Voiding a client invoice showed a green "Voided in QB" chip. The
-- chip was computed from `status = 'void' AND qbo_id IS NOT NULL` - and
-- `qbo_id` is stamped when the invoice is CREATED over there, not when it is
-- voided. So a void that failed - expired connection, 8s budget blown, a
-- payment linked to the invoice that QuickBooks refuses to void around - still
-- printed green over a receivable that was still open in QuickBooks.
--
-- `qbo_synced_at` could not be used to tell the difference: it is stamped by
-- the create AND by the void, so it means "we touched this" rather than "this
-- is voided over there".
--
-- This is the same defect lib/invoice-qb-state.ts was written to fix in the
-- first place, one pair of facts over. Its own header: "The tick was true and
-- the row was a lie."
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE client_invoices
  ADD COLUMN IF NOT EXISTS qbo_voided_at timestamptz;

COMMENT ON COLUMN client_invoices.qbo_voided_at IS
  'When QuickBooks confirmed the void. NULL on a locally-voided invoice means the void has NOT reached QuickBooks - the receivable is still open there and the sync backlog should retry it.';

-- The backlog counts locally-voided invoices whose void QuickBooks has not
-- confirmed. Without this it is a sequential scan of every invoice on every
-- Settings page load.
CREATE INDEX IF NOT EXISTS idx_client_invoices_void_backlog
  ON client_invoices (status, qbo_voided_at)
  WHERE status = 'void';
