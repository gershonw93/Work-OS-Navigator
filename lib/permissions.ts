// ─────────────────────────────────────────────────────────────────────────────
// WorkOS Navigator - Permission model
//
// Two levels:
//   1. ROLE_DEFAULTS  - fixed in code. What each role can do out of the box.
//   2. per-user overrides - stored in profiles.permission_overrides (jsonb).
//      An override replaces the default for a single resource+action.
//
// Effective permission = role default, unless a per-user override exists.
// ─────────────────────────────────────────────────────────────────────────────

export const ACTIONS = ['view', 'create', 'edit', 'delete'] as const
export type Action = (typeof ACTIONS)[number]

export type Perm = Partial<Record<Action, boolean>>
export type PermMap = Record<string, Perm>
export type OverrideMap = Record<string, Partial<Record<Action, boolean>>>

// ── Resource catalog (grouped for the UI grid) ───────────────────────────────
export interface ResourceDef {
  key: string
  label: string
  group: string
  /** route slug if this maps to a project tab */
  slug?: string
}

export const RESOURCE_GROUPS = ['Field', 'People', 'Money', 'Compliance', 'Workspace', 'Settings'] as const

export const RESOURCES: ResourceDef[] = [
  // Field (project tabs)
  { key: 'plans',          label: 'Plans',          group: 'Field', slug: 'plans' },
  { key: 'schedule',       label: 'Schedule',       group: 'Field', slug: 'schedule' },
  { key: 'tasks',          label: 'Tasks',          group: 'Field', slug: 'tasks' },
  { key: 'progress',       label: 'Progress',       group: 'Field', slug: 'progress' },
  { key: 'daily-logs',     label: 'Daily Logs',     group: 'Field', slug: 'daily-logs' },
  { key: 'time',           label: 'Time Clock',     group: 'Field', slug: 'time' },
  // People
  { key: 'team',           label: 'Team',           group: 'People', slug: 'team' },
  { key: 'bids',           label: 'Bids',           group: 'People', slug: 'bids' },
  { key: 'rfis',           label: 'RFIs',           group: 'People', slug: 'rfis' },
  // Money
  { key: 'invoices',       label: 'Invoices',       group: 'Money', slug: 'invoices' },
  { key: 'pay-apps',       label: 'Pay Applications', group: 'Money', slug: 'pay-apps' },
  { key: 'payments',       label: 'Payments & Escrow', group: 'Money', slug: 'payments' },
  { key: 'budget',         label: 'Budget',         group: 'Money', slug: 'budget' },
  { key: 'request-quotes', label: 'Request Quotes', group: 'Money', slug: 'request-quotes' },
  { key: 'quotes',         label: 'Compare Quotes', group: 'Money', slug: 'quotes' },
  { key: 'financials',     label: 'Financials',     group: 'Money', slug: 'financials' },
  { key: 'change-orders',  label: 'Change Orders',  group: 'Money', slug: 'change-orders' },
  // Compliance
  { key: 'permits',        label: 'Permits',        group: 'Compliance', slug: 'permits' },
  { key: 'inspections',    label: 'Inspections',    group: 'Compliance', slug: 'inspections' },
  { key: 'submittals',     label: 'Submittals',     group: 'Compliance', slug: 'submittals' },
  { key: 'compliance',     label: 'Compliance',     group: 'Compliance', slug: 'compliance' },
  { key: 'reports',        label: 'Reports',        group: 'Compliance', slug: 'reports' },
  // Workspace (global nav)
  { key: 'dashboard',      label: 'Dashboard',      group: 'Workspace' },
  { key: 'projects',       label: 'Projects',       group: 'Workspace' },
  { key: 'customers',      label: 'Customers',      group: 'Workspace' },
  { key: 'directory',      label: 'Directory',      group: 'Workspace' },
  { key: 'files',          label: 'Files',          group: 'Workspace' },
  { key: 'equipment',      label: 'Equipment',      group: 'Workspace' },
  { key: 'materials',      label: 'Materials',      group: 'Workspace' },
  { key: 'approvals',      label: 'Approvals',      group: 'Workspace' },
  // Settings
  { key: 'settings_company', label: 'Company Settings', group: 'Settings' },
  { key: 'settings_team',    label: 'Team & Users',     group: 'Settings' },
  { key: 'settings_billing', label: 'Billing',          group: 'Settings' },
]

// ── Permission level shorthands ──────────────────────────────────────────────
const N: Perm = {}
const V: Perm = { view: true }
const VE: Perm = { view: true, edit: true }
const VC: Perm = { view: true, create: true }
const VCE: Perm = { view: true, create: true, edit: true }
const FULL: Perm = { view: true, create: true, edit: true, delete: true }

function buildAllFull(): PermMap {
  const m: PermMap = {}
  for (const r of RESOURCES) m[r.key] = { ...FULL }
  return m
}

// ── Role defaults ────────────────────────────────────────────────────────────
// Roles whose project views are scoped to ONLY projects/tasks they're assigned to.
export const ASSIGNED_ONLY_ROLES = ['field_supervisor', 'worker', 'member', 'read_only']

// Roles that get the stripped-down mobile "Field Mode" shell instead of the
// full office app. Kept narrow on purpose: supervisors stay in the responsive
// dashboard for now (they need budgets/compliance breadth).
export const FIELD_ROLES = ['worker', 'member']

