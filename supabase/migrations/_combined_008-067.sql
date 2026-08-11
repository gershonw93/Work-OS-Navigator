-- Combined idempotent migrations. 046 (missing base tables) runs first so
-- later ALTERs always have their tables; everything is IF NOT EXISTS-safe.

-- ===== 046_missing_base_tables.sql =====
-- Tables the app uses that were created ad-hoc in the original database and
-- never captured in a migration file. All IF NOT EXISTS, so this is a no-op
-- on the original DB and completes the schema on a fresh install.

CREATE TABLE IF NOT EXISTS project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  due_date date,
  priority text DEFAULT 'medium',
  status text DEFAULT 'open',
  assigned_to_member_id uuid,
  assigned_to_company_id uuid REFERENCES companies (id) ON DELETE SET NULL,
  assigned_to_name text,
  created_by text,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON project_tasks (project_id);

CREATE TABLE IF NOT EXISTS task_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES project_tasks (id) ON DELETE CASCADE,
  content text NOT NULL,
  author_name text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_notes_task ON task_notes (task_id);

CREATE TABLE IF NOT EXISTS project_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects (id) ON DELETE CASCADE,
  name text NOT NULL,
  role text,
  phone text,
  email text,
  profile_id uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_team_members_project ON project_team_members (project_id);

