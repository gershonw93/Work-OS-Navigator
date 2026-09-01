-- ─────────────────────────────────────────────────────────────────────────────
-- Does the contractor fee apply to material receipts on this job?
--
-- It depends on the contract, which is why this is per PROJECT rather than a
-- global switch. Some jobs mark up everything the job costs; some pass
-- materials through at cost. Both are normal, and getting it wrong is money.
--
-- DEFAULT FALSE, WHICH IS EXACTLY TODAY'S BEHAVIOUR. The fee has only ever
-- been earned on bills from subs, so every existing job's earned fee is
-- unchanged the moment this lands. Silently, retroactively changing what a
-- contractor has earned on jobs they have already invoiced would be far worse
-- than the reporting gap this fixes - they would have no idea their numbers
-- had moved, and no way to find out which ones.
--
-- The per-RECEIPT override needs no migration: material_purchases already has
-- markup_pct and markup_excluded, exactly like invoices do. They were modelled
-- and never wired up to anything.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.projects
  add column if not exists fee_on_materials boolean not null default false;

comment on column public.projects.fee_on_materials IS
  'Cost-plus fee applies to material receipts as well as sub bills. False (the default) is the historic behaviour: fee on bills only. A receipt can still override with its own markup_pct / markup_excluded.';
