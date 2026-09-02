-- ─────────────────────────────────────────────────────────────────────────────
-- Who gets told when something happens, per company.
--
-- lib/notifications.ts already said WHAT the events are, and each person could
-- mute the ones they did not want. Nothing said who gets told in the first
-- place: `notify()` takes user ids, so the decision was hand-rolled at twenty
-- call sites - including a fallback that notified EVERY profile at the GC
-- company whenever work was marked ready for inspection.
--
-- NO ROW MEANS THE DEFAULT, and the default is a permission ("whoever can
-- approve a bill"), not a role list. So this table changes nothing until
-- somebody opens the settings screen, and a company that customises its roles
-- keeps working - a hardcoded ['admin','office_staff'] would not.
--
-- ONLY 'team' EVENTS BELONG HERE. A 'direct' event goes to the person it is
-- about - the assignee, the sub who was invited - and routing one by role would
-- silently stop the assignee being told they were assigned something. The API
-- refuses those; this table simply never gets a row for them.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.notification_routing (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  -- A key from NOTIFICATION_TYPES. Deliberately NOT a foreign key or an enum:
  -- the catalogue lives in TypeScript, and a database enum would mean a
  -- migration every time an event is added, which is how the two drift.
  type text not null,
  -- Roles that should hear it. Empty is allowed at the column level; the API
  -- refuses saving a rule where both of these are empty, because "nobody" is a
  -- notification that stops arriving with nothing to see.
  roles text[] not null default '{}',
  -- Specific people, named regardless of their role.
  user_ids uuid[] not null default '{}',
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One rule per event per company. The upsert on save depends on this.
  unique (company_id, type)
);

create index if not exists idx_notification_routing_company
  on public.notification_routing (company_id);

-- Read through the service role only, like every other settings table here.
-- Migration 092 put RLS on everything; a table with it off would be the one
-- exception nobody notices.
alter table public.notification_routing enable row level security;
