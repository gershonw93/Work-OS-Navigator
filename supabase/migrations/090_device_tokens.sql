-- ─────────────────────────────────────────────────────────────────────────────
-- Which phones to send a push notification to.
--
-- ONE ROW PER PHONE, NOT PER PERSON. The unique key is the token, not the
-- user, because a device token belongs to the DEVICE: hand a site tablet to
-- somebody else and they sign in on the same hardware, and Apple issues that
-- same token again. Keyed by user, the tablet would end up on two rows and the
-- previous person would keep getting the new person's notifications - somebody
-- else's money, on a screen they no longer have any business seeing.
--
-- Keyed by token, signing in simply moves the row: the phone now belongs to
-- whoever is signed in on it, which is the only thing that can be true.
--
-- Tokens are not secrets in the password sense, but they ARE the address of a
-- specific person's phone, so this is service-role only. Nothing client-side
-- reads this table; the app POSTs its token to /api/me/device-token and that
-- route writes it with the service key.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  -- The APNs device token, hex. Apple's is 64 chars today; the column is text
  -- because Apple has changed that length before and a length check that goes
  -- stale silently rejects every phone.
  token text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null default 'ios',
  -- Refreshed every time the app registers, which is every cold start. A token
  -- nothing has touched in months is a phone that was wiped or an app that was
  -- deleted, and Apple will answer 410 Unregistered for it.
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists device_tokens_user_idx on public.device_tokens(user_id);

alter table public.device_tokens enable row level security;

-- No policies, deliberately. RLS with zero policies denies everything to the
-- anon and authenticated roles; the service role bypasses RLS. So the only way
-- in or out is a server route that has already established who is asking.
