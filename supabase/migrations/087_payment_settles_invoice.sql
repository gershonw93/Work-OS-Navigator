-- 087: a payment settles the invoice it was recorded against, and client
-- opens of an invoice are counted rather than only remembered once.
--
-- WHY. "Mark paid" on a client invoice records a payment, and QuickBooks was
-- then asked to guess which receivable that money settled: the oldest invoice
-- still 'sent'. Issue three invoices on one day and "oldest" is whichever row
-- Postgres cared to return - a payment for INV-0004 would have settled
-- INV-0002 in the books. The link the user made is not a guess, so store it.

alter table client_payments
  add column if not exists client_invoice_id uuid references client_invoices(id) on delete set null;

create index if not exists client_payments_client_invoice_id_idx
  on client_payments (client_invoice_id);

-- Opens: viewed_at keeps its meaning (the FIRST open), and these two answer
-- the questions a GC actually asks - how many times, and how recently.
alter table client_invoices
  add column if not exists view_count integer not null default 0,
  add column if not exists last_viewed_at timestamptz;

update client_invoices
   set view_count = 1,
       last_viewed_at = viewed_at
 where viewed_at is not null
   and view_count = 0;

-- One statement, so two opens in the same instant both count. A read, an
-- add and a write from the app would lose one of them.
create or replace function bump_client_invoice_view(p_id uuid)
returns void
language sql
as $$
  update client_invoices
     set view_count = coalesce(view_count, 0) + 1,
         last_viewed_at = now(),
         viewed_at = coalesce(viewed_at, now())
   where id = p_id;
$$;

-- Only the server may count an open. Left to PUBLIC, anyone with the anon key
-- could inflate the count for any invoice id they cared to type.
revoke all on function bump_client_invoice_view(uuid) from public;
revoke all on function bump_client_invoice_view(uuid) from anon, authenticated;
grant execute on function bump_client_invoice_view(uuid) to service_role;
