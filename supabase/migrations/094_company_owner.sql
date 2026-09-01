-- ─────────────────────────────────────────────────────────────────────────────
-- Every company has an owner, and the owner cannot be removed by an admin.
--
-- THE BUG. All admins were equal. So an admin invited into a company could
-- remove or demote the person who created it - including the founder, from
-- their own account, permanently, with the same two clicks as removing a
-- labourer. The route already refused self-removal and self-demotion, which
-- means the ONE person it protected from an admin was that admin.
--
-- This is not hypothetical on live data: Sunshine Construction has three
-- admins, and any of them could remove the other two.
--
-- WHO THE OWNER IS. The earliest profile in the company. Signup creates the
-- company and then immediately creates its first profile as an admin
-- (app/api/complete-signup/route.ts), so the first row is always the founder.
-- Checked against production before writing this: in all 22 companies the
-- earliest profile is an admin, and in the one where it matters most the
-- earliest is the founder rather than a later-invited admin.
--
-- NOT `on delete cascade`. Deleting the owner's profile must not delete the
-- company - `set null` leaves an ownerless company, which is recoverable,
-- rather than a deleted one, which is not. The routes refuse to remove an
-- owner anyway; this is what happens if something goes around them.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.companies
  add column if not exists owner_id uuid references public.profiles (id) on delete set null;

-- Backfill: the earliest profile in each company, which is the founder.
-- Idempotent - only fills an owner that is not already set.
update public.companies c
set owner_id = first_profile.id
from (
  select distinct on (company_id) company_id, id
  from public.profiles
  order by company_id, created_at asc
) as first_profile
where first_profile.company_id = c.id
  and c.owner_id is null;

create index if not exists idx_companies_owner on public.companies (owner_id);
