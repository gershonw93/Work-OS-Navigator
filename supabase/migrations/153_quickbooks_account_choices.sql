-- Which QuickBooks account each push goes to (lib/qbo-accounts.ts).
--
-- Every push guessed: the first Cost of Goods Sold account for a bill, the
-- first Bank account to pay it from, the first Service item for an invoice,
-- QuickBooks' own default for a deposit. A real company has a payroll account
-- and an operating account, and "the first Bank account" is whichever one
-- QuickBooks lists first.
--
-- Keyed by the QuickBooks COMPANY (realm + environment) as well as ours:
-- account 35 in one file is a different account, or nothing, in the next. No
-- row is Automatic - storing today's guess would turn it into a decision
-- nobody made. ON DELETE CASCADE: a fact about that company alone.
CREATE TABLE IF NOT EXISTS quickbooks_account_choices (
  company_id  uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  realm_id    text NOT NULL,
  environment text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('bill_expense', 'bill_payment_bank', 'invoice_item', 'payment_deposit')),
  qbo_id      text NOT NULL,
  qbo_name    text,
  updated_by  uuid REFERENCES profiles (id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, realm_id, environment, kind)
);
ALTER TABLE quickbooks_account_choices ENABLE ROW LEVEL SECURITY;
