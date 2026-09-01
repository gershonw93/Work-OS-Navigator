-- ─────────────────────────────────────────────────────────────────────────────
-- Row-Level Security on every table that needs it, stated in a migration.
--
-- TWO PROBLEMS, ONE STATEMENT.
--
-- 1. Supabase sent a critical alert: 8 tables had RLS OFF in production. The
--    anon key is PUBLIC by design - it ships in the browser bundle and anybody
--    can read it out of the page source - so RLS is the only thing standing
--    between that key and a table. With it off, anyone could read, edit or
--    delete every row by talking to the database directly, never touching the
--    app or the permission checks added in #337.
--
--    The one that matters is client_invoices, which carries `token`: the
--    client portal share link. Reading that table hands you a working portal
--    link for every invoice, and the portal shows invoices and payment
--    history. You did not even need somebody to send you a link.
--
--    The eight: client_invoices, client_invoice_lines, project_selections,
--    selection_options, notification_preferences, compliance_requirements,
--    invoice_allocations, project_setup_dismissals.
--
-- 2. 43 MORE tables have RLS on in production but NO migration says so - they
--    were switched on by hand in the dashboard. Counted exactly: 74 tables in
--    public, 23 of them enable RLS somewhere in these files, leaving 51 that
--    are only correct because somebody clicked a toggle. A fresh environment
--    built from these migrations would be born with all 51 wide open. That is
--    the more dangerous of the two, because nothing reports it until it is a
--    new customer's database.
--
-- WHY THIS IS SAFE, checked rather than assumed. RLS with zero policies denies
-- anon and authenticated, and leaves the service role alone - the shape
-- device_tokens shipped with in 090. So this only breaks something if a table
-- below is reached WITHOUT the service-role key. Two ways that can happen, and
-- both were swept:
--
--   * From the browser, with the anon key. Exactly one table is read that way
--     (`projects`), and it is not in this list. The `submittals` hits in the
--     browser are storage.from('submittals') - the bucket, not the table.
--   * From a server layout, as the signed-in user via lib/supabase/server.ts.
--     That reaches `profiles` and `projects` only. Neither is in this list.
--
-- The client portal looked like the real risk - it is unauthenticated and it
-- reads client_invoices and project_selections - but app/portal/[token] and
-- the /api/bill/[token] and /api/portal/[token] routes all build a
-- service-role client. The portal is unaffected.
--
-- notification_preferences was flagged for a column named `email`. That column
-- is a BOOLEAN (do you want emails of this type), not an address - the
-- heuristic matched on the name. Enabled anyway; nothing client-side reads it.
--
-- Idempotent: enabling RLS on a table that already has it is a no-op, so this
-- runs the same against production and against an empty database.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.access_requests              enable row level security;
alter table public.bid_invites                  enable row level security;
alter table public.bid_package_attachments      enable row level security;
alter table public.bid_request_attachments      enable row level security;
alter table public.bid_requests                 enable row level security;
alter table public.bid_submissions              enable row level security;
alter table public.budget_line_items            enable row level security;
alter table public.budget_template_items        enable row level security;
alter table public.budget_templates             enable row level security;
alter table public.change_orders                enable row level security;
alter table public.client_invoice_lines         enable row level security;
alter table public.client_invoices              enable row level security;
alter table public.client_payments              enable row level security;
alter table public.company_files                enable row level security;
alter table public.company_invites              enable row level security;
alter table public.company_roles                enable row level security;
alter table public.company_trade_scopes         enable row level security;
alter table public.compliance_requests          enable row level security;
alter table public.compliance_requirements      enable row level security;
alter table public.contacts                     enable row level security;
alter table public.customers                    enable row level security;
alter table public.daily_log_attachments        enable row level security;
alter table public.daily_log_photos             enable row level security;
alter table public.daily_log_updates            enable row level security;
alter table public.equipment                    enable row level security;
alter table public.equipment_assignments        enable row level security;
alter table public.file_packets                 enable row level security;
alter table public.file_share_uploads           enable row level security;
alter table public.file_shares                  enable row level security;
alter table public.impersonation_log            enable row level security;
alter table public.invoice_allocations          enable row level security;
alter table public.linkedin_connection          enable row level security;
alter table public.linkedin_oauth_states        enable row level security;
alter table public.linkedin_posts               enable row level security;
alter table public.material_purchases           enable row level security;
alter table public.notification_preferences     enable row level security;
alter table public.pay_application_lines        enable row level security;
alter table public.pay_applications             enable row level security;
alter table public.plan_folders                 enable row level security;
alter table public.plan_pins                    enable row level security;
alter table public.project_activity             enable row level security;
alter table public.project_selections           enable row level security;
alter table public.project_setup_dismissals     enable row level security;
alter table public.project_tasks                enable row level security;
alter table public.project_team_members         enable row level security;
alter table public.quote_comparisons            enable row level security;
alter table public.quotes                       enable row level security;
alter table public.selection_options            enable row level security;
alter table public.submittals                   enable row level security;
alter table public.task_notes                   enable row level security;
alter table public.time_entries                 enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- And one loose end the same advisor run reported.
--
-- bump_client_invoice_view had no search_path pinned. It is SECURITY INVOKER,
-- so this is not the privilege-escalation version of that warning - there is
-- no elevated context for a planted `client_invoices` earlier in the path to
-- capture. Pinned anyway: it costs a line, and the next function somebody
-- copies this one into may well be a definer.
--
-- Named with the same signature so the existing grants survive: execute is
-- revoked from anon and authenticated and granted to service_role only (087),
-- which is why enabling RLS on client_invoices above does not break the
-- portal's view counter - /api/bill/[token] calls it with the service role.
-- ─────────────────────────────────────────────────────────────────────────────

alter function public.bump_client_invoice_view(uuid) set search_path = public, pg_temp;
