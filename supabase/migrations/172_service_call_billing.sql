-- 172: billing a service call's customer, pushed to QuickBooks.
--
-- The owner: "We also need to be able to bill a customer. Full build out and
-- qb integrated." Decided with them: the office emails the customer a link to
-- the invoice and records the payment (cash, check, card taken by phone);
-- QuickBooks Online adds any sales tax; a company keeps a price list.
--
-- WHY NEW TABLES AND NOT `client_invoices`. A client invoice belongs to a JOB
-- (`project_id NOT NULL`), and twenty-six files read those tables on the
-- understanding that it does - the live QuickBooks sync of every GC included.
-- Loosening that constraint is a change to money every customer already has in
-- their books. A call's invoice gets its own rows; the QuickBooks RULES are not
-- copied - the push for these lives in lib/quickbooks-push.ts beside the job
-- invoice's and calls the same payload, customer, duplicate, claim and void
-- helpers.
--
-- THE CALL STAYS PRICE-FREE. The money is on the invoice, which nothing a GC
-- reads can reach (`gcView` is built field by field from the call).
--
-- RLS on, no policies: every read and write is a service-role route that names
-- the caller's company first (the service_calls rule, migration 170).
--
-- Additive only - nothing that runs in production today reads these.

-- ── the price list ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_price_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- A company's own list, gone with the company.
  company_id  uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  name        text NOT NULL,
  unit        text NOT NULL DEFAULT 'each',          -- 'each' | 'hour'
  unit_price  numeric(12,2) NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_price_items_company ON public.service_price_items (company_id, active, sort_order);

-- ── the invoice ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_call_invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  -- The call it bills. SET NULL: a record of money outlives the call it came
  -- from (calls are not deleted today, but a receivable must never be).
  call_id         uuid REFERENCES public.service_calls (id) ON DELETE SET NULL,
  -- Who is billed. A QuickBooks Customer needs a customers row, so sending
  -- makes sure there is one; the name and address are copied at the time so
  -- the invoice says what it said when it was sent.
  customer_id     uuid REFERENCES public.customers (id) ON DELETE SET NULL,
  customer_name   text NOT NULL,
  customer_email  text,
  invoice_number  text NOT NULL,
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'sent', 'paid', 'void')),
  issue_date      date NOT NULL DEFAULT current_date,
  due_date        date,
  notes           text,
  -- What the lines add up to, and what QuickBooks says it comes to with any
  -- sales tax it adds (read back from the Invoice it created). NULL tax means
  -- nobody has said - never "no tax".
  subtotal        numeric(12,2) NOT NULL DEFAULT 0,
  tax_amount      numeric(12,2),
  total           numeric(12,2) NOT NULL DEFAULT 0,
  -- The link the customer opens. The path is the secret (a token link).
  token           text UNIQUE,
  sent_at         timestamptz,
  viewed_at       timestamptz,
  paid_at         timestamptz,
  qbo_id          text,
  qbo_synced_at   timestamptz,
  qbo_claimed_at  timestamptz,
  qbo_voided_at   timestamptz,
  created_by      uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS service_call_invoices_number ON public.service_call_invoices (company_id, invoice_number);
-- One live invoice per call: a double press must not bill a customer twice.
CREATE UNIQUE INDEX IF NOT EXISTS service_call_invoices_one_per_call
  ON public.service_call_invoices (call_id) WHERE call_id IS NOT NULL AND status <> 'void';
CREATE INDEX IF NOT EXISTS service_call_invoices_company ON public.service_call_invoices (company_id, status, issue_date);

CREATE TABLE IF NOT EXISTS public.service_call_invoice_lines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES public.service_call_invoices (id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity    numeric(12,2) NOT NULL DEFAULT 1,
  unit        text NOT NULL DEFAULT 'each',
  unit_price  numeric(12,2) NOT NULL DEFAULT 0,
  amount      numeric(12,2) NOT NULL DEFAULT 0,
  sort_order  integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS service_call_invoice_lines_invoice ON public.service_call_invoice_lines (invoice_id, sort_order);

-- ── money received ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_call_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  -- RESTRICT: a payment is evidence money moved. An invoice that has one is
  -- voided, never deleted, and the delete route refuses before the database
  -- has to.
  invoice_id      uuid NOT NULL REFERENCES public.service_call_invoices (id) ON DELETE RESTRICT,
  amount          numeric(12,2) NOT NULL CHECK (amount > 0),
  paid_date       date NOT NULL DEFAULT current_date,
  method          text,
  reference       text,
  memo            text,
  qbo_id          text,
  qbo_synced_at   timestamptz,
  qbo_claimed_at  timestamptz,
  qbo_voided_at   timestamptz,
  created_by      uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_call_payments_invoice ON public.service_call_payments (invoice_id);

ALTER TABLE public.service_price_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_call_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_call_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_call_payments ENABLE ROW LEVEL SECURITY;
