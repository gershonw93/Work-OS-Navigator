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
