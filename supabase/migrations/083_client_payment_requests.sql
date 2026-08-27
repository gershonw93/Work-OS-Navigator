-- ─────────────────────────────────────────────────────────────────────────────
-- Asking the client for money that has no costs behind it yet.
--
-- The app could RECORD a deposit (client_payments, with a retainer flag) and it
-- could bill for work already done ("Bill the client" builds an invoice from
-- approved sub bills and receipts; AIA jobs raise a pay application). It had no
-- way to ASK for a deposit - which by definition has no costs behind it, so it
-- can never be built from them.
--
-- The result was a go-live checklist demanding "Deposit or first payment
-- received" with nothing in the product that asks for one.
--
-- WHY THIS IS NOT AN INVOICE ROW. An invoice here means "these approved costs,
-- plus markup". A deposit is an advance against work not yet done. Filing one
-- as an invoice would put it in the billed-costs totals and double-count it the
-- moment the real costs arrive.
--
-- The money side needs no new arithmetic: a deposit that lands is recorded as a
-- normal client_payment, and escrowBalance = received - escrowPaid - feeEarned
-- already draws it down as vendors get paid. This table is the ASK, and the
-- link to the payment that settled it.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_payment_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- What the client is being asked for, in their words. Comes from the
  -- estimate's payment stage ("Deposit", "40% at rough-in") so the wording
  -- matches the quote they already signed.
  label         text NOT NULL,
  amount        numeric NOT NULL CHECK (amount > 0),
  -- The stage's "when it's due" text, if the estimate had one. Free text on
  -- purpose: "on signing", "at rough-in" - real terms are not dates.
  due_hint      text,

  -- Which payment_stages entry this came from, so the Estimate's stage list can
  -- show what has already been asked for and not offer it twice. NULL for a
  -- one-off request typed by hand.
  stage_index   integer,

  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'paid', 'cancelled')),

  -- Only stamped on a confirmed send, never on opening a dialog.
  sent_at       timestamptz,
  sent_to       text,

  paid_at       timestamptz,
  -- The payment that settled it. ON DELETE SET NULL, not CASCADE: deleting a
  -- mistyped payment must not silently delete the request it was against - the
  -- request goes back to outstanding, which is the truth.
  client_payment_id uuid REFERENCES client_payments(id) ON DELETE SET NULL,

  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_payment_requests_project_idx
  ON client_payment_requests(project_id);

-- One live ask per estimate stage. Without this, double-clicking Request bills
-- the client twice for the same deposit. Partial, so a cancelled request can be
-- re-raised and a paid one does not block a later stage of the same index.
CREATE UNIQUE INDEX IF NOT EXISTS client_payment_requests_one_open_per_stage
  ON client_payment_requests(project_id, stage_index)
  WHERE stage_index IS NOT NULL AND status = 'pending';

ALTER TABLE client_payment_requests ENABLE ROW LEVEL SECURITY;

-- Reached only through the service-role API routes and the token-keyed portal,
-- exactly like client_payments. No anon policy: the portal query runs as the
-- service role after matching client_portal_token.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'client_payment_requests' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON client_payment_requests
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE client_payment_requests IS
  'A request to the client for money not yet backed by costs - deposits and quoted payment stages. Settled by a client_payments row; the escrow maths lives there, not here.';
