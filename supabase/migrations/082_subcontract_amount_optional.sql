-- ─────────────────────────────────────────────────────────────────────────────
-- A subcontractor can be on the job before their price is agreed.
--
-- `contract_amount` was NOT NULL with no default, so adding a sub without a
-- number failed with a raw Postgres constraint error in an alert() box. That
-- is backwards: lining up who is doing the work and knowing what they charge
-- are two different moments, and the earlier one is exactly when you want them
-- on the job so you can send them a scope to price.
--
-- NULL, NOT 0. Zero is a claim - "this sub costs nothing" - and it would flow
-- into Budget as committed $0 and into Financials as a complete contract sum.
-- NULL says "not agreed yet", which is the truth, and every SUM() in the app
-- already ignores it the same way it would ignore a zero.
--
-- Idempotent: re-running on a column that is already nullable is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE subcontracts ALTER COLUMN contract_amount DROP NOT NULL;

COMMENT ON COLUMN subcontracts.contract_amount IS
  'Agreed contract sum. NULL means not agreed yet - the sub is on the job but has not been priced. Never write 0 to mean "unknown".';
