import { createCustomer, updateCustomer } from '@/lib/writes/customer'
import { createProject, updateProject } from '@/lib/writes/project'
import { addTeamMember, updateTeamMember } from '@/lib/writes/team-member'
import { updateDirectoryContact } from '@/lib/writes/directory-contact-edit'
import { projectFormErrors } from '@/lib/project-rules'
import { PROJECT_STATUSES } from '@/lib/activation'
import { CONTRACT_TYPES, asContractType } from '@/lib/contract-type'
import { JOB_ROLES } from '@/lib/team-member'
import {
  PROJECT_ID, DATE, VIA, str, isDate, fold, failed, capped, outcome, given, onJob,
  type ToolDef, type WriteToolDef,
} from '../tool-kit'

// ─────────────────────────────────────────────────────────────────────────────
// Claude's tools for customers, projects, a job's team roster and correcting a
// Directory contact. The dispatcher in ../tools.ts gates every one before it
// runs (connection consent, permission + action, billing lock, the job).
//
// WHAT HOLDS HERE, beyond the rules every write tool follows:
//   - NOTHING IN THIS FILE WRITES. Every record goes through lib/writes/*, the
//     same functions the app's routes call.
//   - OPENING A JOB MEETS THE PROJECT CAP, and so does moving one back into a
//     counted status - both live in lib/writes/project.ts, not in the route,
//     precisely so this door cannot go round them.
//   - AN EDIT PASSES AN ALLOW-LIST, NARROWER THAN THE ROUTE. A project edit
//     carries no money (contractor fee, sale price, labour rate, billing mode,
//     retainage, contract type, fee on materials) and no acknowledgement of
//     the go-live pre-flight: going Active with open concerns is refused with
//     the app's own sentence and left for a person to confirm in the app.
//   - A CUSTOMER IS NOT PUSHED TO QUICKBOOKS FROM HERE. The app's routes push
//     on save; Claude's door does not, by the rule that nothing on the write
//     path reaches QuickBooks. A new customer reaches the books with its first
//     pushed invoice; a correction on the next Settings -> QuickBooks sync.
//   - ADDING SOMEBODY TO A TEAM IS A ROSTER LINE, NEVER AN INVITE. Nobody is
//     emailed and no login is made; inviting stays a button in the app.
//   - A DIRECTORY CONTACT CAN BE CORRECTED ONLY IF THIS COMPANY ADDED IT - a
//     contact is a `companies` row, and another firm's own account is theirs.
// ─────────────────────────────────────────────────────────────────────────────

const QBO_NOTE = 'QuickBooks is not updated from here: the customer reaches QuickBooks with its first pushed invoice, or when somebody runs the customer sync on Settings -> QuickBooks.'

const PROJECT_TYPES = ['residential', 'commercial', 'mixed_use'] as const
const CONTACT_TYPES = ['subcontractor', 'supplier', 'inspector', 'other'] as const

const customerOut = (c: any) => ({
  id: c.id, name: c.name, contact_name: c.contact_name ?? null, email: c.email ?? null,
  phone: c.phone ?? null, billing_address: c.billing_address ?? null,
})

/** Is this customer card one of this company's? A failed read says so rather than "no". */
async function customerProblem(db: any, companyId: string, id: unknown): Promise<string | null> {
  if (typeof id !== 'string' || !id.trim()) return 'Say which customer: the id is missing. Use list_customers.'
  const { data, error } = await db.from('customers').select('id').eq('id', id).eq('gc_company_id', companyId).maybeSingle()
  if (error) { console.error('[mcp] customer lookup:', error.message); return 'SyteNav could not check that customer just now.' }
  return data ? null : 'That customer is not one of this company\'s. Use list_customers for the ids.'
}

