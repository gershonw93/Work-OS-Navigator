-- 089: paying a sub reaches QuickBooks.
--
-- WHY. Approving a sub's bill creates a QBO Bill - money you owe. Marking it
-- PAID recorded nothing over there, so the payable stayed open in QuickBooks
-- after the cash had gone out and A/P overstated every bill you had settled.
--
-- Exactly the mirror of the receivable bug fixed in 087/#323: on the money-IN
-- side an invoice reached QuickBooks and the payment settling it did not; on
-- the money-OUT side the bill reaches QuickBooks and the payment settling it
-- does not. Same shape, opposite direction.
--
-- The payment needs its OWN id and its own claim. Reusing `qbo_id` would mean
-- the bill and the money that settles it fight over one column, and the claim
-- that stops a double-press creating two records has to be able to say which
-- of the two it is holding.

alter table invoices
  add column if not exists qbo_payment_id text,
  add column if not exists qbo_payment_synced_at timestamptz,
  add column if not exists qbo_payment_claimed_at timestamptz;

create index if not exists invoices_qbo_payment_pending_idx
  on invoices (project_id)
  where qbo_id is not null and qbo_payment_id is null;

comment on column invoices.qbo_payment_id IS
  'The QBO BillPayment that settles this bill. Separate from qbo_id, which is the Bill itself - the two are different records and either can exist without the other.';
