-- ===== 064_sellout.sql =====
-- The budget knew what a job COSTS but only knew what it EARNS one way:
-- markup on cost, shown while a job is still in planning. That covers a
-- cost-plus GC and nobody else.
--
-- On a spec build the revenue is what the units sell for, which has nothing to
-- do with your cost. On a fixed-price contract it's the contract value. Either
-- way it's a number you know up front and want to watch your costs against -
-- and once the job went active there was nowhere to see profit at all.
--
-- One figure fixes both: the sellout. Profit is sellout minus cost, recomputed
-- every time a budget line moves.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS sellout_amount numeric(14, 2);

COMMENT ON COLUMN projects.sellout_amount IS
  'Projected revenue: sale price on a spec build, contract value on a fixed-price job. Null means fall back to markup on cost.';
