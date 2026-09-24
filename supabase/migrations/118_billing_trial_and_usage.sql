-- BILLING: A FIFTEEN-DAY TRIAL, A STRIPE SUBSCRIPTION, AND A METER THAT IS REAL.
--
-- Three things arrive together because they are one subject: what a company is
-- entitled to, what it has used, and how it pays. Until now the product had
-- none of them - Settings -> Billing drew three progress bars ("Projects
-- 0 / 10", "Storage 0 / 5 GB") whose numbers were literals in the JSX and whose
-- caps matched no plan we sell, under a card reading "Starter Plan", a tier
-- name deleted from this product for being invented.
--
-- THE EXISTING CUSTOMERS ARE COMPED, NOT PUT ON A CLOCK. Everybody in the app
-- today came in through an invite-only beta that promised the product free
-- while they were in it. Starting a fifteen-day timer on them would take a live
-- job screen away from a real crew fifteen days after this deploy, on the
-- strength of a promise we made in the other direction. They get free access
-- with a reason against it, and the platform console can end it deliberately,
-- per company, when there is a conversation to go with it.

-- ── What a company is entitled to ───────────────────────────────────────────
--
-- ONE ROW PER COMPANY, keyed on the company, because "what plan are you on" has
-- exactly one answer at a time. The history of how it got there lives in
-- Stripe, which is the system of record for money; this table is the answer the
-- app asks on every write.
--
-- CASCADE on the company: a billing row is a fact about that company alone and
-- means nothing once it is gone.
--
-- NOT EVERY COMPANY HAS ONE, and that is the design. `companies` holds our
-- customers AND every subcontractor and inspector anybody has ever put in a
-- Directory. A sub writes to jobs it does not own - bills, daily logs,
-- clock-ins - so "no billing row" must mean UNMETERED rather than locked, or
-- this migration breaks every sub in the product. `lib/billing-state.ts` is
-- where that is decided; this comment is here so the next person to add a
-- NOT NULL to it reads the reason first.
CREATE TABLE IF NOT EXISTS company_billing (
  company_id UUID PRIMARY KEY REFERENCES companies (id) ON DELETE CASCADE,

  -- Stripe's vocabulary, plus our own `comped`. Deliberately a CHECK rather
  -- than free text: an unrecognised status resolves to "unmetered" in the app,
  -- which is the safe guess and a silent one.
  status TEXT NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'comped')),

  -- The plan KEY from lib/plans.ts ('up-to-3' | 'up-to-10' | 'unlimited'),
  -- never its display name: marketing rewords a tier and every stored row
  -- would point at nothing. Null while trialing - a trial is not a plan.
  plan_key TEXT,

  -- The trial. Both ends stored: the end is what everything is derived from,
  -- the start is how you answer "when did this company arrive" a year later.
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,

  -- Free access we granted. THE EVIDENCE TRAVELS WITH THE CLAIM: a comp with
  -- nobody's name and no reason against it is unanswerable six weeks later,
  -- which is exactly when somebody asks why this account is not being billed.
  -- Same rule as demo_notification_log, and SET NULL for the same reason - the
  -- record has to outlive the account that granted it.
  comped_by UUID REFERENCES profiles (id) ON DELETE SET NULL,
  comped_by_name TEXT,
  comped_reason TEXT,
  comped_at TIMESTAMPTZ,
  comped_until TIMESTAMPTZ,  -- NULL means open-ended

  -- Stripe. `stripe_customer_id` outlives any one subscription, which is why
  -- it is its own column rather than something read off the subscription.
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A webhook arrives naming a subscription, not a company, so this is the index
-- that lookup runs on. UNIQUE because two companies sharing one subscription
-- is a bug we would rather have refused than discovered.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_company_billing_subscription
  ON company_billing (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_company_billing_customer
  ON company_billing (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

ALTER TABLE company_billing ENABLE ROW LEVEL SECURITY;

-- ── What a company has used ─────────────────────────────────────────────────
--
-- The meter. Nothing metered AI scans before this: twelve routes call the model
-- and not one of them left a trace, so "300 scans a month" was a number on a
-- pricing page with nothing behind it in the product.
--
-- ONE ROW PER SCAN, rather than a counter column, because a counter answers
-- "how many" and nothing else. A customer asking why they are at 280 needs to
-- see what they were, and a counter that drifts cannot be recounted.
--
-- CASCADE on the company (their usage is theirs), SET NULL on the project and
-- the user: deleting a job must not quietly reduce a month's usage, and the
-- record of a scan has to outlive whoever ran it.
CREATE TABLE IF NOT EXISTS ai_scans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects (id) ON DELETE SET NULL,
  user_id UUID REFERENCES profiles (id) ON DELETE SET NULL,

  -- Which door it came through, e.g. 'invoice' | 'quote' | 'permit'. Named by
  -- the route, from one shared list, so the breakdown cannot drift from the
  -- routes that write it.
  kind TEXT NOT NULL,

  -- A scan that FAILED still cost us the model call, but it is not something
  -- to charge a customer for - they did not get an answer. Recorded either way
  -- and only the successful ones count against the allowance, so the two
  -- questions ("what did we spend", "what do they owe") stay separable.
  succeeded BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The count is always "this company, this month, succeeded", so that is the
-- index. Without it the meter table-scans on every load of the billing screen.
CREATE INDEX IF NOT EXISTS idx_ai_scans_company_month
  ON ai_scans (company_id, created_at DESC);

ALTER TABLE ai_scans ENABLE ROW LEVEL SECURITY;

-- ── Which Stripe price is which plan ────────────────────────────────────────
--
-- The mapping lives in the DATABASE and is edited in the platform console,
-- not in an environment variable. Two reasons: a price id is not a secret (the
-- SECRET is STRIPE_SECRET_KEY, which stays in the environment), and the person
-- creating prices in the Stripe dashboard is the person who should be able to
-- paste them in without a deploy.
--
-- A plan has two prices, monthly and yearly, so the key is both.
CREATE TABLE IF NOT EXISTS billing_plan_prices (
  plan_key TEXT NOT NULL,
  interval TEXT NOT NULL CHECK (interval IN ('month', 'year')),
  stripe_price_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (plan_key, interval)
);

ALTER TABLE billing_plan_prices ENABLE ROW LEVEL SECURITY;

-- ── Backfill: everybody already here keeps what they were promised ──────────
--
-- A tenant is a company with at least one profile attached. Directory rows -
-- subs, inspectors, suppliers - have none, get no row, and stay unmetered.
--
-- Idempotent twice over: ON CONFLICT DO NOTHING, and the WHERE EXISTS means a
-- re-run after new signups only ever adds the ones that are missing.
INSERT INTO company_billing (company_id, status, comped_reason, comped_at, comped_by_name)
SELECT c.id,
       'comped',
       'Beta - in the product before billing existed, free while they are in it',
       NOW(),
       'Migration 118'
FROM companies c
WHERE EXISTS (SELECT 1 FROM profiles p WHERE p.company_id = c.id)
ON CONFLICT (company_id) DO NOTHING;
