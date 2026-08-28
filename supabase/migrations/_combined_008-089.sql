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


-- ===== 068_selections.sql =====
-- Homeowner selections: the choices that aren't yours to make.
--
-- Paint colours, roof product, windows, siding, tile, cabinets, fixtures. The
-- GC carries an allowance for each in the budget and then waits. Nobody tracks
-- them anywhere, so they surface as a phone call the week the trade is standing
-- on site: "what colour?"
--
-- Two things have to be true for a selection to be safe: it has a date driven
-- by lead time (not by when the trade shows up), and it has an allowance, so
-- the moment they pick something dearer everyone can see the difference instead
-- of discovering it on the invoice.

CREATE TABLE IF NOT EXISTS project_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects (id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies (id) ON DELETE CASCADE,

  category text NOT NULL,          -- Flooring, Plumbing Fixtures, Interior Paint…
  item text NOT NULL,              -- "Master bath floor tile"
  location text,                   -- "Master bath" - same category, different rooms

  -- The money. allowance_amount is what the budget carries; selected_price is
  -- what they actually chose. The difference is a change order.
  allowance_amount numeric(14, 2),
  budget_line_item_id uuid REFERENCES budget_line_items (id) ON DELETE SET NULL,

  -- Driven by lead time, not by the schedule. A 6-week window order decided the
  -- week framing finishes is already late.
  needed_by date,
  lead_time_days integer,

  -- pending | waiting | chosen | ordered | installed
  status text NOT NULL DEFAULT 'pending',

  selected_option_id uuid,
  selected_name text,
  selected_price numeric(14, 2),
  selected_at timestamptz,
  selected_by_name text,

  change_order_id uuid REFERENCES change_orders (id) ON DELETE SET NULL,

  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- What they get to choose from. A selection with no options is still valid -
-- plenty of picks are "go to the showroom and tell us what you liked".
CREATE TABLE IF NOT EXISTS selection_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  selection_id uuid REFERENCES project_selections (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  -- Installed price for this option, comparable to the allowance.
  price numeric(14, 2),
  vendor text,
  image_url text,
  link_url text,
  -- The one the allowance was based on.
  is_allowance boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_selections_project ON project_selections (project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_project_selections_needed ON project_selections (project_id, needed_by);
CREATE INDEX IF NOT EXISTS idx_selection_options_selection ON selection_options (selection_id, sort_order);


-- ===== 069_selection_options_and_ordering.sql =====
-- Selections, after watching someone actually use one.
--
-- Three things were missing.
--
-- 1. You cannot choose a paint color from a text label. A selection is a VISUAL
--    decision - a swatch, a photo, a link to the product page. Options carried a
--    name and a price and nothing to look at.
--
-- 2. "Vendor" was one free-text box doing two different jobs. The BRAND is the
--    client's business (Kohler costs more than the builder-grade one, and that
--    is the whole reason there is a choice). The SUPPLIER is yours, and it needs
--    to be a real contact from the Directory because that is who the order goes
--    to. Splitting them.
--
-- 3. A decision that is chosen and never ordered is still a decision nobody
--    acted on. Ordering now records who it went to, for how much, and against
--    which budget line.

-- What the client is looking at
ALTER TABLE selection_options ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE selection_options ADD COLUMN IF NOT EXISTS color_hex text;
ALTER TABLE selection_options ADD COLUMN IF NOT EXISTS model_number text;

-- Who you buy it from. Free-text `vendor` stays as a fallback for a supplier
-- who was never added to the Directory.
ALTER TABLE selection_options
  ADD COLUMN IF NOT EXISTS vendor_company_id uuid REFERENCES companies (id) ON DELETE SET NULL;

-- Ordering
ALTER TABLE project_selections
  ADD COLUMN IF NOT EXISTS supplier_company_id uuid REFERENCES companies (id) ON DELETE SET NULL;
ALTER TABLE project_selections ADD COLUMN IF NOT EXISTS ordered_at timestamptz;
ALTER TABLE project_selections ADD COLUMN IF NOT EXISTS expected_delivery date;
ALTER TABLE project_selections
  ADD COLUMN IF NOT EXISTS material_purchase_id uuid REFERENCES material_purchases (id) ON DELETE SET NULL;

-- A client asking to change something already ordered. Not a silent edit - it
-- is a request, and somebody has to answer it.
ALTER TABLE project_selections ADD COLUMN IF NOT EXISTS change_requested_at timestamptz;
ALTER TABLE project_selections ADD COLUMN IF NOT EXISTS change_request_note text;

CREATE INDEX IF NOT EXISTS idx_project_selections_change_requested
  ON project_selections (project_id) WHERE change_requested_at IS NOT NULL;

-- A selection that goes over its allowance raises a change order. That change
-- order has to land on the SAME budget line the allowance came out of, or the
-- overage is real money floating free of the budget it belongs to.
ALTER TABLE change_orders
  ADD COLUMN IF NOT EXISTS budget_line_item_id uuid REFERENCES budget_line_items (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_change_orders_budget_line
  ON change_orders (budget_line_item_id) WHERE budget_line_item_id IS NOT NULL;

ALTER TABLE project_selections ADD COLUMN IF NOT EXISTS reference_url text;
ALTER TABLE project_selections ADD COLUMN IF NOT EXISTS reference_label text;

-- ===== 070_filled_documents.sql =====
-- Filling a PDF saves a NEW file and never touches the original, so the two
-- need a link between them: which document this was filled from, by whom, and
-- when. Not for legal weight - this fills in text and is deliberately not a
-- signature tool - but so "who typed that number in?" has an answer later.
ALTER TABLE company_files
  ADD COLUMN IF NOT EXISTS filled_from_id uuid REFERENCES company_files (id) ON DELETE SET NULL;
ALTER TABLE company_files
  ADD COLUMN IF NOT EXISTS filled_by text;
ALTER TABLE company_files
  ADD COLUMN IF NOT EXISTS filled_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_company_files_filled_from
  ON company_files (filled_from_id) WHERE filled_from_id IS NOT NULL;
-- ===== 071_compliance_requirements.sql =====
-- Which compliance documents a given vendor actually has to produce.
--
-- Until now this was hardcoded off the company type: a supplier needed a W-9,
-- everyone else needed COI + license + W-9 + workers' comp. Real vendors do not
-- fit that. A one-man sub with no employees has no workers' comp to give, and a
-- trade that is not licensed in the state has no license - and both sat as
-- "Missing" forever, dragging the job's compliance status red over a document
-- that was never coming.
--
-- A row here overrides the default for one document type. project_id NULL means
-- "this vendor, on every job"; set means just that job, and wins over the
-- company-wide row.

CREATE TABLE IF NOT EXISTS compliance_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects (id) ON DELETE CASCADE,
  type text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  /** Why it was waived - "no employees", "not licensed in NJ". */
  note text,
  updated_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One row per vendor+type company-wide, and one per vendor+type per job.
-- Partial indexes because NULL project_id would not otherwise collide.
CREATE UNIQUE INDEX IF NOT EXISTS uq_compliance_req_company
  ON compliance_requirements (company_id, type) WHERE project_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_compliance_req_project
  ON compliance_requirements (company_id, project_id, type) WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_compliance_req_company ON compliance_requirements (company_id);
-- ===== 072_invoice_breakdown.sql =====
-- Keep an invoice's breakdown, not just its total.
--
-- The scan already reads line items, subtotal, tax and retainage off the
-- document and then threw all of it away, storing a single `amount`. So the
-- most useful question about an invoice - what am I actually being charged for?
-- - could only be answered by opening the PDF, and the quote check could only
-- run at the moment of scanning, never afterwards.
--
-- line_items is [{ description, qty, unit, unit_price, amount }]; the same
-- shape subcontracts already use for quoted lines, so the two compare directly.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS line_items jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subtotal numeric(15, 2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax numeric(15, 2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS retainage numeric(15, 2);

-- The quote comparison as it stood when the invoice was recorded. Kept rather
-- than recomputed so the card still shows what was flagged at the time, even
-- after the contract is revised by a change order.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS quote_check jsonb;
-- ===== 073_per_item_markup.sql =====
-- Markup per cost item, for cost-plus billing.
--
-- The fee used to be one flat percentage multiplied across everything billed:
--   feeEarned = vendorBilled * contractor_fee_pct
-- That is not how cost-plus is actually billed. The electrician invoices
-- $35,000, you add your 15% and bill the client $40,250 - item by item. And
-- some items are not marked up at all: a permit fee, a deposit the client paid
-- direct, something you agreed to pass through at cost. With one flat rate the
-- only way to handle those was to fudge the percentage for the whole job.
--
-- NULL markup_pct means "use the project rate", so changing the project rate
-- still moves everything that has not been given its own answer. Storing 0
-- would be a different statement - it would mean "zero on this one" and would
-- stop following the project.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS markup_pct numeric(6, 3);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS markup_excluded boolean NOT NULL DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS markup_note text;

-- Receipts are cost too, and get marked up the same way on a cost-plus job.
ALTER TABLE material_purchases ADD COLUMN IF NOT EXISTS markup_pct numeric(6, 3);
ALTER TABLE material_purchases ADD COLUMN IF NOT EXISTS markup_excluded boolean NOT NULL DEFAULT false;
-- ===== 074_client_invoices.sql =====
-- Billing the CLIENT on a simple-billing job.
--
-- Until now there was no way to produce a bill to send a client on a job that
-- is not AIA - Pay Apps covers that, and Payments & Escrow only records money
-- that has already arrived. 43 of 44 projects are simple-billing, so this was
-- the common case, not an edge.
--
-- A client invoice is built from cost that has already been recorded: approved
-- sub invoices and material receipts, each carrying its own markup. Nothing is
-- retyped, and the amounts cannot drift from the costs they came from because
-- they are copied at the moment of billing and then left alone.

CREATE TABLE IF NOT EXISTS client_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'paid', 'void')),
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  /**
   * Whether the client sees the cost and your markup broken out, or a single
   * figure per line. Cost-plus contracts usually require the former - the
   * client is entitled to see what things cost. A fixed-price or "our price"
   * job shows the latter, and showing the markup there would be handing over
   * your margin.
   */
  show_markup boolean NOT NULL DEFAULT false,
  notes text,
  terms text,
  /** Copied at issue so a later change to the project rate cannot rewrite history. */
  markup_pct numeric(6, 3),
  sent_at timestamptz,
  paid_at timestamptz,
  created_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_invoices_project ON client_invoices (project_id);

-- One row per cost being billed on. cost/markup/amount are SNAPSHOTS - the
-- source invoice can later be edited, deleted or re-marked-up, and none of that
-- should silently change a bill the client has already been sent.
CREATE TABLE IF NOT EXISTS client_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_invoice_id uuid NOT NULL REFERENCES client_invoices (id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT '',
  /** Where this came from, so the same cost is never billed twice. */
  source_invoice_id uuid REFERENCES invoices (id) ON DELETE SET NULL,
  source_material_id uuid REFERENCES material_purchases (id) ON DELETE SET NULL,
  budget_line_item_id uuid REFERENCES budget_line_items (id) ON DELETE SET NULL,
  cost numeric(15, 2) NOT NULL DEFAULT 0,
  markup_pct numeric(6, 3) NOT NULL DEFAULT 0,
  markup numeric(15, 2) NOT NULL DEFAULT 0,
  amount numeric(15, 2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_client_invoice_lines_invoice ON client_invoice_lines (client_invoice_id);
-- A cost can only appear on one client invoice. This is the guard against
-- billing the same electrician's bill twice, which is the failure that costs
-- a relationship rather than just a correction.
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_invoice_line_source_invoice
  ON client_invoice_lines (source_invoice_id) WHERE source_invoice_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_invoice_line_source_material
  ON client_invoice_lines (source_material_id) WHERE source_material_id IS NOT NULL;
-- ===== 075_client_invoice_link.sql =====
-- A link the client can open, with no account.
--
-- The invoice printed and saved as a PDF, which still leaves you attaching a
-- file to an email. Same token-link pattern as the project portal, RFIs, bid
-- requests, compliance requests and file shares: one URL, no login, opens on a
-- phone.
--
-- Deliberately NOT emailed from here - there is no transactional email provider
-- configured, and a "send" button that silently does nothing is worse than a
-- copy button that plainly works. Copy the link, or open it in your own mail
-- client, until email lands.

ALTER TABLE client_invoices ADD COLUMN IF NOT EXISTS token text;
ALTER TABLE client_invoices ADD COLUMN IF NOT EXISTS viewed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_client_invoices_token
  ON client_invoices (token) WHERE token IS NOT NULL;
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
-- ===== 077_invoice_allocations.sql =====
-- One invoice, split across budget lines - at partial amounts.
--
-- Until now an invoice reached a budget line only through its SUBCONTRACT: the
-- line linked to that contract was where the money landed, and there was no way
-- to say otherwise. That is right for the common case (one sub, one trade, one
-- line) and wrong for the two that keep coming up:
--
--   * a supplier bill that crosses trades - lumber and windows on one invoice
--   * an invoice that only partly belongs to a line
--
-- So: allocations. An invoice may be split across as many lines as it needs,
-- each with its own amount.
--
-- SPLIT, NEVER OVERRIDE. This was the explicit instruction and the table shape
-- enforces it: there is no single budget_line_item_id on `invoices` that could
-- silently redirect a whole bill away from where its contract says it belongs.
-- An invoice either has allocations, which say exactly how it divides, or it
-- has none and falls back to its subcontract's line as before. Nothing is
-- migrated - every existing invoice keeps behaving exactly as it does today.
--
-- The rollup treats the two paths as mutually exclusive, so a bill cannot be
-- counted once through its allocations and again through its contract.

CREATE TABLE IF NOT EXISTS invoice_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  budget_line_item_id uuid NOT NULL REFERENCES budget_line_items (id) ON DELETE CASCADE,
  /**
   * The slice of the invoice landing on this line. Does NOT have to add up to
   * the invoice total - a partly-allocated bill is a normal state, and the
   * remainder simply follows the old subcontract route.
   */
  amount numeric(15, 2) NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_allocations_invoice
  ON invoice_allocations (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_allocations_line
  ON invoice_allocations (budget_line_item_id);

-- One row per line per invoice. Two slices of the same bill on the same line is
-- always a mistake, and it would make the totals impossible to reason about.
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_allocation_line
  ON invoice_allocations (invoice_id, budget_line_item_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Markup per budget line.
--
-- The rate could only live on the project or on one invoice. Setting "permits
-- at cost, electrical at 15%" meant remembering to do it on every single
-- invoice as it arrived, forever. Now the LINE carries the answer and every
-- invoice landing on it follows, with the per-invoice override still winning
-- when one bill genuinely differs.
--
-- Precedence, most specific first:
--   invoice.markup_excluded / markup_pct  (this one bill)
--   line.markup_excluded / markup_pct     (this trade)
--   project.contractor_fee_pct            (the job)
--
-- NULL means "follow the level above". An explicit 0 means zero, and the two
-- are deliberately different: storing 0 for "unset" would stop the line
-- following a later change to the project rate.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE budget_line_items
  ADD COLUMN IF NOT EXISTS markup_pct numeric(6, 3);
ALTER TABLE budget_line_items
  ADD COLUMN IF NOT EXISTS markup_excluded boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN budget_line_items.markup_pct IS
  'Cost-plus rate for this line, as a percent. NULL = follow the project rate.';
COMMENT ON COLUMN budget_line_items.markup_excluded IS
  'Everything on this line bills at cost, whatever the project rate says.';
-- ===== 078_setup_dismissals.sql =====
-- Who has hidden the setup checklist on which job.
--
-- It was in localStorage, which is the BROWSER, not the person. Two things
-- wrong with that:
--
--   * hide it on the laptop and it is still there on the phone, because the
--     two browsers know nothing about each other
--   * two people sharing a machine share the dismissal, so one person hiding
--     it takes it away from the other
--
-- Keyed on (user, project) it means what it should: this person, on this job,
-- has seen enough - everywhere they sign in, and nobody else affected.
--
-- Deliberately NOT on the project row. Setup guidance is a per-person thing;
-- an admin who knows the app should not be able to hide the walkthrough from
-- somebody who has just joined.

CREATE TABLE IF NOT EXISTS project_setup_dismissals (
  user_id uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_setup_dismissals_user
  ON project_setup_dismissals (user_id);

COMMENT ON TABLE project_setup_dismissals IS
  'One row per person per job who has hidden the setup checklist. Absence means show it.';
-- ===== 079_invite_sent_at.sql =====
-- When the invite email actually went out.
--
-- Approving an access request minted a token and sent nothing - the link was
-- copied and pasted by hand - so there was no way to answer the only question
-- that matters when somebody says they never got in: was an email ever sent to
-- this person, and when?
--
-- NULL on an approved row means "approved, nothing delivered". That is a real
-- and expected state, not a fault: sending is best-effort and stays unset
-- while the sending domain is unauthenticated, or when a send fails and the
-- admin falls back to copying the link.

ALTER TABLE access_requests
  ADD COLUMN IF NOT EXISTS invite_sent_at timestamptz;

COMMENT ON COLUMN access_requests.invite_sent_at IS
  'When the invite email was last successfully sent. NULL means never delivered - the link may still have been shared by hand.';
-- ===== 080_notification_preferences.sql =====
-- What each person wants to be told about, and how.
--
-- Settings already had a Notifications tab with eight switches. It persisted
-- nothing: the PATCH handler ended in `void notifications`. Somebody could turn
-- an email off, see the switch move, reload, and find it back on - having been
-- told they had changed something they had not.
--
-- A MISSING ROW MEANS "use the default in lib/notifications.ts". Deliberate:
--   * nothing has to be backfilled for existing people
--   * a new notification type behaves correctly on the day it ships, instead
--     of being silently off for everybody who signed up before it existed
--   * the only rows here are decisions somebody actually made

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  type    text NOT NULL,
  in_app  boolean NOT NULL DEFAULT true,
  email   boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, type)
);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_user
  ON notification_preferences (user_id);

COMMENT ON TABLE notification_preferences IS
  'Per-person, per-type notification choices. Absence means "use the catalog default in lib/notifications.ts", so nothing needs backfilling.';

-- Two columns that exist in PRODUCTION but in no migration file.
--
-- `title` and `link` were added to the live database by hand at some point and
-- never written down, so the numbered migrations describe a schema that has not
-- been true for a while. lib/notify.ts writes both - a fresh environment built
-- from these files would have failed on the first notification.
--
-- IF NOT EXISTS makes this a no-op on production and a repair everywhere else.
-- `link` is also what every notification email depends on: a mail saying "you
-- have been assigned a task" with nowhere to click is worse than no mail.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title text;

COMMENT ON COLUMN notifications.link IS
  'App-relative path this notification points at, e.g. /projects/<id>/tasks. NULL means there is nowhere specific to go.';
-- ===== 081_merge_bid_packages.sql =====
-- Fold the old bidding system into the live one.
--
-- There were two, and only age explains it:
--
--   bid_packages / bid_invitations / bids        migration 001
--   bid_requests / bid_invites / bid_submissions migration 024
--
-- 001 assumed every sub has an account: bid_invitations has a company_id and
-- nothing else - no token, no email. 024 exists precisely because that was
-- wrong, and nobody merged them. The Bids tab and the Quotes tab were the same
-- job under two names, in two different sections of the app.
--
-- THE DATA DECIDES THE DIRECTION. At the time of writing:
--   old: 5 packages, 3 invitations, 4 bids - last real bid 2026-06-24
--   new: 19 requests, 50 invites, 35 submissions - active yesterday
-- So this is not a reconciliation of two live systems. It is moving twelve
-- rows into the one people actually use.
--
-- NOTHING IS DROPPED. The old tables keep every row; a later change can remove
-- them once this has been live for a while. A migration that deletes is not one
-- you can walk back in a hurry.
--
-- Idempotent via legacy_id: re-running inserts nothing twice.

ALTER TABLE bid_requests    ADD COLUMN IF NOT EXISTS legacy_package_id uuid;
ALTER TABLE bid_invites     ADD COLUMN IF NOT EXISTS legacy_invitation_id uuid;
ALTER TABLE bid_submissions ADD COLUMN IF NOT EXISTS legacy_bid_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bid_requests_legacy    ON bid_requests (legacy_package_id)    WHERE legacy_package_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bid_invites_legacy     ON bid_invites (legacy_invitation_id)  WHERE legacy_invitation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bid_submissions_legacy ON bid_submissions (legacy_bid_id)     WHERE legacy_bid_id IS NOT NULL;

-- ── Packages become requests ────────────────────────────────────────────────
--
-- FOUR STATUS VOCABULARIES FOR TWO CONCEPTS, which is its own evidence of the
-- split. Mapped rather than force-fitted:
--
--   bid_packages    draft | open | closed | awarded
--   bid_requests    open | closed
--   bid_invitations invited | accepted | declined
--   bid_invites     invited | viewed | submitted | declined
--
-- 'awarded' and 'draft' have no home on bid_requests. An awarded package is
-- finished taking prices, so it becomes 'closed' - the award itself lives on
-- quote_comparisons.awarded_subcontract_id, not on this column. A draft was
-- never opened, so 'open' would be a lie and 'closed' is the honest answer.
-- `scope` was the package's name, so it becomes `title`. Everything else maps
-- one to one: package_type, material_by, included, excluded, ask_for and
-- item_list were back-ported onto both tables at some point, which is its own
-- evidence that these were always meant to be one thing.
INSERT INTO bid_requests (
  project_id, title, trade, description, due_date, status, created_at,
  package_type, material_by, included, excluded, ask_for, item_list,
  legacy_package_id
)
SELECT
  bp.project_id,
  COALESCE(NULLIF(bp.scope, ''), 'Untitled package'),
  bp.trade, bp.description, bp.due_date,
  CASE bp.status
    WHEN 'awarded' THEN 'closed'
    WHEN 'draft'   THEN 'closed'
    WHEN 'closed'  THEN 'closed'
    ELSE 'open'
  END,
  bp.created_at,
  bp.package_type, bp.material_by, bp.included, bp.excluded, bp.ask_for, bp.item_list,
  bp.id
FROM bid_packages bp
WHERE NOT EXISTS (SELECT 1 FROM bid_requests r WHERE r.legacy_package_id = bp.id);

-- ── Invitations become invites, and finally get a way to reach somebody ─────
-- THIS IS THE POINT OF THE WHOLE MIGRATION. A bid_invitation is a company_id
-- and nothing more, so an invited sub without a SyteNav account was invited and
-- never told, with no link to open even if they had been. Each one now gets a
-- token and whatever contact address the company has on file.
INSERT INTO bid_invites (
  bid_request_id, token, vendor_company_id, vendor_name, vendor_email,
  status, invited_at, legacy_invitation_id
)
SELECT
  r.id,
  encode(gen_random_bytes(16), 'hex'),
  bi.company_id,
  c.name,
  NULLIF(c.contact_email, ''),
  -- 'accepted' means the sub said they would price it, which is engagement
  -- short of a submission - 'viewed' is the nearest true thing on this table.
  CASE bi.status WHEN 'accepted' THEN 'viewed' WHEN 'declined' THEN 'declined' ELSE 'invited' END,
  bi.invited_at,
  bi.id
FROM bid_invitations bi
JOIN bid_requests r ON r.legacy_package_id = bi.bid_package_id
LEFT JOIN companies c ON c.id = bi.company_id
WHERE NOT EXISTS (SELECT 1 FROM bid_invites v WHERE v.legacy_invitation_id = bi.id);

-- ── Bids become submissions ─────────────────────────────────────────────────
-- Deliberately NOT carried: duration_days, crew_size, earliest_start_date,
-- payment_terms, scope_categories, revision_note. /bid/<token> collects none of
-- them, so they are aspirational columns on four stale rows. "How long, and
-- when can you start" is a good question to ask a sub - it is logged in
-- BACKLOG.md as a feature rather than smuggled in as a migration.
INSERT INTO bid_submissions (
  bid_request_id, bid_invite_id, amount, notes, file_url, file_name,
  submitted_by_name, created_at, priced_items, legacy_bid_id
)
SELECT
  r.id,
  v.id,
  b.amount,
  b.notes,
  b.proposal_url,
  CASE WHEN b.proposal_url IS NOT NULL THEN 'proposal' ELSE NULL END,
  c.name,
  COALESCE(b.submitted_at, b.created_at),
  b.priced_items,
  b.id
FROM bids b
JOIN bid_requests r ON r.legacy_package_id = b.bid_package_id
LEFT JOIN bid_invites v ON v.bid_request_id = r.id AND v.vendor_company_id = b.company_id
LEFT JOIN companies c ON c.id = b.company_id
WHERE NOT EXISTS (SELECT 1 FROM bid_submissions s WHERE s.legacy_bid_id = b.id);

COMMENT ON COLUMN bid_requests.legacy_package_id IS
  'The bid_packages row this came from in migration 081. NULL for anything created since.';
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
-- ─────────────────────────────────────────────────────────────────────────────
-- Asking the client for money that has no costs behind it yet.
--
-- The app could RECORD a deposit (client_payments, with a retainer flag) and it
-- could bill for work already done ("Bill the client" builds an invoice from
-- approved sub bills and receipts; AIA jobs raise a pay application). It had no
-- way to ASK for a deposit - which by definition has no costs behind it, so it
-- can never be built from them.
--
-- The result was a go-live checklist demanding "Deposit or first payment
-- received" with nothing in the product that asks for one.
--
-- WHY THIS IS NOT AN INVOICE ROW. An invoice here means "these approved costs,
-- plus markup". A deposit is an advance against work not yet done. Filing one
-- as an invoice would put it in the billed-costs totals and double-count it the
-- moment the real costs arrive.
--
-- The money side needs no new arithmetic: a deposit that lands is recorded as a
-- normal client_payment, and escrowBalance = received - escrowPaid - feeEarned
-- already draws it down as vendors get paid. This table is the ASK, and the
-- link to the payment that settled it.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_payment_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- What the client is being asked for, in their words. Comes from the
  -- estimate's payment stage ("Deposit", "40% at rough-in") so the wording
  -- matches the quote they already signed.
  label         text NOT NULL,
  amount        numeric NOT NULL CHECK (amount > 0),
  -- The stage's "when it's due" text, if the estimate had one. Free text on
  -- purpose: "on signing", "at rough-in" - real terms are not dates.
  due_hint      text,

  -- Which payment_stages entry this came from, so the Estimate's stage list can
  -- show what has already been asked for and not offer it twice. NULL for a
  -- one-off request typed by hand.
  stage_index   integer,

  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'paid', 'cancelled')),

  -- Only stamped on a confirmed send, never on opening a dialog.
  sent_at       timestamptz,
  sent_to       text,

  paid_at       timestamptz,
  -- The payment that settled it. ON DELETE SET NULL, not CASCADE: deleting a
  -- mistyped payment must not silently delete the request it was against - the
  -- request goes back to outstanding, which is the truth.
  client_payment_id uuid REFERENCES client_payments(id) ON DELETE SET NULL,

  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_payment_requests_project_idx
  ON client_payment_requests(project_id);

-- One live ask per estimate stage. Without this, double-clicking Request bills
-- the client twice for the same deposit. Partial, so a cancelled request can be
-- re-raised and a paid one does not block a later stage of the same index.
CREATE UNIQUE INDEX IF NOT EXISTS client_payment_requests_one_open_per_stage
  ON client_payment_requests(project_id, stage_index)
  WHERE stage_index IS NOT NULL AND status = 'pending';

ALTER TABLE client_payment_requests ENABLE ROW LEVEL SECURITY;

-- Reached only through the service-role API routes and the token-keyed portal,
-- exactly like client_payments. No anon policy: the portal query runs as the
-- service role after matching client_portal_token.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'client_payment_requests' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON client_payment_requests
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE client_payment_requests IS
  'A request to the client for money not yet backed by costs - deposits and quoted payment stages. Settled by a client_payments row; the escrow maths lives there, not here.';
-- ─────────────────────────────────────────────────────────────────────────────
-- Client invoices become receivables in QuickBooks.
--
-- Until now QuickBooks only heard about money when it ARRIVED, as a Sales
-- Receipt (a sale and its payment in one record). An invoice you raised and
-- were waiting on appeared nowhere - the books showed cash in, never money
-- owed. That is cash-basis, and it is why "will a new invoice show up in QB?"
-- had the answer "no, not even when it's paid - only the payment does".
--
-- THE RULE THAT SHAPES THIS: a sale must not be counted twice. A Sales Receipt
-- already means sold AND paid. Once an invoice exists in QuickBooks, the
-- payment that settles it must be a Payment applied against it, never a second
-- Sales Receipt - otherwise every job's revenue doubles.
--
-- `qbo_txn_type` records which model wrote a payment row. The receipts pushed
-- before this migration stay valid history; this column is what lets anybody
-- reading the ledger later tell the two eras apart instead of guessing.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE client_invoices  ADD COLUMN IF NOT EXISTS qbo_id text;
ALTER TABLE client_invoices  ADD COLUMN IF NOT EXISTS qbo_synced_at timestamptz;
ALTER TABLE client_payments  ADD COLUMN IF NOT EXISTS qbo_txn_type text;

-- Everything already in QuickBooks got there as a Sales Receipt.
UPDATE client_payments
   SET qbo_txn_type = 'sales_receipt'
 WHERE qbo_id IS NOT NULL AND qbo_txn_type IS NULL;

COMMENT ON COLUMN client_invoices.qbo_id IS
  'QuickBooks Invoice id. Set when the invoice is sent - a draft is not a receivable.';
COMMENT ON COLUMN client_payments.qbo_txn_type IS
  'Which QuickBooks record this payment became: sales_receipt (standalone, incl. deposits with no invoice to settle) or payment (applied against a QBO Invoice). Never both - that would double-count the sale.';
-- ─────────────────────────────────────────────────────────────────────────────
-- One record, one QuickBooks record. Even when the button is pressed twice.
--
-- The push guard was a read: "does this row have a qbo_id yet? no? push." Two
-- requests arriving together both read null before either wrote, and both
-- created. It happened within a day of shipping - one invoice sent at
-- 17:44:38.345 produced QuickBooks invoices 291 AND 292, 100ms apart, and the
-- row kept only the second. 291 became an orphan receivable: money the client
-- appears to owe, that no payment will ever settle.
--
-- A check-then-act guard cannot fix that; the check and the act have to be one
-- statement. `qbo_claimed_at` is claimed by a conditional UPDATE, which
-- Postgres serialises - exactly one caller comes back with a row.
--
-- Stale claims expire (see lib/quickbooks-push.ts) so a push that dies
-- mid-flight does not lock a record out of QuickBooks forever.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE client_invoices ADD COLUMN IF NOT EXISTS qbo_claimed_at timestamptz;
ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS qbo_claimed_at timestamptz;
ALTER TABLE invoices        ADD COLUMN IF NOT EXISTS qbo_claimed_at timestamptz;

COMMENT ON COLUMN client_invoices.qbo_claimed_at IS
  'Set atomically before a QuickBooks push to stop two concurrent pushes both creating. Cleared on failure; treated as expired after a couple of minutes so a crashed push self-heals.';
-- Customers push to QuickBooks the moment you add one, instead of appearing
-- lazily the first time somebody happens to invoice them - so the same
-- double-press race the invoices had needs closing here too.
--
-- See lib/quickbooks-push.ts: the claim is a conditional UPDATE, which is the
-- only guard that actually holds when two requests arrive together.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS qbo_claimed_at timestamptz;

COMMENT ON COLUMN customers.qbo_claimed_at IS
  'Set atomically before a QuickBooks push so two concurrent creates cannot both make a Customer. Same mechanism as client_invoices.qbo_claimed_at.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 087: a payment settles the invoice it was recorded against, and client
-- opens of an invoice are counted rather than only remembered once.
--
-- WHY. "Mark paid" on a client invoice records a payment, and QuickBooks was
-- then asked to guess which receivable that money settled: the oldest invoice
-- still 'sent'. Issue three invoices on one day and they share an issue_date,
-- so "oldest" is whichever row Postgres cared to return - a payment for
-- INV-0004 was on its way to settling INV-0002 in the books. The link the user
-- made is not a guess, so store it.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE client_payments
  ADD COLUMN IF NOT EXISTS client_invoice_id uuid REFERENCES client_invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS client_payments_client_invoice_id_idx
  ON client_payments (client_invoice_id);

COMMENT ON COLUMN client_payments.client_invoice_id IS
  'The client invoice this money settles, when it settles one. QuickBooks applies the payment against exactly this receivable instead of guessing at the oldest open invoice.';

-- viewed_at keeps its meaning (the FIRST open); these two answer the questions
-- a GC actually asks - how many times, and how recently.
ALTER TABLE client_invoices
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_viewed_at timestamptz;

UPDATE client_invoices
   SET view_count = 1,
       last_viewed_at = viewed_at
 WHERE viewed_at IS NOT NULL
   AND view_count = 0;

-- One statement, so two opens in the same instant both count.
CREATE OR REPLACE FUNCTION bump_client_invoice_view(p_id uuid)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE client_invoices
     SET view_count = COALESCE(view_count, 0) + 1,
         last_viewed_at = now(),
         viewed_at = COALESCE(viewed_at, now())
   WHERE id = p_id;
$$;

-- Only the server may count an open. Left to PUBLIC, anyone with the anon key
-- could inflate the count for any invoice id they cared to type.
REVOKE ALL ON FUNCTION bump_client_invoice_view(uuid) FROM public;
REVOKE ALL ON FUNCTION bump_client_invoice_view(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION bump_client_invoice_view(uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 088: a payment's reference number is its own field, not part of the memo.
--
-- WHY. The form asked for "Memo / check #" - one box doing two jobs - so the
-- check number went to QuickBooks as the MEMO, and QuickBooks' Reference no.
-- got SN-25b82dff, our internal tracking id. Reference no. is the column a
-- bookkeeper matches against a bank statement, so it has to hold the check
-- number. QuickBooks keeps the two apart; now so do we.
--
-- Existing rows keep their memo and get a null reference on purpose. Today's
-- memos are a mix of check numbers ("check1005", "check # 1002") and prose
-- ("Deposit", "Draw 4", "Invoice INV-0004"), and a guess at which is which
-- would put the word "Deposit" in a bank-reconciliation column.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE client_payments
  ADD COLUMN IF NOT EXISTS reference text;

COMMENT ON COLUMN client_payments.reference IS
  'The payer''s own reference - a check number, a wire confirmation. Sent to QuickBooks as Reference no. (PaymentRefNum / DocNumber). Falls back to SN-<id8> when blank so a record is never unmatchable.';
-- 089: paying a sub reaches QuickBooks.
--
-- WHY. Approving a sub's bill creates a QBO Bill - money you owe. Marking it
-- PAID recorded nothing over there, so the payable stayed open in QuickBooks
-- after the cash had gone out and A/P overstated every bill you had settled.
--
-- Exactly the mirror of the receivable bug fixed in 087/#323: on the money-IN
-- side an invoice reached QuickBooks and the payment settling it did not; on
-- the money-OUT side the bill reaches QuickBooks and the payment settling it
-- does not. Same shape, opposite direction.
--
-- The payment needs its OWN id and its own claim. Reusing `qbo_id` would mean
-- the bill and the money that settles it fight over one column, and the claim
-- that stops a double-press creating two records has to be able to say which
-- of the two it is holding.

alter table invoices
  add column if not exists qbo_payment_id text,
  add column if not exists qbo_payment_synced_at timestamptz,
  add column if not exists qbo_payment_claimed_at timestamptz;

create index if not exists invoices_qbo_payment_pending_idx
  on invoices (project_id)
  where qbo_id is not null and qbo_payment_id is null;

comment on column invoices.qbo_payment_id IS
  'The QBO BillPayment that settles this bill. Separate from qbo_id, which is the Bill itself - the two are different records and either can exist without the other.';