export const CUSTOMERS_PROJECTS_READ: ToolDef[] = [
  {
    name: 'list_customers',
    title: 'List customers',
    description:
      'The company\'s customer cards (the clients jobs are built for): id, name, contact, email, phone, billing address, ' +
      'and the jobs filed under each. Optionally filtered by part of a name or email. Check this before add_customer, ' +
      'so the same client is not filed twice.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Part of a name or email address.' } },
      additionalProperties: false,
    },
    resource: 'customers',
    project: 'none',
    async run({ db, actor, args }) {
      const { data, error } = await db.from('customers')
        .select('id, name, contact_name, email, phone, billing_address, notes, projects(id, name, status)')
        .eq('gc_company_id', actor.companyId!)
        .order('name')
      if (error) return failed('the customers', error)
      const q = fold(args.query)
      const matched = ((data ?? []) as any[]).filter(c => !q || fold(c.name).includes(q) || fold(c.email).includes(q))
      const { rows, truncated } = capped(matched)
      return {
        data: {
          customers: rows.map(c => ({
            ...customerOut(c), notes: c.notes ?? null,
            projects: ((c.projects ?? []) as any[]).map(p => ({ id: p.id, name: p.name, status: p.status })),
          })),
          truncated,
        },
      }
    },
  },
]

