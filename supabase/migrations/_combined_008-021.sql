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
