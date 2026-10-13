import { toAmount } from '@/lib/schedule-dependencies'
import { materialByFor, type PackageType } from '@/lib/trade-scopes'
import { createPayApp, updatePayApp } from '@/lib/writes/pay-app'
import { createBidRequest, updateBidRequest } from '@/lib/writes/bid-request'
import { addTaskNote } from '@/lib/writes/task-note'
import { updateDailyLog } from '@/lib/writes/daily-log'
import { updateSubBill } from '@/lib/writes/sub-bill'
import {
  ROW_LIMIT, PROJECT_ID, DATE, VIA, failed, capped, str, isDate, given, onJob, money,
  type ToolDef, type WriteToolDef,
} from '../tool-kit'

// ─────────────────────────────────────────────────────────────────────────────
// Claude's tools for pay applications, quote requests, task notes, daily-log
// edits and edits to a bill still waiting for approval. The dispatcher in
// ../tools.ts gates every one before it runs (consent to add, the permission
// and action named here, the billing lock, the job, the duplicate guard).
//
// THE SAME RULES AS EVERY OTHER WRITE TOOL, and the reasons they bite here:
//   - NOTHING IN THIS FILE WRITES. Every record goes through `lib/writes/*`,
//     the functions the routes call, so the checks a person meets are the ones
//     Claude meets.
//   - NOTHING LEAVES THE COMPANY. A pay application is born `draft` and its
//     status is not Claude's to move - submitted, certified and funded are what
//     an owner, an architect or a bank is told. A quote request invites nobody:
//     inviting a sub sends them an email, so that stays a button.
//   - A BILL IS CHANGED ONLY WHILE IT WAITS FOR APPROVAL, and never approved:
//     approval is the QuickBooks push, and a person stays in front of it.
//   - A DAILY LOG CLAUDE EDITS GOES BACK TO REVIEW, so a person reads the new
//     words before they can reach the client's PDF (`updateDailyLog`).
//   - EDITS PASS AN ALLOW-LIST (`given`), name a record that must be on the
//     job (`onJob`), and refuse an empty change.
// ─────────────────────────────────────────────────────────────────────────────

const PACKAGE_TYPES: PackageType[] = ['turnkey', 'labor_only', 'material_only', 'measure_quote']
const MATERIAL_BY = ['sub', 'gc', 'na']
const NOTHING = { error: 'Nothing to change - pass at least one field.' }

/** A short list of plain strings, or null when it is not one. */
function lines(v: unknown, cap = 30): string[] | null {
  if (v == null) return []
  if (!Array.isArray(v)) return null
  return v.map(str).filter(Boolean).slice(0, cap) as string[]
}

const payAppTotals = (app: any, lines: any[]) => {
  const n = (x: unknown) => toAmount(x) ?? 0
  const completed = lines.reduce((s, l) => s + n(l.previous_completed) + n(l.this_period) + n(l.materials_stored), 0)
  const thisPeriod = lines.reduce((s, l) => s + n(l.this_period) + n(l.materials_stored), 0)
  const scheduled = lines.reduce((s, l) => s + n(l.scheduled_value), 0)
  const retainage = completed * (n(app.retainage_pct) / 100)
  const r = (x: number) => Math.round(x * 100) / 100
  return { scheduled_value: r(scheduled), completed_to_date: r(completed), this_period: r(thisPeriod), retainage: r(retainage) }
}

const billTo = (a: any) => a.subcontract_id ? (a.subcontracts?.companies?.name ?? a.subcontracts?.trade ?? 'Subcontract') : 'Owner / Bank'