CREATE TABLE IF NOT EXISTS change_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects (id) ON DELETE CASCADE,
  subcontract_id uuid REFERENCES subcontracts (id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  amount numeric(14, 2) DEFAULT 0,
  reason text,
  requested_by_type text DEFAULT 'gc',
  status text DEFAULT 'pending',
  review_notes text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_change_orders_project ON change_orders (project_id);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gc_company_id uuid REFERENCES companies (id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  billing_address text,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS company_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies (id) ON DELETE CASCADE,
  email text NOT NULL,
  role text DEFAULT 'read_only',
  status text DEFAULT 'pending',
  invited_by uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS company_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies (id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  file_url text,
  file_type text,
  size_bytes bigint,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS file_packets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  file_ids jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plan_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects (id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects (id) ON DELETE CASCADE,
  actor_name text,
  actor_id uuid,
  type text,
  message text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_activity_project ON project_activity (project_id);

CREATE TABLE IF NOT EXISTS submittals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects (id) ON DELETE CASCADE,
  title text NOT NULL,
  type text,
  trade text,
  spec_section text,
  manufacturer text,
  model_number text,
  status text DEFAULT 'pending',
  notes text,
  review_notes text,
  file_url text,
  submitted_by_company_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bid_package_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_package_id uuid,
  plan_id uuid,
  file_url text,
  file_name text,
  created_at timestamptz DEFAULT now()
);

-- Optional directory contacts (the API degrades gracefully without it)
CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  added_by_company_id uuid REFERENCES companies (id) ON DELETE CASCADE,
  name text NOT NULL,
  type text,
  trade text,
  company text,
  phone text,
  email text,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- SyteNav - combined migrations 008–015
-- Paste this whole file into the Supabase SQL editor and run once.
-- Safe to re-run (idempotent): IF NOT EXISTS / DROP-then-ADD throughout.
-- ============================================================

-- ─── 008: permits status constraint ─────────────────────────
ALTER TABLE permits DROP CONSTRAINT IF EXISTS permits_status_check;
ALTER TABLE permits
  ADD CONSTRAINT permits_status_check
  CHECK (status IN ('pending', 'approved', 'active', 'recorded', 'expired', 'rejected'));
UPDATE permits SET status = 'pending'  WHERE status = 'not_started';
UPDATE permits SET status = 'pending'  WHERE status = 'submitted';
UPDATE permits SET status = 'approved' WHERE status = 'issued';
UPDATE permits SET status = 'rejected' WHERE status = 'closed';

-- ─── 009: budget line items ─────────────────────────────────
CREATE TABLE IF NOT EXISTS budget_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  cost_code TEXT,
  category TEXT NOT NULL DEFAULT 'General',
  description TEXT NOT NULL,
  budgeted_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  committed_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  actual_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_budget_line_items_project_id ON budget_line_items (project_id);

-- ─── 010: budget line ↔ subcontract link ────────────────────
ALTER TABLE budget_line_items ADD COLUMN IF NOT EXISTS subcontract_id UUID REFERENCES subcontracts (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_budget_line_items_subcontract_id ON budget_line_items (subcontract_id);

-- ─── 011: profiles.phone ────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;

-- ─── 012: daily logs model + task fields ────────────────────
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS survey JSONB DEFAULT '{}'::jsonb;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS safety_observation TEXT;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS quality_observation TEXT;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS signed_by_name TEXT;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS signature_url TEXT;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS subs_on_site JSONB DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS daily_log_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  daily_log_id UUID NOT NULL REFERENCES daily_logs (id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE daily_log_photos ADD COLUMN IF NOT EXISTS caption TEXT;
ALTER TABLE daily_log_photos ADD COLUMN IF NOT EXISTS subcontract_id UUID REFERENCES subcontracts (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_daily_log_photos_log ON daily_log_photos (daily_log_id);

CREATE TABLE IF NOT EXISTS daily_log_updates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  daily_log_id UUID NOT NULL REFERENCES daily_logs (id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_by UUID REFERENCES profiles (id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_daily_log_updates_log ON daily_log_updates (daily_log_id);

CREATE TABLE IF NOT EXISTS daily_log_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  daily_log_id UUID NOT NULL REFERENCES daily_logs (id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_daily_log_attachments_log ON daily_log_attachments (daily_log_id);

ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS follow_up_date DATE;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS follow_up_note TEXT;

-- ─── 013: daily log photo category ──────────────────────────
ALTER TABLE daily_log_photos ADD COLUMN IF NOT EXISTS category TEXT;

-- ─── 014: time clock ────────────────────────────────────────
ALTER TABLE projects ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles (id) ON DELETE SET NULL,
  worker_name TEXT,
  clock_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clock_in_lat DOUBLE PRECISION,
  clock_in_lng DOUBLE PRECISION,
  clock_in_distance_m INTEGER,
  clock_in_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  clock_in_selfie_url TEXT,
  clock_out_at TIMESTAMPTZ,
  clock_out_lat DOUBLE PRECISION,
  clock_out_lng DOUBLE PRECISION,
  clock_out_distance_m INTEGER,
  clock_out_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  clock_out_selfie_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_time_entries_project ON time_entries (project_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_profile ON time_entries (profile_id);

-- ─── 015: time entry approvals ──────────────────────────────
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (approval_status IN ('pending', 'approved', 'rejected'));
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles (id) ON DELETE SET NULL;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS reviewed_by_name TEXT;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- ─── 016: quote comparisons ─────────────────────────────────
CREATE TABLE IF NOT EXISTS quote_comparisons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  trade TEXT,
  winning_quote_id UUID,
  created_by UUID REFERENCES profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quote_comparisons_project ON quote_comparisons (project_id);

CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  comparison_id UUID NOT NULL REFERENCES quote_comparisons (id) ON DELETE CASCADE,
  file_url TEXT,
  file_name TEXT,
  vendor_name TEXT,
  total_amount NUMERIC(14, 2),
  valid_until DATE,
  scope_summary TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quotes_comparison ON quotes (comparison_id);

-- ─── 017: compliance expiry reminders ───────────────────────
ALTER TABLE compliance_documents ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- ─── 018: budget templates ──────────────────────────────────
CREATE TABLE IF NOT EXISTS budget_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  contractor_fee_percent NUMERIC(6, 3) DEFAULT 0,
  source TEXT DEFAULT 'manual',
  created_by UUID REFERENCES profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_budget_templates_company ON budget_templates (company_id);

CREATE TABLE IF NOT EXISTS budget_template_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES budget_templates (id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'General',
  cost_code TEXT,
  description TEXT NOT NULL,
  default_amount NUMERIC(14, 2),
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_budget_template_items_template ON budget_template_items (template_id);

-- ─── 019: quote requirements + analysis ─────────────────────
ALTER TABLE quote_comparisons ADD COLUMN IF NOT EXISTS requirements TEXT;
ALTER TABLE quote_comparisons ADD COLUMN IF NOT EXISTS analysis JSONB;

-- ─── 020: quote award → subcontract ─────────────────────────
ALTER TABLE quote_comparisons ADD COLUMN IF NOT EXISTS awarded_subcontract_id UUID REFERENCES subcontracts (id) ON DELETE SET NULL;

-- ─── 021: expand company types ──────────────────────────────
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_type_check;
ALTER TABLE companies ADD CONSTRAINT companies_type_check
  CHECK (type IN ('gc', 'subcontractor', 'supplier', 'inspector', 'worker', 'other'));

-- ─── 022: company contact name ──────────────────────────────
ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_name TEXT;

-- ─── 023: invoices schema alignment ─────────────────────────
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies (id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS approved_by_name TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS lien_waiver_url TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS lien_waiver_type TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS lien_waiver_uploaded_at TIMESTAMPTZ;
ALTER TABLE invoices ALTER COLUMN subcontract_id DROP NOT NULL;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('draft', 'pending_approval', 'submitted', 'approved', 'sent', 'rejected', 'paid'));

-- ─── 024: bid requests (RFQ flow) ───────────────────────────
CREATE TABLE IF NOT EXISTS bid_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  title TEXT NOT NULL, trade TEXT, description TEXT, due_date DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_by UUID REFERENCES profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bid_requests_project ON bid_requests (project_id);
CREATE TABLE IF NOT EXISTS bid_request_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bid_request_id UUID NOT NULL REFERENCES bid_requests (id) ON DELETE CASCADE,
  file_url TEXT NOT NULL, file_name TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bid_request_attachments_req ON bid_request_attachments (bid_request_id);
CREATE TABLE IF NOT EXISTS bid_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bid_request_id UUID NOT NULL REFERENCES bid_requests (id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  vendor_company_id UUID REFERENCES companies (id) ON DELETE SET NULL,
  vendor_name TEXT, vendor_email TEXT,
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'viewed', 'submitted', 'declined')),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), viewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bid_invites_req ON bid_invites (bid_request_id);
CREATE INDEX IF NOT EXISTS idx_bid_invites_token ON bid_invites (token);
CREATE TABLE IF NOT EXISTS bid_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bid_request_id UUID NOT NULL REFERENCES bid_requests (id) ON DELETE CASCADE,
  bid_invite_id UUID REFERENCES bid_invites (id) ON DELETE SET NULL,
  amount NUMERIC(14, 2), notes TEXT, file_url TEXT, file_name TEXT, submitted_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bid_submissions_req ON bid_submissions (bid_request_id);

-- ===== 025_link_comparison_to_request.sql =====
-- Link a quote comparison back to the bid request it was pulled from,
-- so the RFQ + comparison can live on one unified "Quotes" card.
ALTER TABLE quote_comparisons
  ADD COLUMN IF NOT EXISTS bid_request_id UUID REFERENCES bid_requests (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_quote_comparisons_bid_request ON quote_comparisons (bid_request_id);

-- ===== 026_delete_protection.sql =====
-- Company-wide "secret delete key": when enabled, deleting important records
-- (money + files) requires entering the key. Toggleable per company.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS delete_protection_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS delete_key_hash TEXT;

-- ===== 027_client_payments.sql =====
-- Cost-plus / escrow money model:
--   • client_payments - incoming funds from the client (deposits/draws)
--   • projects.contractor_fee_pct - management fee rate (e.g. 0.15 = 15%)
CREATE TABLE IF NOT EXISTS client_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  paid_date DATE,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  method TEXT,
  memo TEXT,
  retainer BOOLEAN NOT NULL DEFAULT FALSE,
  qb_entered BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_client_payments_project ON client_payments (project_id);

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS contractor_fee_pct NUMERIC(6, 4) NOT NULL DEFAULT 0;

-- ===== 028_invoice_payment_split.sql =====
-- Per-invoice payment source split: how much the client paid the vendor
-- directly vs how much was disbursed from the escrow account.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS client_paid NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escrow_paid NUMERIC(14, 2) NOT NULL DEFAULT 0;

-- ===== 029_projects_flexible_create.sql =====
-- Let subcontractors (and quick GC jobs) create a project without every legacy
-- NOT NULL field, and store an optional description + customer link.
ALTER TABLE projects ALTER COLUMN address DROP NOT NULL;
ALTER TABLE projects ALTER COLUMN client DROP NOT NULL;
ALTER TABLE projects ALTER COLUMN start_date DROP NOT NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers (id) ON DELETE SET NULL;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_type_check;
ALTER TABLE projects ADD CONSTRAINT projects_type_check
  CHECK (type IN ('residential', 'commercial', 'industrial', 'civil', 'renovation', 'mixed_use', 'other'));

-- ===== 030_sub_quote_job.sql =====
-- Sub's own job is quote-driven: upload a quote (AI-scanned into line items),
-- then convert Quote/Pending → Active. Line items live in budget_line_items
-- and carry a progress % used by the Progress view.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS quote_file_url TEXT,
  ADD COLUMN IF NOT EXISTS quote_file_name TEXT,
  ADD COLUMN IF NOT EXISTS quote_total NUMERIC(14, 2);
ALTER TABLE budget_line_items
  ADD COLUMN IF NOT EXISTS progress_pct NUMERIC(5, 2) NOT NULL DEFAULT 0;

-- ===== 031_quote_qty_payment_terms.sql =====
-- Richer quote capture: quantity + unit price per line, payment terms on the
-- project, and a company-level default payment terms (for GCs and subs).
ALTER TABLE budget_line_items
  ADD COLUMN IF NOT EXISTS quantity NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(14, 2);
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS payment_terms TEXT;
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS default_payment_terms TEXT;

-- ===== 032_quote_sections_stages.sql =====
-- Group quote line items by section, and store payment terms as structured stages.
ALTER TABLE budget_line_items ADD COLUMN IF NOT EXISTS section TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS payment_stages JSONB;

-- ===== 033_progress_notes_tasks.sql =====
-- Per-progress-line notes, and a two-way link between a quote line item and a task.
ALTER TABLE budget_line_items ADD COLUMN IF NOT EXISTS progress_note TEXT;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS budget_line_item_id UUID REFERENCES budget_line_items (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_project_tasks_line_item ON project_tasks (budget_line_item_id);
ALTER TABLE budget_line_items ADD COLUMN IF NOT EXISTS progress_status TEXT NOT NULL DEFAULT 'not_started';

-- ===== 034_job_schedule.sql =====
-- Sub job scheduling: when they can start, how long it will take, and crew size.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS sched_start DATE,
  ADD COLUMN IF NOT EXISTS sched_days INTEGER,
  ADD COLUMN IF NOT EXISTS sched_workers INTEGER;

-- ===== 035_company_logo.sql =====
-- Company logo, shown on generated PDFs (daily logs, invoices, reports).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url TEXT;
-- ===== 036_equipment_tracking.sql =====
-- Equipment / tool tracking: what the company owns, who took it, and where it is.
-- Current holder + location = the equipment's latest OPEN assignment
-- (checked_in_at IS NULL). A NULL project_id means it's back at the shop/yard.

CREATE TABLE IF NOT EXISTS equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies (id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  asset_tag text,
  status text NOT NULL DEFAULT 'available', -- available | checked_out | maintenance | retired
  photo_url text,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equipment_company ON equipment (company_id);

CREATE TABLE IF NOT EXISTS equipment_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid REFERENCES equipment (id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies (id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects (id) ON DELETE SET NULL, -- NULL = shop / yard
  holder_name text,               -- person or crew who has it
  holder_profile_id uuid REFERENCES profiles (id) ON DELETE SET NULL,
  checked_out_at timestamptz DEFAULT now(),
  checked_in_at timestamptz,      -- NULL = still out
  note text,
  created_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equipment_assignments_equipment ON equipment_assignments (equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_assignments_open ON equipment_assignments (equipment_id) WHERE checked_in_at IS NULL;

-- ===== 037_compliance_requests.sql =====
-- Request compliance documents from a subcontractor/supplier by email, the same
-- way quotes are requested: a one-time public link (no account) where the vendor
-- uploads their COI / license / W-9 / workers' comp. On submit, the files land as
-- pending compliance_documents rows for that company + project.

CREATE TABLE IF NOT EXISTS compliance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects (id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies (id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL,
  doc_types text[] NOT NULL DEFAULT '{}',   -- which docs are being requested
  vendor_name text,
  vendor_email text,
  status text NOT NULL DEFAULT 'pending',    -- pending | viewed | submitted
  created_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  viewed_at timestamptz,
  submitted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_compliance_requests_project ON compliance_requests (project_id);
CREATE INDEX IF NOT EXISTS idx_compliance_requests_company ON compliance_requests (company_id);
CREATE INDEX IF NOT EXISTS idx_compliance_requests_token ON compliance_requests (token);
-- ===== 038_invoice_document.sql =====
-- Let the GC attach the subcontractor's actual invoice file (PDF/photo) to an
-- invoice record. Subs don't need an account - the GC records the invoice and
-- staples the vendor's document to it here.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS document_url text,
  ADD COLUMN IF NOT EXISTS document_name text;

-- ===== 039_change_order_applied.sql =====
-- Track whether an approved, subcontract-linked change order has been folded
-- into that subcontract's contract_amount, so approving/un-approving/deleting
-- adjusts the contract exactly once (never double-counts).
ALTER TABLE change_orders
  ADD COLUMN IF NOT EXISTS applied_to_contract boolean NOT NULL DEFAULT false;

-- ===== 040_materials.sql =====
-- Material purchases: snap a receipt, AI reads the store + total, assign it to a
-- job, and it flows into that project's costs. The store is saved as a supplier
-- (company_id) so it shows in the Directory like any other vendor.

CREATE TABLE IF NOT EXISTS material_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects (id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies (id) ON DELETE SET NULL,      -- the store / supplier
  budget_line_id uuid REFERENCES budget_line_items (id) ON DELETE SET NULL,
  store_name text,
  amount numeric(14, 2) NOT NULL DEFAULT 0,   -- total incl. tax
  tax numeric(14, 2),
  purchase_date date,
  category text,
  notes text,
  receipt_url text,
  line_items jsonb,
  created_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_purchases_project ON material_purchases (project_id);
CREATE INDEX IF NOT EXISTS idx_material_purchases_company ON material_purchases (company_id);
CREATE INDEX IF NOT EXISTS idx_material_purchases_budget_line ON material_purchases (budget_line_id);

-- ===== 041_inspection_scheduling.sql =====
-- Inspection request → schedule → result workflow. A site manager or sub requests
-- an inspection and assigns who should schedule it; that person is notified, and
-- the requester is notified back when it's scheduled and when it passes/fails.

ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS trade text,
  ADD COLUMN IF NOT EXISTS completed_date date,
  ADD COLUMN IF NOT EXISTS inspector_name text,
  ADD COLUMN IF NOT EXISTS inspector_phone text,
  ADD COLUMN IF NOT EXISTS scheduling_phone text,
  ADD COLUMN IF NOT EXISTS card_image_url text,
  ADD COLUMN IF NOT EXISTS ready_marked_by text,
  ADD COLUMN IF NOT EXISTS ready_marked_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_time text,               -- preferred/confirmed time of day
  ADD COLUMN IF NOT EXISTS requested_by_id uuid REFERENCES profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requested_by_name text,
  ADD COLUMN IF NOT EXISTS scheduler_profile_id uuid REFERENCES profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scheduler_name text;

-- Allow the full set of workflow statuses.
ALTER TABLE inspections DROP CONSTRAINT IF EXISTS inspections_status_check;

-- ===== 042_calendar_feed.sql =====
-- Private per-user token for the iCal calendar subscription feed. Optional - the
-- in-app Master Calendar is unchanged; this just lets a user mirror those events
-- into Google/Apple/Outlook via a secret subscribe URL.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS calendar_token text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_calendar_token ON profiles (calendar_token) WHERE calendar_token IS NOT NULL;

-- ===== 043_plan_pins.sql =====
-- Pin-to-task on plans: a pin is a percentage coordinate on a plan sheet
-- (so it stays anchored through zoom/pan) linked to a task. Color comes from
-- the assignee so the crew can see whose work is where at a glance.

CREATE TABLE IF NOT EXISTS plan_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects (id) ON DELETE CASCADE,
  plan_id uuid REFERENCES project_plans (id) ON DELETE CASCADE,
  task_id uuid REFERENCES project_tasks (id) ON DELETE CASCADE,
  page integer NOT NULL DEFAULT 1,
  x_pct numeric(7, 4) NOT NULL,    -- 0-100, % of sheet width
  y_pct numeric(7, 4) NOT NULL,    -- 0-100, % of sheet height
  created_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_pins_plan ON plan_pins (plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_pins_project ON plan_pins (project_id);

-- ===== 044_work_signoffs.sql =====
-- Work signoffs: signature-based approval of completed work (distinct from
-- percent-done tracking). A completed task or a finished progress line can be
-- signed with the signature pad; the signature image + name + time are stored.

ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS signoff_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS signoff_requested_by text,
  ADD COLUMN IF NOT EXISTS signoff_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS signoff_signed_by text,
  ADD COLUMN IF NOT EXISTS signoff_signature_url text;

ALTER TABLE budget_line_items
  ADD COLUMN IF NOT EXISTS signoff_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS signoff_signed_by text,
  ADD COLUMN IF NOT EXISTS signoff_signature_url text;

-- ===== 045_access_requests.sql =====
-- Gated signup: the public /signup page becomes a Request Access form. The
-- platform owner reviews requests in /admin and approves them, which mints an
-- invite token; only a valid token unlocks the real account-creation form.

CREATE TABLE IF NOT EXISTS access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  company_name text,
  company_type text,            -- gc | subcontractor
  phone text,
  message text,
  status text NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  invite_token text,
  created_at timestamptz DEFAULT now(),
  reviewed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_access_requests_email ON access_requests (lower(email));
CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests (status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_access_requests_token ON access_requests (invite_token) WHERE invite_token IS NOT NULL;

-- ===== 047_project_coords.sql =====
-- Cached coordinates for the projects map view (geocoded once per address
-- via OpenStreetMap/Nominatim, free).
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS geocoded_address text;

-- ===== 048_material_client_paid.sql =====
-- Track whether the customer already paid for a material purchase directly
-- (e.g. reimbursed the GC, or paid the store themselves), so cost vs. what the
-- client still owes stays accurate.
ALTER TABLE material_purchases
  ADD COLUMN IF NOT EXISTS client_paid boolean NOT NULL DEFAULT false;

-- ===== 049_company_roles.sql =====
-- Company-level role customization: edit what a standard role (Project
-- Manager, Office Staff, etc.) can do, or create a brand new user class from
-- scratch. One row per (company, role_key); `permissions` is a full
-- resource → {view,create,edit,delete} map, same shape as the hardcoded
-- defaults in lib/permissions.ts.
--   is_custom = false → this row OVERRIDES a built-in role's hardcoded defaults
--   is_custom = true  → this row DEFINES a brand-new role that didn't exist before

CREATE TABLE IF NOT EXISTS company_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies (id) ON DELETE CASCADE,
  role_key text NOT NULL,
  label text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_custom boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_roles_company_key ON company_roles (company_id, role_key);
-- ===== 050_sqft_and_space_type.sql =====
-- Track project square footage (interior under A/C, exterior under roof) and
-- let budget line items be classified interior/exterior so costs can be
-- broken down and totaled by space type.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS interior_sqft numeric(12,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS exterior_sqft numeric(12,2);

ALTER TABLE budget_line_items ADD COLUMN IF NOT EXISTS space_type text CHECK (space_type IN ('interior', 'exterior'));
-- ===== 051_pay_applications.sql =====
-- AIA-style Applications for Payment (G702 / G703) for commercial progress
-- billing and bank draws.
--
-- A pay_application is one billing period against a Schedule of Values.
--   subcontract_id IS NULL  -> the GC bills the owner/bank for the whole contract
--   subcontract_id IS SET   -> a subcontractor bills the GC for their scope
-- Each pay_application_line mirrors one G703 continuation-sheet row; the
-- "previous / this period / stored" columns are carried forward from prior
-- applications for the same schedule-of-values line.

CREATE TABLE IF NOT EXISTS pay_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  subcontract_id uuid REFERENCES subcontracts (id) ON DELETE CASCADE,
  application_number integer NOT NULL DEFAULT 1,
  period_start date,
  period_end date,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'certified', 'funded', 'rejected')),
  retainage_pct numeric(6, 3) NOT NULL DEFAULT 10,
  notes text,
  certified_by text,
  submitted_at timestamptz,
  certified_at timestamptz,
  funded_at timestamptz,
  created_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pay_applications_project ON pay_applications (project_id);
CREATE INDEX IF NOT EXISTS idx_pay_applications_subcontract ON pay_applications (subcontract_id);

CREATE TABLE IF NOT EXISTS pay_application_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_application_id uuid NOT NULL REFERENCES pay_applications (id) ON DELETE CASCADE,
  budget_line_item_id uuid REFERENCES budget_line_items (id) ON DELETE SET NULL,
  cost_code text,
  description text NOT NULL DEFAULT '',
  scheduled_value numeric(14, 2) NOT NULL DEFAULT 0,
  previous_completed numeric(14, 2) NOT NULL DEFAULT 0,
  this_period numeric(14, 2) NOT NULL DEFAULT 0,
  materials_stored numeric(14, 2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pay_application_lines_app ON pay_application_lines (pay_application_id);
-- ===== 052_project_billing_mode.sql =====
-- How a project bills, chosen when the job is set up. Decides which money flow
-- shows so a job isn't cluttered with both:
--   'simple' -> regular invoices + client payments/escrow (residential, small)
--   'aia'    -> AIA progress billing / pay applications (commercial, big jobs)

ALTER TABLE projects ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'simple'
  CHECK (billing_mode IN ('simple', 'aia'));
ALTER TABLE projects ADD COLUMN IF NOT EXISTS default_retainage_pct numeric(6, 3) NOT NULL DEFAULT 10;
-- ===== 053_company_billing_defaults.sql =====
-- Account-level defaults that pre-fill new projects, so a company sets its
-- normal way of billing once instead of per job.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS default_billing_mode text NOT NULL DEFAULT 'simple'
  CHECK (default_billing_mode IN ('simple', 'aia'));
ALTER TABLE companies ADD COLUMN IF NOT EXISTS default_retainage_pct numeric(6, 3) NOT NULL DEFAULT 10;
-- ===== 054_auto_logout.sql =====
-- Company security policy: sign users out after this many minutes of
-- inactivity. 0 = never (default, matches current behavior).

ALTER TABLE companies ADD COLUMN IF NOT EXISTS auto_logout_minutes integer NOT NULL DEFAULT 0;
-- ===== 055_rfi_answer_link.sql =====
-- One-time answer link for an RFI: the GC sends it to the architect/designer,
-- who can read the question + attachments and submit the answer with no
-- account, exactly like compliance document requests.

ALTER TABLE rfis ADD COLUMN IF NOT EXISTS answer_token text;
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS answer_requested_name text;
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS answer_requested_email text;
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS answer_link_created_at timestamptz;
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS response_attachments jsonb;
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS responded_by_name text;
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS responded_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rfis_answer_token ON rfis (answer_token) WHERE answer_token IS NOT NULL;

-- ===== 056_companies_rls_policy.sql =====
-- Security Advisor: "RLS Policy Always True" on public.companies.
--
-- The app authorizes everything in the API layer using the service-role key,
-- which bypasses RLS. Every other table keeps RLS enabled with NO policy, so
-- the public anon key sees zero rows (deny by default). The companies table had
-- a permissive USING(true) policy that opened it to anyone holding the anon key
-- via Supabase's auto REST API. This drops any permissive policies and replaces
-- them with a company-scoped read policy, matching the rest of the schema.

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- Drop every existing policy on companies (names may vary, incl. dashboard-made).
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'companies'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON companies', pol.policyname);
  END LOOP;
END $$;

-- A signed-in user may read only their own company row. Writes stay off for the
-- anon/authenticated keys - all writes go through the service-role API layer.
CREATE POLICY "companies_select_own" ON companies
  FOR SELECT
  USING (id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- ===== 057_quickbooks.sql =====
-- QuickBooks Online integration, phase 1 (SyteNav -> QBO push).
-- Per-company OAuth2 connection + entity id mapping so we never create
-- duplicates, plus a sync log for visibility/retry. All access is service-role
-- from the API layer; RLS stays on with no policy (deny to the public anon key),
-- matching the rest of the schema. Tokens live here and never touch the client.

CREATE TABLE IF NOT EXISTS quickbooks_connections (
  company_id uuid PRIMARY KEY REFERENCES companies (id) ON DELETE CASCADE,
  realm_id text NOT NULL,                 -- QBO company (realm) id
  qbo_company_name text,
  environment text NOT NULL DEFAULT 'sandbox', -- 'sandbox' | 'production'
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  access_expires_at timestamptz,          -- access token ~1h
  refresh_expires_at timestamptz,         -- refresh token ~100d
  status text NOT NULL DEFAULT 'connected', -- 'connected' | 'expired' | 'revoked'
  connected_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE quickbooks_connections ENABLE ROW LEVEL SECURITY;

-- Short-lived state tokens for the OAuth handshake (CSRF + which company).
CREATE TABLE IF NOT EXISTS quickbooks_oauth_states (
  state text PRIMARY KEY,
  company_id uuid REFERENCES companies (id) ON DELETE CASCADE,
  created_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE quickbooks_oauth_states ENABLE ROW LEVEL SECURITY;

-- What synced, when, and whether it worked - for the Settings sync panel + retry.
CREATE TABLE IF NOT EXISTS quickbooks_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies (id) ON DELETE CASCADE,
  entity_type text NOT NULL,              -- 'customer' | 'vendor' | 'bill' | 'payment'
  entity_id uuid,                         -- the SyteNav row
  direction text NOT NULL DEFAULT 'push', -- future: 'pull'
  action text,                            -- 'create' | 'update'
  status text NOT NULL,                   -- 'success' | 'error'
  qbo_id text,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE quickbooks_sync_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_qbo_sync_log_company ON quickbooks_sync_log (company_id, created_at DESC);

-- Entity id mapping: link each SyteNav row to its QBO counterpart.
ALTER TABLE customers       ADD COLUMN IF NOT EXISTS qbo_id text;
ALTER TABLE customers       ADD COLUMN IF NOT EXISTS qbo_synced_at timestamptz;
ALTER TABLE companies       ADD COLUMN IF NOT EXISTS qbo_vendor_id text;
ALTER TABLE companies       ADD COLUMN IF NOT EXISTS qbo_vendor_synced_at timestamptz;
ALTER TABLE invoices        ADD COLUMN IF NOT EXISTS qbo_id text;
ALTER TABLE invoices        ADD COLUMN IF NOT EXISTS qbo_synced_at timestamptz;
ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS qbo_id text;
ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS qbo_synced_at timestamptz;

-- ===== 058_sub_job_costing.sql =====
-- A subcontractor running their own job needs to see whether they're MAKING
-- money, not just what they quoted. Materials already come from
-- material_purchases and hours from time_entries, but there was no rate to
-- turn hours into a labor cost. Optional per-project hourly rate (0 = unset,
-- in which case the UI shows hours only and leaves labor out of the cost).

ALTER TABLE projects ADD COLUMN IF NOT EXISTS labor_rate numeric(12, 2) NOT NULL DEFAULT 0;

-- ===== 059_profiles_role_allow_custom_classes.sql =====
-- profiles.role had a CHECK constraint listing a fixed set of roles, which
-- predated both the 'worker' role and custom classes (company_roles), whose
-- keys are generated at runtime and can never be enumerated in a CHECK.
-- Assigning either failed with "violates check constraint profiles_role_check".
-- Validation lives in the API instead (isAssignableRole); unknown values
-- resolve to no-access via resolveRoleBase(), so they fail closed.

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

UPDATE profiles SET role = 'read_only' WHERE role IS NULL OR btrim(role) = '';

-- ===== 060_backfill_daily_log_authors.sql =====
-- daily_logs stored created_by but never created_by_name, the field the log
-- list and PDF render, so every log showed "Logged by" with nothing after it.
-- The insert now stamps the name; this backfills older rows.

UPDATE daily_logs dl
SET created_by_name = COALESCE(p.full_name, p.email)
FROM profiles p
WHERE dl.created_by = p.id
  AND (dl.created_by_name IS NULL OR btrim(dl.created_by_name) = '')
  AND COALESCE(p.full_name, p.email) IS NOT NULL;

-- ===== 061_daily_log_field_review.sql =====
-- Field submissions (note + photos from the mobile view) are observations the
-- site manager reviews, not finished daily logs. Mark where a log came from
-- and whether it has been reviewed; unreviewed field entries stay out of the
-- client-facing PDF.

ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'office';
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'reviewed';
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS reviewed_by uuid;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS reviewed_by_name text;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS source_daily_log_id uuid;

UPDATE daily_logs SET source = 'office' WHERE source IS NULL;
UPDATE daily_logs SET review_status = 'reviewed' WHERE review_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_daily_logs_review
  ON daily_logs (project_id, review_status);


-- ===== 062_soft_costs.sql =====
-- Every budget category was a trade, so there was nowhere to record the costs
-- a GC carries before and around the physical work: plans, permit fees,
-- builders risk, survey, loan interest, contingency. Those are soft costs and
-- they belong in the same budget so the job total is the real total.
-- 'hard' is the default, so every existing line keeps its current meaning.

ALTER TABLE budget_line_items
  ADD COLUMN IF NOT EXISTS cost_type text NOT NULL DEFAULT 'hard';

ALTER TABLE budget_template_items
  ADD COLUMN IF NOT EXISTS cost_type text NOT NULL DEFAULT 'hard';

CREATE INDEX IF NOT EXISTS idx_budget_line_items_cost_type
  ON budget_line_items (project_id, cost_type);


-- ===== 063_project_sites_units.sql =====
-- Bulk creation produced a flat pile of projects with addresses built by string
-- concatenation ("95 Edgecomb Ave Unit 3"). Two things were wrong with that:
--
--   1. Nothing tied the 40 units of one building together, so the projects list
--      was 40 unrelated rows and there was no way to see the building's total.
--   2. The unit was baked into the address text, which made the address
--      ungeocodable - bulk projects never got coordinates and never appeared on
--      the map.
--
-- Fix both by giving a project a parent and pulling unit/floor out of the
-- address. A "site" is an ordinary projects row flagged is_site: it holds the
-- one real, geocoded building address and its children hold the work. Every
-- existing project keeps parent_project_id NULL and is_site false, so nothing
-- about single-project creation changes.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS parent_project_id uuid REFERENCES projects (id) ON DELETE SET NULL;

-- A container: the building/subdivision itself. Holds the address, client,
-- plans and permits; the budget and schedule live on the children.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS is_site boolean NOT NULL DEFAULT false;

-- Kept separate from `address` so the address stays a clean, geocodable string
-- and every unit in a building can share the building's coordinates.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS floor text;

CREATE INDEX IF NOT EXISTS idx_projects_parent ON projects (parent_project_id)
  WHERE parent_project_id IS NOT NULL;


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


-- ===== 065_file_shares.sql =====
-- Sending documents OUT had no home. Compliance requests pull documents IN
-- from a sub, the client portal is read-only and permanent, and everything else
-- was "download it, attach it to an email, hope the attachment isn't too big".
--
-- The case that surfaced it: a GC pulling permits sends the expeditor a set of
-- plans and forms, and the expeditor sends the approved permit back. That is a
-- two-way exchange with someone who will never have an account.
--
-- Same shape as every other outside-party link in the app: a token, no account,
-- and a record of what was sent and when it was opened.

CREATE TABLE IF NOT EXISTS file_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies (id) ON DELETE CASCADE,
  -- Optional: a share can be about one job, or just company paperwork.
  project_id uuid REFERENCES projects (id) ON DELETE SET NULL,
  token text UNIQUE NOT NULL,

  name text NOT NULL,
  message text,
  -- Snapshot of what was sent: [{ name, url, type, size }]. Denormalised on
  -- purpose - the recipient must still see exactly what you sent even if the
  -- file is later renamed, re-filed, or deleted on your side.
  files jsonb NOT NULL DEFAULT '[]'::jsonb,

  recipient_name text,
  recipient_email text,

  -- Whether the recipient can send documents back on the same link.
  allow_upload boolean NOT NULL DEFAULT true,
  upload_prompt text,

  status text NOT NULL DEFAULT 'sent',   -- sent | viewed | responded
  expires_at timestamptz,
  revoked_at timestamptz,

  created_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz DEFAULT now(),
  viewed_at timestamptz,
  responded_at timestamptz
);

-- What came back. Kept separate from the sent snapshot so "they replied" is a
-- fact about the share rather than a mutation of what you sent.
CREATE TABLE IF NOT EXISTS file_share_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id uuid REFERENCES file_shares (id) ON DELETE CASCADE,
  name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  size_bytes bigint,
  note text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_file_shares_company ON file_shares (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_shares_project ON file_shares (project_id) WHERE project_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_file_shares_token ON file_shares (token);
CREATE INDEX IF NOT EXISTS idx_file_share_uploads_share ON file_share_uploads (share_id);


-- ===== 066_bid_package_scope.sql =====
-- Every bidder should answer the SAME questions: who supplies the material,
-- what is in scope, what is excluded, and what you need back besides a price.
-- That works with nothing but a set of plans, and it is what actually makes
-- bids comparable. Defaults per trade live in lib/trade-scopes.ts; these
-- columns store what was actually sent.

ALTER TABLE bid_packages ADD COLUMN IF NOT EXISTS package_type text NOT NULL DEFAULT 'turnkey';
ALTER TABLE bid_packages ADD COLUMN IF NOT EXISTS material_by text NOT NULL DEFAULT 'sub';
ALTER TABLE bid_packages ADD COLUMN IF NOT EXISTS included jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bid_packages ADD COLUMN IF NOT EXISTS excluded jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bid_packages ADD COLUMN IF NOT EXISTS ask_for jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bid_packages ADD COLUMN IF NOT EXISTS item_list jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE bid_requests ADD COLUMN IF NOT EXISTS package_type text NOT NULL DEFAULT 'turnkey';
ALTER TABLE bid_requests ADD COLUMN IF NOT EXISTS material_by text NOT NULL DEFAULT 'sub';
ALTER TABLE bid_requests ADD COLUMN IF NOT EXISTS included jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bid_requests ADD COLUMN IF NOT EXISTS excluded jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bid_requests ADD COLUMN IF NOT EXISTS ask_for jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bid_requests ADD COLUMN IF NOT EXISTS item_list jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS company_trade_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies (id) ON DELETE CASCADE,
  trade text NOT NULL,
  package_type text,
  material_by text,
  included jsonb NOT NULL DEFAULT '[]'::jsonb,
  excluded jsonb NOT NULL DEFAULT '[]'::jsonb,
  ask_for jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_trade_scopes_unique
  ON company_trade_scopes (company_id, lower(trade));


-- ===== 067_priced_items.sql =====
-- The other half of the item list.
--
-- 066 gave a package its item_list - the lines the GC sends out. This stores
-- what comes back: the same lines with a unit price against each one, so two
-- quotes on the same package can be compared line for line instead of total
-- against total.

ALTER TABLE bid_submissions ADD COLUMN IF NOT EXISTS priced_items jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS priced_items jsonb NOT NULL DEFAULT '[]'::jsonb;
