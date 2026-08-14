-- ===== 076_contract_type.sql =====
-- How a job PAYS, which the app never asked.
--
-- `billing_mode` (simple | aia) is how you INVOICE - one bill, or a G702
-- progress application. It says nothing about how you are PAID. Without that,
-- the budget screen could not know whether to ask for a contract value or for a
-- markup rate, so it showed both and hedged: "Leave it empty on cost-plus."
-- On a cost-plus custom home that box is asking a question the job has no
-- answer to, and the reader was left to resolve an ambiguity the app should
-- have settled once, at setup.
--
-- DELIBERATELY NULLABLE, AND DELIBERATELY NOT BACKFILLED.
-- There is no honest way to infer this from what is already stored:
--   * contractor_fee_pct > 0 does NOT mean cost-plus - the same number drives
--     the client price on a fixed-price PROPOSAL.
--   * "no client named" does not mean spec - it very often means nobody filled
--     the field in.
-- Guessing here is worse than asking: a job wrongly marked spec hides the
-- markup box, which is the exact complaint this migration exists to fix. Of 46
-- projects only ONE has ever had a revenue figure entered, so there is almost
-- no signal to infer from anyway.
--
-- Null renders a one-line, three-button picker in place of the two competing
-- controls. One click per job, asked once.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS contract_type text
  CHECK (contract_type IN ('cost_plus', 'fixed_price', 'spec'));

COMMENT ON COLUMN projects.contract_type IS
  'How the job pays: cost_plus (markup is the fee), fixed_price (agreed contract value), spec (no client, revenue is the sale price). Null = not answered yet; the budget screen asks.';

-- Same question at the company level so a builder who does one kind of work
-- does not answer it on every job. Mirrors default_billing_mode.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS default_contract_type text
  CHECK (default_contract_type IN ('cost_plus', 'fixed_price', 'spec'));

COMMENT ON COLUMN companies.default_contract_type IS
  'Pre-selected contract type for new projects. Null = ask per job.';