export const CUSTOMERS_PROJECTS_WRITE: WriteToolDef[] = [
  {
    name: 'add_customer',
    title: 'Add a customer',
    write: true,
    description:
      'File a new customer card - the client a job is built for - as the New Customer form does. Check list_customers first: ' +
      'a customer with the same name or email is refused, not added twice. Does not email the customer and does not send ' +
      'anything to QuickBooks.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The client: a person or a company.' },
        contact_name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        billing_address: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    // `edit`, the same action the app's route asks: no built-in role holds
    // create without edit, and the PM and Office Staff who add customers hold VE.
    resource: 'customers',
    action: 'edit',
    project: 'none',
    async run({ db, actor, args }) {
      const name = str(args.name)
      if (!name) return { error: 'Give the customer a name.' }
      const result = await createCustomer(db, {
        companyId: actor.companyId!,
        body: {
          name, contact_name: str(args.contact_name), email: str(args.email), phone: str(args.phone),
          billing_address: str(args.billing_address), notes: str(args.notes),
        },
      })
      const out = outcome(result, 'customer', c => ({ record: 'customer', ...customerOut(c) }))
      return 'data' in out ? { data: { ...(out.data as object), next: QBO_NOTE } } : out
    },
  },

  {
    name: 'update_customer',
    title: 'Change a customer',
    write: true,
    description:
      'Correct a customer card: name, contact, email, phone, billing address or notes. Only the fields you pass change. ' +
      'Get the id from list_customers. Does not email anybody, and QuickBooks is not updated from here.',
    inputSchema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string', description: 'From list_customers.' },
        name: { type: 'string' }, contact_name: { type: 'string' }, email: { type: 'string' },
        phone: { type: 'string' }, billing_address: { type: 'string' }, notes: { type: 'string' },
      },
      required: ['customer_id'],
      additionalProperties: false,
    },
    resource: 'customers',
    action: 'edit',
    project: 'none',
    async run({ db, actor, args }) {
      const where = await customerProblem(db, actor.companyId!, args.customer_id)
      if (where) return { error: where }
      const body = given(args, ['name', 'contact_name', 'email', 'phone', 'billing_address', 'notes'])
      if ('name' in body && !str(body.name)) return { error: 'A customer cannot have a blank name.' }
      if (!Object.keys(body).length) return { error: 'Nothing to change - pass at least one field.' }
      const result = await updateCustomer(db, { companyId: actor.companyId!, customerId: args.customer_id as string, body })
      const out = outcome(result, 'customer', c => ({ record: 'customer', ...customerOut(c), changed: Object.keys(body) }))
      return 'data' in out ? { data: { ...(out.data as object), next: QBO_NOTE } } : out
    },
  },

  {
    name: 'create_project',
    title: 'Open a new job',
    write: true,
    description:
      'Open a new job (project), as the New Project form does. It starts in Planning. Needs a name, the job address and a ' +
      'start date, and a client unless it is a spec build (contract_type "spec"): pass customer_id from list_customers, or ' +
      'client_name to file a new customer (an existing one with that name is reused). Check list_projects first so the job is ' +
      'not opened twice. Counts against the plan\'s job limit, and is refused when the plan is full. The map pin is not set ' +
      'from here - somebody places it in Project Settings. Does not invite or email anybody.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        address: { type: 'string', description: 'The job site address.' },
        start_date: { ...DATE },
        end_date: { ...DATE },
        type: { type: 'string', enum: [...PROJECT_TYPES], description: 'Defaults to commercial, as the form does.' },
        customer_id: { type: 'string', description: 'An existing customer, from list_customers.' },
        client_name: { type: 'string', description: 'A new client\'s name, when there is no customer card yet.' },
        contract_type: { type: 'string', enum: [...CONTRACT_TYPES] },
      },
      required: ['name', 'address', 'start_date'],
      additionalProperties: false,
    },
    resource: 'projects',
    action: 'create',
    project: 'none',
    async run({ db, actor, args }) {
      for (const k of ['start_date', 'end_date']) if (args[k] != null && !isDate(args[k])) return { error: `${k} must be YYYY-MM-DD.` }
      const contractType = args.contract_type != null ? asContractType(args.contract_type) : null
      if (args.contract_type != null && !contractType) return { error: `contract_type must be one of ${CONTRACT_TYPES.join(', ')}.` }
      const type = args.type == null ? 'commercial' : String(args.type)
      if (!(PROJECT_TYPES as readonly string[]).includes(type)) return { error: `type must be one of ${PROJECT_TYPES.join(', ')}.` }

      let customerId: string | null = null
      let client = str(args.client_name)
      if (str(args.customer_id)) {
        const where = await customerProblem(db, actor.companyId!, args.customer_id)
        if (where) return { error: where }
        customerId = str(args.customer_id)
        const { data: c, error } = await db.from('customers').select('name').eq('id', customerId!).maybeSingle()
        if (error) return failed('that customer', error)
        client = (c as any)?.name ?? client
      }

      // The form's own rules, asked of the same fields.
      const errs = projectFormErrors({
        name: str(args.name) ?? '', address: str(args.address) ?? '', client: client ?? '',
        startDate: (args.start_date as string) ?? '', endDate: (args.end_date as string) ?? '', contractType,
      })
      if (Object.keys(errs).length) return { error: Object.values(errs).join(' ') }

      // What the form pre-fills from the company's account defaults. A failed
      // read leaves the column defaults, exactly as the form does.
      const { data: co } = await db.from('companies')
        .select('default_billing_mode, default_retainage_pct, default_contract_type').eq('id', actor.companyId!).maybeSingle()
      const billingMode = (co as any)?.default_billing_mode === 'aia' ? 'aia' : 'simple'
      const ct = contractType ?? asContractType((co as any)?.default_contract_type)

      const result = await createProject(db, {
        companyId: actor.companyId!,
        body: {
          name: str(args.name), address: str(args.address), client, type,
          start_date: args.start_date, end_date: args.end_date ?? null, customer_id: customerId,
          billing_mode: billingMode,
          ...(ct ? { contract_type: ct } : {}),
          ...(billingMode === 'aia' && (co as any)?.default_retainage_pct != null
            ? { default_retainage_pct: Number((co as any).default_retainage_pct) || 0 } : {}),
        },
      })
      return outcome(result, 'project', p => ({
        record: 'project', id: p.id, name: p.name, status: p.status, client: p.client, start_date: p.start_date,
      }))
    },
  },

  {
    name: 'update_project',
    title: 'Change a job',
    write: true,
    description:
      'Change a job\'s name, address, type, dates, unit/floor, client or status (planning, active, on_hold, completed, ' +
      'cancelled). Only the fields you pass change. Moving a job back to planning, active or on hold counts against the ' +
      'plan\'s job limit and is refused when the plan is full. Going from planning to active is refused if the app\'s ' +
      'go-live check has concerns - tell the person, who confirms it in the app. Money settings (fee, sale price, billing ' +
      'mode, retainage, contract type) are not changed here. Changing the address leaves the map pin to be re-placed in the app. ' +
      'Use get_project first.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        name: { type: 'string' },
        address: { type: 'string' },
        type: { type: 'string', enum: [...PROJECT_TYPES] },
        status: { type: 'string', enum: [...PROJECT_STATUSES] },
        start_date: { ...DATE },
        end_date: { ...DATE },
        unit: { type: 'string' },
        floor: { type: 'string' },
        customer_id: { type: 'string', description: 'Put the job under this customer, from list_customers.' },
        client_name: { type: 'string', description: 'Put the job under a NEW customer with this name.' },
      },
      required: ['project_id'],
      additionalProperties: false,
    },
    resource: 'projects',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      for (const k of ['start_date', 'end_date']) if (args[k] != null && !isDate(args[k])) return { error: `${k} must be YYYY-MM-DD.` }
      if (args.status != null && !(PROJECT_STATUSES as readonly string[]).includes(args.status as string)) {
        return { error: `status must be one of ${PROJECT_STATUSES.join(', ')}.` }
      }
      if (args.type != null && !(PROJECT_TYPES as readonly string[]).includes(args.type as string)) {
        return { error: `type must be one of ${PROJECT_TYPES.join(', ')}.` }
      }
      if ('name' in args && !str(args.name)) return { error: 'A job cannot have a blank name.' }
      if (str(args.customer_id) && str(args.client_name)) return { error: 'Pass customer_id or client_name, not both.' }

      const body: Record<string, unknown> = given(args, ['name', 'address', 'type', 'status', 'start_date', 'end_date', 'unit', 'floor'])
      if (str(args.customer_id)) {
        const where = await customerProblem(db, actor.companyId!, args.customer_id)
        if (where) return { error: where }
        body.customer_id = str(args.customer_id)
      } else if (str(args.client_name)) {
        body.new_customer_name = str(args.client_name)
      }
      if (!Object.keys(body).length) return { error: 'Nothing to change - pass at least one field.' }

      // The row the route's ownership check reads - the dispatcher has already
      // established the job is this company's.
      const { data: row, error } = await db.from('projects').select('id, is_site, customer_id, start_date, end_date').eq('id', projectId!).maybeSingle()
      if (error) return failed('that project', error)
      if (!row) return { error: 'That project no longer exists.' }
      const start = (body.start_date as string | undefined) ?? (row as any).start_date
      const end = (body.end_date as string | undefined) ?? (row as any).end_date
      if (start && end && end < start) return { error: 'The end date would be before the start date.' }

      const result = await updateProject(db, {
        companyId: actor.companyId, projectId: projectId!,
        owned: { project: { is_site: (row as any).is_site ?? null, customer_id: (row as any).customer_id ?? null } },
        body,
      })
      if (result.status >= 400) return { error: String(result.body?.error ?? 'SyteNav refused that.') }
      const p = result.body?.project
      if (!p) return { error: 'SyteNav did not confirm the change. Check the app before trying again.' }
      return {
        data: {
          updated: true, record: 'project', id: p.id, name: p.name, status: p.status, client: p.client,
          start_date: p.start_date, end_date: p.end_date, changed: Object.keys(body),
          ...(result.body.houses ? { houses: result.body.houses } : {}),
        },
      }
    },
  },

  {
    name: 'add_team_member',
    title: 'Add somebody to a job\'s team',
    write: true,
    description:
      'Put a person on a job\'s team roster - name, role on the job, phone, email - as the Add Member dialog does. ' +
      'This is a line on the roster so the crew can find their number: it does NOT invite them, email them, make a login ' +
      'or award any work. Check list_team first so nobody is added twice.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        name: { type: 'string' },
        role: { type: 'string', enum: [...JOB_ROLES] },
        phone: { type: 'string' },
        email: { type: 'string' },
      },
      required: ['project_id', 'name', 'role'],
      additionalProperties: false,
    },
    resource: 'team',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      const name = str(args.name)
      if (!(JOB_ROLES as readonly string[]).includes(args.role as string)) return { error: `role must be one of: ${JOB_ROLES.join(', ')}.` }
      const email = str(args.email)
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'That email address does not look complete - fix it or leave it out.' }
      const phone = str(args.phone)
      if (phone && !/\d/.test(phone)) return { error: 'That phone number has no digits in it.' }
      if (name || email) {
        const { data: team, error } = await db.from('project_team_members').select('id, name, email').eq('project_id', projectId!)
        if (error) return failed('the team', error)
        const dupe = ((team ?? []) as any[]).find(m => (name && fold(m.name) === fold(name)) || (email && fold(m.email) === fold(email)))
        if (dupe) return { error: `Already on this job's team as "${dupe.name}". Nothing was added.` }
      }
      const result = await addTeamMember(db, {
        userId: actor.userId, projectId: projectId!, via: VIA,
        body: { name, role: args.role, phone, email },
      })
      return outcome(result, 'member', m => ({ record: 'team_member', id: m.id, name: m.name, role: m.role }))
    },
  },

  {
    name: 'update_team_member',
    title: 'Change somebody on a job\'s team',
    write: true,
    description:
      'Correct a person on a job\'s team roster: name, role, phone or email. Only the fields you pass change. Get the id ' +
      'from list_team. Does not email them.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        member_id: { type: 'string', description: 'From list_team.' },
        name: { type: 'string' },
        role: { type: 'string', enum: [...JOB_ROLES] },
        phone: { type: 'string' },
        email: { type: 'string' },
      },
      required: ['project_id', 'member_id'],
      additionalProperties: false,
    },
    resource: 'team',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      const where = await onJob(db, 'project_team_members', args.member_id, projectId!)
      if (where) return { error: where }
      if (args.role != null && !(JOB_ROLES as readonly string[]).includes(args.role as string)) return { error: `role must be one of: ${JOB_ROLES.join(', ')}.` }
      if ('name' in args && !str(args.name)) return { error: 'A team member cannot have a blank name.' }
      const email = str(args.email)
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'That email address does not look complete.' }
      if (str(args.phone) && !/\d/.test(str(args.phone)!)) return { error: 'That phone number has no digits in it.' }
      const body = given(args, ['name', 'role', 'phone', 'email'])
      if (!Object.keys(body).length) return { error: 'Nothing to change - pass at least one field.' }
      const result = await updateTeamMember(db, { userId: actor.userId, projectId: projectId!, memberId: args.member_id as string, body, via: VIA })
      return outcome(result, 'member', m => ({ record: 'team_member', id: m.id, name: m.name, role: m.role, changed: Object.keys(body) }))
    },
  },

  {
    name: 'update_directory_contact',
    title: 'Change a Directory contact',
    write: true,
    description:
      'Correct a subcontractor, supplier or inspector in the company Directory: name, type, trade, email, phone, address ' +
      'or licence number. Only the fields you pass change, and the change shows on every job they are on. Only contacts ' +
      'this company added can be changed - a firm with its own SyteNav account keeps its own details. Find the id with ' +
      'search_directory. Does not email them.',
    inputSchema: {
      type: 'object',
      properties: {
        contact_id: { type: 'string', description: 'From search_directory.' },
        name: { type: 'string' },
        type: { type: 'string', enum: [...CONTACT_TYPES] },
        trade: { type: 'string' },
        contact_email: { type: 'string' },
        phone: { type: 'string' },
        address: { type: 'string' },
        license_number: { type: 'string' },
      },
      required: ['contact_id'],
      additionalProperties: false,
    },
    resource: 'directory',
    action: 'edit',
    project: 'none',
    async run({ db, actor, args }) {
      const id = str(args.contact_id)
      if (!id) return { error: 'Say which contact: the id is missing. Use search_directory.' }
      if (args.type != null && !(CONTACT_TYPES as readonly string[]).includes(args.type as string)) return { error: `type must be one of ${CONTACT_TYPES.join(', ')}.` }
      if ('name' in args && !str(args.name)) return { error: 'A contact cannot have a blank name.' }
      if ('contact_email' in args && !str(args.contact_email)) return { error: 'A contact needs an email address; it cannot be cleared.' }
      if (str(args.phone) && !/\d/.test(str(args.phone)!)) return { error: 'That phone number has no digits in it.' }
      const body = given(args, ['name', 'type', 'trade', 'contact_email', 'phone', 'address', 'license_number'])
      if (!Object.keys(body).length) return { error: 'Nothing to change - pass at least one field.' }
      // Whose contact it is, asked inside: one this company added, or refused.
      const result = await updateDirectoryContact(db, { myCompanyId: actor.companyId, companyId: id, body })
      return outcome(result, 'company', c => ({ record: 'directory_contact', id: c.id, name: c.name, type: c.type, changed: Object.keys(body) }))
    },
  },
]