export const BIDS_PAYAPPS_READ: ToolDef[] = [
  {
    name: 'list_pay_apps',
    title: 'List pay applications',
    description:
      'Pay applications (AIA G702/G703 style) on one job, newest first: number, period, status (draft, submitted, ' +
      'certified, funded), who it bills (the owner/bank, or a sub billing the GC), retainage and the totals. ' +
      'Use get_pay_app for the lines.',
    inputSchema: { type: 'object', properties: { project_id: PROJECT_ID }, required: ['project_id'], additionalProperties: false },
    resource: 'pay-apps',
    project: 'required',
    async run({ db, projectIds }) {
      const { data, error } = await db.from('pay_applications')
        .select('id, subcontract_id, application_number, period_start, period_end, status, retainage_pct, submitted_at, certified_at, funded_at, pay_application_lines(scheduled_value, previous_completed, this_period, materials_stored), subcontracts(trade, companies(name))')
        .eq('project_id', projectIds[0])
        .order('created_at', { ascending: false })
        .limit(ROW_LIMIT + 1)
      if (error) return failed('pay applications', error)
      const { rows, truncated } = capped(data ?? [])
      return {
        data: {
          pay_apps: rows.map((a: any) => ({
            id: a.id, number: a.application_number, status: a.status, bill_to: billTo(a),
            direction: a.subcontract_id ? 'sub_to_gc' : 'gc_to_owner', subcontract_id: a.subcontract_id,
            period_start: a.period_start, period_end: a.period_end, retainage_pct: toAmount(a.retainage_pct),
            ...payAppTotals(a, a.pay_application_lines ?? []),
            submitted_at: a.submitted_at, certified_at: a.certified_at, funded_at: a.funded_at,
          })),
          truncated,
        },
      }
    },
  },

  {
    name: 'get_pay_app',
    title: 'Get a pay application',
    description: 'One pay application with its schedule-of-values lines: each line\'s id, description, scheduled value, previous applications, this period and materials stored.',
    inputSchema: {
      type: 'object',
      properties: { project_id: PROJECT_ID, pay_app_id: { type: 'string', description: 'From list_pay_apps.' } },
      required: ['project_id', 'pay_app_id'],
      additionalProperties: false,
    },
    resource: 'pay-apps',
    project: 'required',
    async run({ db, args, projectIds }) {
      const id = str(args.pay_app_id)
      if (!id) return { error: 'pay_app_id is required. Use list_pay_apps for the ids.' }
      const { data: app, error } = await db.from('pay_applications')
        .select('id, subcontract_id, application_number, period_start, period_end, status, retainage_pct, notes, certified_by, subcontracts(trade, companies(name))')
        .eq('id', id).eq('project_id', projectIds[0]).maybeSingle()
      if (error) return failed('that pay application', error)
      if (!app) return { error: 'That pay application is not on this job. Use list_pay_apps for the ids.' }
      const { data: lines, error: lineError } = await db.from('pay_application_lines')
        .select('id, cost_code, description, scheduled_value, previous_completed, this_period, materials_stored')
        .eq('pay_application_id', id).order('sort_order')
      if (lineError) return failed('the pay application\'s lines', lineError)
      const a = app as any
      return {
        data: {
          id: a.id, number: a.application_number, status: a.status, bill_to: billTo(a),
          period_start: a.period_start, period_end: a.period_end, retainage_pct: toAmount(a.retainage_pct),
          notes: a.notes, certified_by: a.certified_by,
          ...payAppTotals(a, lines ?? []),
          lines: (lines ?? []).map((l: any) => ({
            id: l.id, cost_code: l.cost_code, description: l.description,
            scheduled_value: toAmount(l.scheduled_value), previous_completed: toAmount(l.previous_completed),
            this_period: toAmount(l.this_period), materials_stored: toAmount(l.materials_stored),
          })),
        },
      }
    },
  },

  {
    name: 'list_bid_requests',
    title: 'List quote requests',
    description:
      'Requests for quotes (Request Quotes tab) on one job or every job: title, trade, due date, scope, who was invited ' +
      'and whether they have been told yet, and the prices that came back.',
    inputSchema: { type: 'object', properties: { project_id: PROJECT_ID }, additionalProperties: false },
    resource: 'request-quotes',
    project: 'optional',
    async run({ db, projectIds, projectNames }) {
      if (!projectIds.length) return { data: { requests: [], truncated: false } }
      // Never the invite TOKEN: it is the sub's private link to price the job.
      const { data, error } = await db.from('bid_requests')
        .select('id, project_id, title, trade, description, due_date, status, package_type, material_by, included, excluded, ask_for, created_at, bid_invites(id, vendor_name, vendor_email, status), bid_submissions(id, bid_invite_id, amount, created_at)')
        .in('project_id', projectIds)
        .order('created_at', { ascending: false })
        .limit(ROW_LIMIT + 1)
      if (error) return failed('quote requests', error)
      const { rows, truncated } = capped(data ?? [])
      return {
        data: {
          requests: rows.map((r: any) => ({
            id: r.id, project_id: r.project_id, project: projectNames.get(r.project_id) ?? null,
            title: r.title, trade: r.trade, description: r.description, due_date: r.due_date, status: r.status,
            package_type: r.package_type, material_by: r.material_by,
            included: r.included ?? [], excluded: r.excluded ?? [], ask_for: r.ask_for ?? [],
            invited: (r.bid_invites ?? []).map((i: any) => ({
              name: i.vendor_name, email: i.vendor_email, status: i.status, told: i.status !== 'pending',
            })),
            quotes: (r.bid_submissions ?? []).map((s: any) => ({
              from: (r.bid_invites ?? []).find((i: any) => i.id === s.bid_invite_id)?.vendor_name ?? null,
              amount: toAmount(s.amount), received_at: s.created_at,
            })),
          })),
          truncated,
        },
      }
    },
  },

  {
    name: 'list_task_notes',
    title: 'List a task\'s notes',
    description: 'The notes on one task, oldest first, with who wrote each.',
    inputSchema: {
      type: 'object',
      properties: { project_id: PROJECT_ID, task_id: { type: 'string', description: 'From list_tasks.' } },
      required: ['project_id', 'task_id'],
      additionalProperties: false,
    },
    resource: 'tasks',
    project: 'required',
    async run({ db, args, projectIds }) {
      const where = await onJob(db, 'project_tasks', args.task_id, projectIds[0])
      if (where) return { error: where }
      const { data, error } = await db.from('task_notes')
        .select('id, content, author_name, created_at')
        .eq('task_id', args.task_id as string)
        .order('created_at', { ascending: true })
        .limit(ROW_LIMIT + 1)
      if (error) return failed('the task\'s notes', error)
      const { rows, truncated } = capped(data ?? [])
      return { data: { notes: rows.map((n: any) => ({ id: n.id, by: n.author_name, at: n.created_at, content: n.content })), truncated } }
    },
  },

  {
    name: 'list_daily_logs',
    title: 'List daily logs',
    description:
      'Daily logs on one job or every job, newest first: date, notes, weather, safety and quality notes, issues, who ' +
      'filed it and whether it has been reviewed (only a reviewed log reaches the client\'s PDF).',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        since: { ...DATE, description: 'Only logs on or after this date (YYYY-MM-DD).' },
        until: { ...DATE, description: 'Only logs on or before this date (YYYY-MM-DD).' },
      },
      additionalProperties: false,
    },
    resource: 'daily-logs',
    project: 'optional',
    async run({ db, args, projectIds, projectNames }) {
      if (!projectIds.length) return { data: { logs: [], truncated: false } }
      let q = db.from('daily_logs')
        .select('id, project_id, log_date, notes, weather, temp_f, workers_onsite, safety_observation, quality_observation, has_issues, issue_description, created_by_name, review_status')
        .in('project_id', projectIds)
        .order('log_date', { ascending: false })
      if (isDate(args.since)) q = q.gte('log_date', args.since)
      if (isDate(args.until)) q = q.lte('log_date', args.until)
      const { data, error } = await q.limit(ROW_LIMIT + 1)
      if (error) return failed('daily logs', error)
      const { rows, truncated } = capped(data ?? [])
      return {
        data: {
          logs: rows.map((l: any) => ({
            id: l.id, project_id: l.project_id, project: projectNames.get(l.project_id) ?? null,
            log_date: l.log_date, notes: l.notes, weather: l.weather, temp_f: l.temp_f, workers_onsite: l.workers_onsite,
            safety_observation: l.safety_observation, quality_observation: l.quality_observation,
            has_issues: l.has_issues, issue_description: l.issue_description,
            filed_by: l.created_by_name, review_status: l.review_status,
          })),
          truncated,
        },
      }
    },
  },
]

