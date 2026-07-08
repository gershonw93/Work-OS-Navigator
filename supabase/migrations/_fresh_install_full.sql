-- ============================================================
-- SyteNav FULL fresh-install schema (001 → 050).
-- Use ONLY on a brand-new/empty Supabase project. On the
-- original production DB, run _combined_008-050.sql instead.
-- ============================================================

-- ===== 001_initial_schema.sql =====
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- COMPANIES
-- ============================================================
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('gc', 'subcontractor')),
  trade TEXT,
  contact_email TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  insurance_status TEXT NOT NULL DEFAULT 'missing' CHECK (insurance_status IN ('active', 'expired', 'missing')),
  license_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_companies_type ON companies (type);

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'manager', 'member')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_company_id ON profiles (company_id);

-- ============================================================
-- PROJECTS
-- ============================================================
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gc_company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  client TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  type TEXT NOT NULL CHECK (type IN ('residential', 'commercial', 'mixed_use')),
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'on_hold', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_projects_gc_company_id ON projects (gc_company_id);
CREATE INDEX idx_projects_status ON projects (status);

-- ============================================================
-- PROJECT PLANS
-- ============================================================
CREATE TABLE project_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('architectural', 'structural', 'mep', 'civil', 'landscape', 'other')),
  file_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_plans_project_id ON project_plans (project_id);

-- ============================================================
-- BID PACKAGES
-- ============================================================
CREATE TABLE bid_packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  description TEXT NOT NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed', 'awarded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bid_packages_project_id ON bid_packages (project_id);
CREATE INDEX idx_bid_packages_status ON bid_packages (status);

-- ============================================================
-- BID INVITATIONS
-- ============================================================
CREATE TABLE bid_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bid_package_id UUID NOT NULL REFERENCES bid_packages (id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'accepted', 'declined')),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bid_invitations_bid_package_id ON bid_invitations (bid_package_id);
CREATE INDEX idx_bid_invitations_company_id ON bid_invitations (company_id);

-- ============================================================
-- BIDS
-- ============================================================
CREATE TABLE bids (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bid_package_id UUID NOT NULL REFERENCES bid_packages (id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  amount NUMERIC(15, 2) NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'awarded', 'rejected')),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bids_bid_package_id ON bids (bid_package_id);
CREATE INDEX idx_bids_company_id ON bids (company_id);
CREATE INDEX idx_bids_status ON bids (status);

-- ============================================================
-- SUBCONTRACTS
-- ============================================================
CREATE TABLE subcontracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  bid_id UUID REFERENCES bids (id) ON DELETE SET NULL,
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  trade TEXT NOT NULL,
  contract_amount NUMERIC(15, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'terminated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subcontracts_project_id ON subcontracts (project_id);
CREATE INDEX idx_subcontracts_company_id ON subcontracts (company_id);
CREATE INDEX idx_subcontracts_bid_id ON subcontracts (bid_id);

-- ============================================================
-- PAYMENT SCHEDULE ITEMS
-- ============================================================
CREATE TABLE payment_schedule_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subcontract_id UUID NOT NULL REFERENCES subcontracts (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('percent', 'milestone')),
  percentage NUMERIC(5, 2),
  amount NUMERIC(15, 2),
  milestone_description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'invoiced', 'paid')),
  order_index INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_payment_schedule_items_subcontract_id ON payment_schedule_items (subcontract_id);

-- ============================================================
-- SCHEDULE ITEMS
-- ============================================================
CREATE TABLE schedule_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  subcontract_id UUID NOT NULL REFERENCES subcontracts (id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_schedule_items_project_id ON schedule_items (project_id);
CREATE INDEX idx_schedule_items_subcontract_id ON schedule_items (subcontract_id);

-- ============================================================
-- TASKS
-- ============================================================
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  subcontract_id UUID REFERENCES subcontracts (id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'complete')),
  due_date DATE,
  assigned_to UUID REFERENCES profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_project_id ON tasks (project_id);
CREATE INDEX idx_tasks_subcontract_id ON tasks (subcontract_id);
CREATE INDEX idx_tasks_status ON tasks (status);

-- ============================================================
-- DAILY LOGS
-- ============================================================
CREATE TABLE daily_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  workers_onsite INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL,
  weather TEXT,
  created_by UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_daily_logs_project_id ON daily_logs (project_id);
CREATE INDEX idx_daily_logs_log_date ON daily_logs (log_date);

-- ============================================================
-- RFIs
-- ============================================================
CREATE TABLE rfis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  response TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'closed')),
  created_by UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rfis_project_id ON rfis (project_id);
CREATE INDEX idx_rfis_status ON rfis (status);

