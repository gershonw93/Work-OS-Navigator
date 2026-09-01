-- ─────────────────────────────────────────────────────────────────────────────
-- One row per address, holding when a reset link was last emailed to it.
--
-- WHY THIS EXISTS. Password reset moves off Supabase's mailer and onto our own
-- SendGrid, for the same reason team invites did in #351: it was the only other
-- flow depending on a second mail configuration this repo cannot see or test.
--
-- But taking it over means WE now own an endpoint that anybody on the internet
-- can hit, unauthenticated, and that sends email. Supabase's mailer came with
-- a per-user throttle ("minimum interval per user", 60s on this project);
-- moving off it without replacing that would hand out a way to mail-bomb any
-- address somebody can guess, and to burn the SendGrid quota doing it.
--
-- Per ADDRESS, not per IP. An IP throttle is trivially sidestepped with a
-- different IP and does nothing to protect the person being targeted, who is
-- the one receiving the mail. 60 seconds matches what Supabase was enforcing,
-- so nothing about the user-facing behaviour changes.
--
-- No policies, so anon and authenticated are denied and only the service role
-- reaches it - the shape every other table has carried since 092. The row is
-- not secret, but nothing outside the reset route has any business reading a
-- list of addresses that have asked for a password reset.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.password_reset_throttle (
  email        text primary key,
  last_sent_at timestamptz not null default now()
);

alter table public.password_reset_throttle enable row level security;