export const BIDS_PAYAPPS_WRITE: WriteToolDef[] = [
  {
    name: 'create_pay_app',
    title: 'Start a pay application',
    write: true,
    description:
      'Start the next pay application on a job, as the Pay Apps tab does: to the owner/bank (leave subcontract_id out) or a ' +
      'sub\'s application to you (subcontract_id from list_subcontracts). Its lines are seeded from the schedule of values ' +
      'and earlier applications. It is a DRAFT - nobody outside the company sees it, and submitting or certifying it is a ' +
      'person\'s step in SyteNav. Check list_pay_apps first so a second draft for the same period is not started.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        subcontract_id: { type: 'string', description: 'Only for a sub billing you. From list_subcontracts.' },
        period_start: { ...DATE }, period_end: { ...DATE },
        retainage_pct: { type: 'number', minimum: 0, maximum: 100, description: 'Defaults to the job\'s retainage.' },
      },
      required: ['project_id'],
      additionalProperties: false,
    },
    resource: 'pay-apps',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      for (const k of ['period_start', 'period_end']) if (args[k] != null && !isDate(args[k])) return { error: `${k} must be YYYY-MM-DD.` }
      if (isDate(args.period_start) && isDate(args.period_end) && args.period_end < args.period_start) return { error: 'period_end is before period_start.' }
      const scId = str(args.subcontract_id)
      if (scId) { const where = await onJob(db, 'subcontracts', scId, projectId!); if (where) return { error: where } }
      const result = await createPayApp(db, {
        userId: actor.userId, projectId: projectId!, via: VIA,
        // No status: the app fixes `draft` itself.
        body: {
          subcontract_id: scId, period_start: args.period_start ?? null, period_end: args.period_end ?? null,
          ...(args.retainage_pct != null ? { retainage_pct: args.retainage_pct } : {}),
        },
      })
      if (result.status >= 400) return { error: String(result.body?.error ?? 'SyteNav refused that.') }
      const a = result.body?.application
      if (!a) return { error: 'SyteNav did not confirm the pay application was started. Check the app before trying again.' }
      return {
        data: {
          created: true, record: 'pay_app', id: a.id, number: a.application_number, status: a.status,
          retainage_pct: toAmount(a.retainage_pct),
          next: 'It is a draft on the Pay Apps tab. Fill in this period with update_pay_app; a person submits it.',
        },
      }
    },
  },

  {
    name: 'update_pay_app',
    title: 'Change a draft pay application',
    write: true,
    description:
      'Change a DRAFT pay application: its period, retainage, notes, and each line\'s work this period and materials stored ' +
      '(line ids from get_pay_app). Only the fields you pass change. A line cannot be billed past its scheduled value - ' +
      'SyteNav refuses it and says which. It cannot submit, certify or fund the application, and an application that has ' +
      'already gone out cannot be changed here.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        pay_app_id: { type: 'string', description: 'From list_pay_apps.' },
        period_start: { ...DATE }, period_end: { ...DATE },
        retainage_pct: { type: 'number', minimum: 0, maximum: 100 },
        notes: { type: 'string' },
        lines: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              line_id: { type: 'string', description: 'From get_pay_app.' },
              this_period: { type: 'number', description: 'Dollars of work done this period.' },
              materials_stored: { type: 'number', description: 'Dollars of materials stored, not yet installed.' },
            },
            required: ['line_id'],
          },
        },
      },
      required: ['project_id', 'pay_app_id'],
      additionalProperties: false,
    },
    resource: 'pay-apps',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      const id = str(args.pay_app_id)
      const { data: app, error } = id
        ? await db.from('pay_applications').select('id, status').eq('id', id).eq('project_id', projectId!).maybeSingle()
        : { data: null, error: null }
      if (error) { console.error('[mcp] pay application lookup:', error.message); return { error: 'SyteNav could not check that pay application just now.' } }
      if (!app) return { error: 'That pay application is not on this job. Use list_pay_apps for the ids.' }
      if ((app as any).status !== 'draft') return { error: `That pay application is ${(app as any).status}, not a draft - it has gone out, so change it in SyteNav.` }

      for (const k of ['period_start', 'period_end']) if (args[k] != null && !isDate(args[k])) return { error: `${k} must be YYYY-MM-DD.` }
      const body: Record<string, unknown> = given(args, ['period_start', 'period_end', 'retainage_pct', 'notes'])

      if (args.lines != null) {
        if (!Array.isArray(args.lines)) return { error: 'lines must be a list.' }
        const asked = args.lines as any[]
        const { data: stored, error: lineError } = await db.from('pay_application_lines').select('id').eq('pay_application_id', id!)
        if (lineError) { console.error('[mcp] pay application lines:', lineError.message); return { error: 'SyteNav could not read that pay application\'s lines just now.' } }
        const known = new Set(((stored ?? []) as any[]).map(l => l.id))
        const out: Record<string, unknown>[] = []
        for (const l of asked) {
          if (!l || typeof l.line_id !== 'string' || !known.has(l.line_id)) {
            return { error: 'A line is not on this pay application. Use get_pay_app for the line ids.' }
          }
          const line: Record<string, unknown> = { id: l.line_id }
          for (const k of ['this_period', 'materials_stored']) {
            if (l[k] === undefined) continue
            if (typeof l[k] !== 'number' || !Number.isFinite(l[k])) return { error: `${k} must be a number of dollars.` }
            line[k] = Math.round(l[k] * 100) / 100
          }
          if (Object.keys(line).length > 1) out.push(line)
        }
        if (out.length) body.lines = out
      }
      if (!Object.keys(body).length) return NOTHING

      const result = await updatePayApp(db, { userId: actor.userId, projectId: projectId!, appId: id!, body, via: VIA })
      if (result.status >= 400) return { error: String(result.body?.error ?? 'SyteNav refused that.') }
      return { data: { updated: true, record: 'pay_app', id, status: 'draft', changed: Object.keys(body) } }
    },
  },

  {
    name: 'create_bid_request',
    title: 'Draft a request for quotes',
    write: true,
    description:
      'Write up a request for quotes on a job, as the Request Quotes tab does: what is being priced, the trade, when prices ' +
      'are due, and the scope every bidder answers (what is included, excluded, and what to send back besides a price). ' +
      'It INVITES NOBODY - inviting subs emails them, so a person does that on the Request Quotes tab. Plans cannot be ' +
      'attached here. Scope lists you leave out are left empty, not filled from the trade\'s defaults. Check ' +
      'list_bid_requests first so the same request is not made twice.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        title: { type: 'string', description: 'e.g. "Framing - main house".' },
        trade: { type: 'string' },
        description: { type: 'string' },
        due_date: { ...DATE, description: 'When prices are due, YYYY-MM-DD.' },
        package_type: { type: 'string', enum: PACKAGE_TYPES, description: 'turnkey = labor + material; labor_only; material_only; measure_quote = they measure first.' },
        material_by: { type: 'string', enum: MATERIAL_BY, description: 'Only for measure_quote - the other packages already say who supplies material.' },
        included: { type: 'array', items: { type: 'string' } },
        excluded: { type: 'array', items: { type: 'string' } },
        ask_for: { type: 'array', items: { type: 'string' }, description: 'What to send back besides a price.' },
      },
      required: ['project_id', 'title'],
      additionalProperties: false,
    },
    resource: 'request-quotes',
    action: 'create',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      const title = str(args.title)
      if (!title) return { error: 'title is required.' }
      if (args.due_date != null && !isDate(args.due_date)) return { error: 'due_date must be YYYY-MM-DD.' }
      const pkg = (args.package_type ?? 'turnkey') as PackageType
      if (!PACKAGE_TYPES.includes(pkg)) return { error: `package_type must be one of ${PACKAGE_TYPES.join(', ')}.` }
      // The package answers who supplies material, except for measure_quote -
      // two controls must not answer one question (`materialByFor`).
      const derived = materialByFor(pkg)
      const material = derived ?? (MATERIAL_BY.includes(args.material_by as string) ? args.material_by as string : 'sub')
      const scope: Record<string, string[]> = {}
      for (const k of ['included', 'excluded', 'ask_for']) {
        const l = lines(args[k])
        if (!l) return { error: `${k} must be a list of short sentences.` }
        scope[k] = l
      }
      const result = await createBidRequest(db, {
        userId: actor.userId, projectId: projectId!, via: VIA,
        fields: {
          title, trade: str(args.trade), description: str(args.description), due_date: (args.due_date as string) ?? null,
          package_type: pkg, material_by: material, ...scope,
        },
      })
      if (result.status >= 400) return { error: String(result.body?.error ?? 'SyteNav refused that.') }
      const r = result.body?.request
      if (!r) return { error: 'SyteNav did not confirm the request was made. Check the app before trying again.' }
      return {
        data: {
          created: true, record: 'bid_request', id: r.id, title: r.title, trade: r.trade, due_date: r.due_date,
          next: 'Nobody has been invited. Invite subs on the Request Quotes tab - that sends them an email.',
        },
      }
    },
  },

  {
    name: 'update_bid_request',
    title: 'Change a request for quotes',
    write: true,
    description:
      'Change a quote request\'s title, trade, description or due date - only while nobody has been sent it yet. Once a ' +
      'sub has been emailed, what they were asked to price is theirs too, so changes are made in SyteNav. It cannot close ' +
      'the request, invite anyone or message the subs.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        request_id: { type: 'string', description: 'From list_bid_requests.' },
        title: { type: 'string' }, trade: { type: 'string' }, description: { type: 'string' },
        due_date: { ...DATE },
      },
      required: ['project_id', 'request_id'],
      additionalProperties: false,
    },
    resource: 'request-quotes',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      const where = await onJob(db, 'bid_requests', args.request_id, projectId!)
      if (where) return { error: where }
      const { data: invites, error } = await db.from('bid_invites').select('status').eq('bid_request_id', args.request_id as string)
      if (error) { console.error('[mcp] bid invites read:', error.message); return { error: 'SyteNav could not check who has been sent this request just now.' } }
      const told = ((invites ?? []) as any[]).filter(i => i.status !== 'pending').length
      if (told) return { error: `${told} sub${told === 1 ? ' has' : 's have'} already been sent this request, so change it in SyteNav.` }

      const body = given(args, ['title', 'trade', 'description', 'due_date'])
      if ('title' in body && !str(body.title)) return { error: 'title cannot be blank.' }
      if ('due_date' in body && body.due_date !== null && !isDate(body.due_date)) return { error: 'due_date must be YYYY-MM-DD.' }
      if (!Object.keys(body).length) return NOTHING
      const result = await updateBidRequest(db, { userId: actor.userId, projectId: projectId!, reqId: args.request_id as string, body, via: VIA })
      if (result.status >= 400) return { error: String(result.body?.error ?? 'SyteNav refused that.') }
      return { data: { updated: true, record: 'bid_request', id: args.request_id, changed: Object.keys(body) } }
    },
  },

  {
    name: 'add_task_note',
    title: 'Add a note to a task',
    write: true,
    description: 'Add a note to a task, as the task drawer does - credited "Name via Claude" and shown in the job history. Check list_task_notes first so the same note is not added twice.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        task_id: { type: 'string', description: 'From list_tasks.' },
        content: { type: 'string' },
      },
      required: ['project_id', 'task_id', 'content'],
      additionalProperties: false,
    },
    resource: 'tasks',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      const where = await onJob(db, 'project_tasks', args.task_id, projectId!)
      if (where) return { error: where }
      const content = str(args.content)
      if (!content) return { error: 'content is required.' }
      const result = await addTaskNote(db, { userId: actor.userId, projectId: projectId!, taskId: args.task_id as string, content, via: VIA })
      if (result.status >= 400) return { error: String(result.body?.error ?? 'SyteNav refused that.') }
      const n = result.body?.note
      if (!n) return { error: 'SyteNav did not confirm the note was added. Check the app before trying again.' }
      return { data: { created: true, record: 'task_note', id: n.id, task_id: n.task_id, by: n.author_name } }
    },
  },

  {
    name: 'update_daily_log',
    title: 'Change a daily log',
    write: true,
    description:
      'Correct a daily log: its date, notes, weather, temperature, safety or quality observation (log ids from ' +
      'list_daily_logs). Only the fields you pass change. The log goes BACK TO WAITING FOR REVIEW, so a person reads the ' +
      'change before it can reach the client\'s PDF. Who was on site, the survey and the signature cannot be changed here.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        log_id: { type: 'string', description: 'From list_daily_logs.' },
        log_date: { ...DATE },
        notes: { type: 'string' }, weather: { type: 'string' }, temp_f: { type: 'number' },
        safety_observation: { type: 'string' }, quality_observation: { type: 'string' },
      },
      required: ['project_id', 'log_id'],
      additionalProperties: false,
    },
    resource: 'daily-logs',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      const where = await onJob(db, 'daily_logs', args.log_id, projectId!)
      if (where) return { error: where }
      const body: Record<string, unknown> = given(args, ['log_date', 'notes', 'weather', 'temp_f', 'safety_observation', 'quality_observation'])
      if ('log_date' in body && !isDate(body.log_date)) return { error: 'log_date must be YYYY-MM-DD.' }
      // A log has to say something - the notes are not Claude's to blank.
      if ('notes' in body && !str(body.notes)) return { error: 'notes cannot be blank.' }
      if ('temp_f' in body) {
        if (body.temp_f !== null && (typeof body.temp_f !== 'number' || !Number.isFinite(body.temp_f))) return { error: 'temp_f must be a number.' }
        if (body.temp_f !== null) body.temp_f = Math.round(body.temp_f as number)
      }
      for (const k of ['notes', 'weather', 'safety_observation', 'quality_observation']) if (k in body) body[k] = str(body[k])
      if (!Object.keys(body).length) return NOTHING
      const result = await updateDailyLog(db, { userId: actor.userId, projectId: projectId!, logId: args.log_id as string, body, via: VIA })
      if (result.status >= 400) return { error: String(result.body?.error ?? 'SyteNav refused that.') }
      const l = result.body?.log
      return {
        data: {
          updated: true, record: 'daily_log', id: args.log_id, changed: Object.keys(body), review_status: l?.review_status ?? 'pending',
          next: 'It is waiting for review on the Daily Logs tab before the client can see it.',
        },
      }
    },
  },

  {
    name: 'update_sub_bill',
    title: 'Correct a bill waiting for approval',
    write: true,
    description:
      'Correct a bill from a sub or vendor that is still WAITING FOR APPROVAL: amount, invoice number, description, due date, ' +
      'or how it is split across budget lines (allocations REPLACE the whole split, and must not add up to more than the ' +
      'bill). Only the fields you pass change. It cannot approve, release or pay a bill - approval is what sends it to ' +
      'QuickBooks, and that is a person\'s decision. Bill ids from list_sub_bills; budget line ids from get_budget.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        bill_id: { type: 'string', description: 'From list_sub_bills.' },
        amount: { type: 'number', exclusiveMinimum: 0 },
        invoice_number: { type: 'string' },
        description: { type: 'string' },
        due_date: { ...DATE },
        allocations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              budget_line_item_id: { type: 'string', description: 'From get_budget.' },
              amount: { type: 'number', minimum: 0 },
              note: { type: 'string' },
            },
            required: ['budget_line_item_id', 'amount'],
          },
        },
      },
      required: ['project_id', 'bill_id'],
      additionalProperties: false,
    },
    resource: 'invoices',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      const id = str(args.bill_id)
      const { data: bill, error } = id
        ? await db.from('invoices').select('id, status, qbo_id').eq('id', id).eq('project_id', projectId!).maybeSingle()
        : { data: null, error: null }
      if (error) { console.error('[mcp] bill lookup:', error.message); return { error: 'SyteNav could not check that bill just now.' } }
      if (!bill) return { error: 'That bill is not on this job. Use list_sub_bills for the ids.' }
      if ((bill as any).status !== 'pending_approval') {
        return { error: `That bill is ${(bill as any).status}, not waiting for approval - change it in SyteNav.` }
      }

      const body: Record<string, unknown> = given(args, ['amount', 'invoice_number', 'description', 'due_date'])
      if ('amount' in body) {
        const m = money(body.amount)
        if (m === 'bad' || m === null || m <= 0) return { error: 'amount must be a number above zero.' }
        body.amount = m
      }
      if ('invoice_number' in body && !str(body.invoice_number)) return { error: 'invoice_number cannot be blank.' }
      if ('due_date' in body && body.due_date !== null && !isDate(body.due_date)) return { error: 'due_date must be YYYY-MM-DD.' }

      if (args.allocations !== undefined) {
        if (!Array.isArray(args.allocations)) return { error: 'allocations must be a list.' }
        const rows = (args.allocations as any[]).map(a => ({
          budget_line_item_id: str(a?.budget_line_item_id), amount: money(a?.amount), note: str(a?.note),
        }))
        if (rows.some(r => !r.budget_line_item_id || r.amount === 'bad' || r.amount === null)) {
          return { error: 'Each allocation needs a budget_line_item_id and an amount of zero or more.' }
        }
        // The route takes a line id as given; a line from another job would put
        // this bill's money on somebody else's budget.
        const ids = Array.from(new Set(rows.map(r => r.budget_line_item_id as string)))
        if (ids.length) {
          const { data: found, error: lineError } = await db.from('budget_line_items').select('id').eq('project_id', projectId!).in('id', ids)
          if (lineError) { console.error('[mcp] budget lines lookup:', lineError.message); return { error: 'SyteNav could not check those budget lines just now.' } }
          if (((found ?? []) as any[]).length !== ids.length) return { error: 'A budget line is not on this job. Use get_budget for the ids.' }
        }
        body.allocations = rows
      }
      if (!Object.keys(body).length) return NOTHING

      const result = await updateSubBill(db, { userId: actor.userId, projectId: projectId!, invoiceId: id!, body, via: VIA })
      if (result.status >= 400) return { error: String(result.body?.error ?? 'SyteNav refused that.') }
      const b = result.body?.invoice
      return {
        data: {
          updated: true, record: 'bill', id, number: b?.invoice_number ?? null, amount: toAmount(b?.amount), status: b?.status ?? 'pending_approval',
          changed: Object.keys(body),
          next: 'It is still waiting for approval. Nothing has gone to QuickBooks.',
        },
      }
    },
  },
]