-- ============================================================
-- INVOICES
-- ============================================================
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subcontract_id UUID NOT NULL REFERENCES subcontracts (id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  payment_schedule_item_id UUID REFERENCES payment_schedule_items (id) ON DELETE SET NULL,
  amount NUMERIC(15, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'paid')),
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoices_project_id ON invoices (project_id);
CREATE INDEX idx_invoices_subcontract_id ON invoices (subcontract_id);
CREATE INDEX idx_invoices_status ON invoices (status);

-- ============================================================
-- PERMITS
-- ============================================================
CREATE TABLE permits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  permit_number TEXT,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'submitted', 'issued', 'expired', 'closed')),
  expiry_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_permits_project_id ON permits (project_id);
CREATE INDEX idx_permits_status ON permits (status);

-- ============================================================
-- INSPECTIONS
-- ============================================================
CREATE TABLE inspections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'scheduled', 'passed', 'failed')),
  scheduled_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inspections_project_id ON inspections (project_id);
CREATE INDEX idx_inspections_status ON inspections (status);

-- ============================================================
-- COMPLIANCE DOCUMENTS
-- ============================================================
CREATE TABLE compliance_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects (id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('coi', 'license', 'w9', 'workers_comp')),
  status TEXT NOT NULL DEFAULT 'missing' CHECK (status IN ('missing', 'pending', 'approved', 'expired')),
  expiry_date DATE,
  file_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_compliance_documents_company_id ON compliance_documents (company_id);
CREATE INDEX idx_compliance_documents_project_id ON compliance_documents (project_id);
CREATE INDEX idx_compliance_documents_status ON compliance_documents (status);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON notifications (user_id);
CREATE INDEX idx_notifications_read ON notifications (read);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcontracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_schedule_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- TODO: Add RLS policies for each table based on company_id context
-- Example pattern:
-- CREATE POLICY "Users can view their own company data" ON companies
--   FOR SELECT USING (id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- ===== 002_permission_overrides.sql =====
-- Per-user permission overrides.
-- Effective permission = role default (defined in code) unless a value here overrides it.
-- Shape: { "<resource>": { "view": true, "create": false, ... }, ... }
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS permission_overrides jsonb DEFAULT '{}'::jsonb;

-- ===== 003_impersonation_log.sql =====
-- Audit log for platform-owner impersonation ("log in as" for customer support)
CREATE TABLE IF NOT EXISTS impersonation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,          -- the super-admin who impersonated
  actor_email text,
  target_id uuid NOT NULL,         -- the user who was impersonated
  target_email text,
  target_company_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_impersonation_log_actor ON impersonation_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_log_target ON impersonation_log(target_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_log_created ON impersonation_log(created_at DESC);

-- ===== 004_manual_subcontractors.sql =====
-- Manually-added (off-platform) subcontractors + their uploaded proposals
ALTER TABLE subcontracts ADD COLUMN IF NOT EXISTS added_manually boolean DEFAULT false;
ALTER TABLE subcontracts ADD COLUMN IF NOT EXISTS proposal_url text;

-- ===== 005_subcontract_line_items.sql =====
-- Scope of work as structured line items (description + amount), e.g. from an AI-parsed proposal
ALTER TABLE subcontracts ADD COLUMN IF NOT EXISTS line_items jsonb DEFAULT '[]'::jsonb;

-- ===== 006_schedule_items_milestones.sql =====
-- Allow milestone-only schedule items (no subcontract required)
ALTER TABLE schedule_items ALTER COLUMN subcontract_id DROP NOT NULL;

-- Add label and color for manual milestones
ALTER TABLE schedule_items ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE schedule_items ADD COLUMN IF NOT EXISTS color TEXT;

-- ===== 007_compliance_documents_notes.sql =====
-- Add notes column and expand type/status enums for compliance_documents
ALTER TABLE compliance_documents ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE compliance_documents DROP CONSTRAINT IF EXISTS compliance_documents_type_check;
ALTER TABLE compliance_documents ADD CONSTRAINT compliance_documents_type_check
  CHECK (type IN ('coi', 'license', 'w9', 'workers_comp', 'other'));

ALTER TABLE compliance_documents DROP CONSTRAINT IF EXISTS compliance_documents_status_check;
ALTER TABLE compliance_documents ADD CONSTRAINT compliance_documents_status_check
  CHECK (status IN ('missing', 'pending', 'approved', 'expired', 'expiring_soon'));

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
-- SyteNav — combined migrations 008–015
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
--   • client_payments — incoming funds from the client (deposits/draws)
--   • projects.contractor_fee_pct — management fee rate (e.g. 0.15 = 15%)
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
-- invoice record. Subs don't need an account — the GC records the invoice and
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
-- Private per-user token for the iCal calendar subscription feed. Optional — the
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
