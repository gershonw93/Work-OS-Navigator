// Company
export type CompanyType = 'gc' | 'subcontractor'

export interface Company {
  id: string
  name: string
  type: CompanyType
  trade?: string
  contact_email: string
  phone?: string
  address?: string
  insurance_status: 'active' | 'expired' | 'missing'
  license_number?: string
  created_at: string
}

// Profile
export interface Profile {
  id: string
  company_id: string
  email: string
  full_name: string
  role: 'admin' | 'manager' | 'member'
  avatar_url?: string
  created_at: string
}

// Project
export type ProjectType = 'residential' | 'commercial' | 'mixed_use'
export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled'

export interface Project {
  id: string
  gc_company_id: string
  name: string
  address: string
  client: string
  start_date: string
  end_date?: string
  type: ProjectType
  status: ProjectStatus
  created_at: string
}

// Project Plans
export interface ProjectPlan {
  id: string
  project_id: string
  name: string
  plan_type: 'architectural' | 'structural' | 'mep' | 'civil' | 'landscape' | 'other'
  file_url: string
  created_at: string
}

// Bid Packages
export type BidPackageStatus = 'draft' | 'open' | 'closed' | 'awarded'

export interface BidPackage {
  id: string
  project_id: string
  scope: string
  description: string
  due_date?: string
  status: BidPackageStatus
  created_at: string
}

// Bid Invitations
export interface BidInvitation {
  id: string
  bid_package_id: string
  company_id: string
  status: 'invited' | 'accepted' | 'declined'
  invited_at: string
}

// Bids
export type BidStatus = 'pending' | 'submitted' | 'awarded' | 'rejected'

export interface Bid {
  id: string
  bid_package_id: string
  company_id: string
  amount: number
  notes?: string
  status: BidStatus
  submitted_at?: string
  created_at: string
}

// Subcontracts
export type SubcontractStatus = 'active' | 'completed' | 'terminated'

export interface Subcontract {
  id: string
  project_id: string
  bid_id?: string
  company_id: string
  scope: string
  trade: string
  contract_amount: number
  status: SubcontractStatus
  created_at: string
}

// Payment Schedule
export interface PaymentScheduleItem {
  id: string
  subcontract_id: string
  label: string
  type: 'percent' | 'milestone'
  percentage?: number
  amount?: number
  milestone_description?: string
  status: 'pending' | 'invoiced' | 'paid'
  order_index: number
}

// Tasks
export type TaskStatus = 'not_started' | 'in_progress' | 'complete'

export interface Task {
  id: string
  project_id: string
  subcontract_id?: string
  title: string
  description?: string
  status: TaskStatus
  due_date?: string
  assigned_to?: string
  created_at: string
}

// Schedule
export interface ScheduleItem {
  id: string
  project_id: string
  subcontract_id: string
  start_date: string
  end_date: string
  created_at: string
}

// Daily Logs
export interface DailyLog {
  id: string
  project_id: string
  log_date: string
  workers_onsite: number
  notes: string
  weather?: string
  created_by: string
  created_at: string
}

// RFIs
export type RFIStatus = 'open' | 'answered' | 'closed'

export interface RFI {
  id: string
  project_id: string
  question: string
  response?: string
  status: RFIStatus
  created_by: string
  created_at: string
}

// Invoices
export type InvoiceStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid'

export interface Invoice {
  id: string
  subcontract_id: string
  project_id: string
  payment_schedule_item_id?: string
  amount: number
  status: InvoiceStatus
  submitted_at?: string
  approved_at?: string
  paid_at?: string
  created_at: string
}

// Permits
export type PermitStatus = 'not_started' | 'submitted' | 'issued' | 'expired' | 'closed'

export interface Permit {
  id: string
  project_id: string
  type: string
  permit_number?: string
  status: PermitStatus
  expiry_date?: string
  created_at: string
}

// Inspections
export type InspectionStatus = 'requested' | 'scheduled' | 'passed' | 'failed'

export interface Inspection {
  id: string
  project_id: string
  type: string
  status: InspectionStatus
  scheduled_date?: string
  notes?: string
  created_at: string
}

// Compliance Documents
export type ComplianceDocType = 'coi' | 'license' | 'w9' | 'workers_comp'
export type ComplianceStatus = 'missing' | 'pending' | 'approved' | 'expired'

export interface ComplianceDocument {
  id: string
  company_id: string
  project_id?: string
  type: ComplianceDocType
  status: ComplianceStatus
  expiry_date?: string
  file_url?: string
  created_at: string
}

// Notifications
export interface Notification {
  id: string
  user_id: string
  type: string
  message: string
  read: boolean
  created_at: string
}