export const ROLE_DEFAULTS: Record<string, PermMap> = {
  admin: buildAllFull(),

  manager: buildAllFull(), // alias of admin-level operational access

  project_manager: {
    plans: FULL, schedule: FULL, tasks: FULL, progress: FULL, 'daily-logs': FULL, time: FULL,
    team: VE, bids: FULL, rfis: FULL,
    invoices: VE, 'pay-apps': FULL, payments: VE, budget: FULL, quotes: FULL, 'request-quotes': FULL, financials: N, 'change-orders': FULL,
    permits: FULL, inspections: FULL, submittals: FULL, compliance: V, reports: N,
    dashboard: V, projects: VCE, customers: VE, directory: V, files: FULL, equipment: FULL, materials: FULL, approvals: VE,
    settings_company: N, settings_team: N, settings_billing: N,
  },

  office_staff: {
    plans: V, schedule: V, tasks: V, progress: V, 'daily-logs': V, time: VC,
    team: V, bids: V, rfis: V,
    invoices: FULL, 'pay-apps': FULL, payments: FULL, budget: FULL, quotes: FULL, 'request-quotes': FULL, financials: V, 'change-orders': FULL,
    permits: VE, inspections: VE, submittals: VE, compliance: FULL, reports: V,
    dashboard: V, projects: V, customers: VE, directory: V, files: FULL, equipment: FULL, materials: FULL, approvals: VE,
    settings_company: N, settings_team: N, settings_billing: N,
  },

  field_supervisor: {
    plans: V, schedule: V, tasks: VE, progress: VE, 'daily-logs': VCE, time: VCE,
    team: V, bids: N, rfis: V,
    invoices: N, payments: N, budget: N, quotes: N, 'request-quotes': N, financials: N, 'change-orders': N,
    permits: N, inspections: N, submittals: N, compliance: N, reports: N,
    dashboard: V, projects: V, customers: N, directory: V, files: V, equipment: VCE, materials: VCE, approvals: V,
    settings_company: N, settings_team: N, settings_billing: N,
  },

  worker: {
    plans: V, schedule: N, tasks: VE, progress: V, 'daily-logs': VC, time: VC,
    team: N, bids: N, rfis: N,
    invoices: N, payments: N, budget: N, quotes: N, 'request-quotes': N, financials: N, 'change-orders': N,
    permits: N, inspections: N, submittals: N, compliance: N, reports: N,
    dashboard: V, projects: V, customers: N, directory: N, files: V, equipment: VC, materials: VC, approvals: V,
    settings_company: N, settings_team: N, settings_billing: N,
  },

  read_only: {
    plans: V, schedule: V, tasks: V, progress: V, 'daily-logs': V, time: VC,
    team: V, bids: N, rfis: V,
    invoices: N, payments: N, budget: N, quotes: N, 'request-quotes': N, financials: N, 'change-orders': N,
    permits: N, inspections: N, submittals: N, compliance: N, reports: N,
    dashboard: V, projects: V, customers: N, directory: V, files: V, equipment: V, materials: V, approvals: V,
    settings_company: N, settings_team: N, settings_billing: N,
  },
}
// member behaves like worker
ROLE_DEFAULTS.member = ROLE_DEFAULTS.worker

export function getRoleDefaults(role: string | null | undefined): PermMap {
  return ROLE_DEFAULTS[role ?? ''] ?? ROLE_DEFAULTS.read_only
}

export function isBuiltinRole(role: string | null | undefined): boolean {
  return !!role && Object.prototype.hasOwnProperty.call(ROLE_DEFAULTS, role)
}

// All-N base map for a brand-new custom role with nothing granted yet.
export function buildAllNone(): PermMap {
  const m: PermMap = {}
  for (const r of RESOURCES) m[r.key] = { ...N }
  return m
}

// A company can override a built-in role's hardcoded defaults, or define a
// brand-new role (a "class") that never existed in code. `companyRoleMap` is
// keyed by role_key -> a full PermMap, loaded from the company_roles table.
export function resolveRoleBase(role: string | null | undefined, companyRoleMap?: Record<string, PermMap> | null): PermMap {
  const key = role ?? ''
  if (companyRoleMap && companyRoleMap[key]) return JSON.parse(JSON.stringify(companyRoleMap[key]))
  if (isBuiltinRole(role)) return getRoleDefaults(role)
  return buildAllNone()
}

// ── Effective permissions (defaults + per-user overrides) ─────────────────────
export function getEffectivePermissions(
  role: string | null | undefined,
  overrides?: OverrideMap | null,
  baseDefaults?: PermMap,
): PermMap {
  const defaults = baseDefaults ?? getRoleDefaults(role)
  if (!overrides || Object.keys(overrides).length === 0) {
    // deep copy so callers can't mutate the shared default object
    return JSON.parse(JSON.stringify(defaults))
  }
  const result: PermMap = JSON.parse(JSON.stringify(defaults))
  for (const [resource, actions] of Object.entries(overrides)) {
    result[resource] = { ...(result[resource] ?? {}) }
    for (const [action, allowed] of Object.entries(actions)) {
      result[resource][action as Action] = !!allowed
    }
  }
  return result
}

export function can(perms: PermMap | null | undefined, resource: string, action: Action = 'view'): boolean {
  return !!perms?.[resource]?.[action]
}

export function isAssignedOnly(role: string | null | undefined): boolean {
  return ASSIGNED_ONLY_ROLES.includes(role ?? '')
}
