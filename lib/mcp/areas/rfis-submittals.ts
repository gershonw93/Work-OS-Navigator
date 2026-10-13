import {
  type ToolDef, type WriteToolDef, PROJECT_ID, VIA, str, capped, failed, outcome, money, given, onJob,
} from '../tool-kit'
import { createRfi, updateRfi, RFI_STATUSES } from '@/lib/writes/rfi'
import { updateSubmittal, SUBMITTAL_STATUSES } from '@/lib/writes/submittal'

// ─────────────────────────────────────────────────────────────────────────────
// Claude's tools for RFIs and submittals. Reads go in READ, adds and edits in
// WRITE; the dispatcher in ../tools.ts gates every one before it runs (consent,
// the `rfis` / `submittals` permission at the tool's action, the billing lock,
// and that project_id is one of the company's OWN jobs - so Claude is always on
// the GC side of an RFI, never a sub's).
//
// WHAT IS NOT HERE, ON PURPOSE:
//   - the RFI answer link: it exists to be sent to an architect or designer
//     outside the company, and a send stays a button a person presses;
//   - deciding the change order riding on an RFI (`change_order_status`): that
//     is the GC agreeing money with somebody, which the person does;
//   - adding a submittal: a submittal IS its document, the route refuses one
//     without a file, and Claude uploads nothing;
//   - the analyze routes, which are model scans of an uploaded file;
//   - every delete.
// ─────────────────────────────────────────────────────────────────────────────

const amount = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(v) // `change_order_amount` is numeric - PostgREST sends "1250.00"
  return Number.isFinite(n) ? n : null
}

export const RFIS_SUBMITTALS_READ: ToolDef[] = [
  {
    name: 'list_rfis',
    title: 'List RFIs',
    description:
      'RFIs (requests for information) on one job, or every job when project_id is left out: number, subject, the question, ' +
      'status (open / answered / closed), the answer and who gave it, who asked, and any change order riding on it. ' +
      'Open ones by default. Check this before create_rfi so the same question is not asked twice.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        status: { type: 'string', enum: ['open', 'answered', 'closed', 'all'], description: 'Default "open".' },
      },
      additionalProperties: false,
    },
    resource: 'rfis',
    project: 'optional',
    async run({ db, args, projectIds, projectNames }) {
      if (!projectIds.length) return { data: { rfis: [], truncated: false } }
      const status = str(args.status) ?? 'open'
      if (status !== 'all' && !RFI_STATUSES.has(status)) return { error: 'status must be open, answered, closed or all.' }
      // Named columns, never '*': the row carries `answer_token`, which IS the
      // outsider's answer link.
      let q = db.from('rfis')
        .select('id, project_id, rfi_number, subject, description, status, response, responded_by_name, responded_at, submitted_by_name, company_name, is_change_order, change_order_description, change_order_amount, change_order_status, created_at')
        .in('project_id', projectIds)
      if (status !== 'all') q = q.eq('status', status)
      const { data, error } = await q.order('created_at', { ascending: false })
      if (error) return failed('RFIs', error)
      const { rows, truncated } = capped((data ?? []) as any[])
      return {
        data: {
          rfis: rows.map(r => ({
            id: r.id, project_id: r.project_id, project: projectNames.get(r.project_id) ?? null,
            number: r.rfi_number, subject: r.subject, question: r.description, status: r.status,
            answer: r.response, answered_by: r.responded_by_name, answered_at: r.responded_at,
            asked_by: r.company_name ?? r.submitted_by_name, asked_at: r.created_at,
            change_order: r.is_change_order
              ? { description: r.change_order_description, amount: amount(r.change_order_amount), decision: r.change_order_status }
              : null,
          })),
          truncated,
        },
      }
    },
  },

  {
    name: 'list_submittals',
    title: 'List submittals',
    description:
      'Submittals (tech sheets, shop drawings, product data sent for review) on one job, or every job when project_id is left out: ' +
      'title, type, trade, spec section, manufacturer, model, status (pending / approved / rejected / revise) and the review notes. ' +
      'Pending ones by default.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'revise', 'all'], description: 'Default "pending".' },
      },
      additionalProperties: false,
    },
    resource: 'submittals',
    project: 'optional',
    async run({ db, args, projectIds, projectNames }) {
      if (!projectIds.length) return { data: { submittals: [], truncated: false } }
      const status = str(args.status) ?? 'pending'
      if (status !== 'all' && !SUBMITTAL_STATUSES.includes(status)) return { error: 'status must be pending, approved, rejected, revise or all.' }
      let q = db.from('submittals')
        .select('id, project_id, title, type, trade, spec_section, manufacturer, model_number, status, notes, review_notes, file_url, created_at')
        .in('project_id', projectIds)
      if (status !== 'all') q = q.eq('status', status)
      const { data, error } = await q.order('created_at', { ascending: false })
      if (error) return failed('submittals', error)
      const { rows, truncated } = capped((data ?? []) as any[])
      return {
        data: {
          submittals: rows.map(s => ({
            id: s.id, project_id: s.project_id, project: projectNames.get(s.project_id) ?? null,
            title: s.title, type: s.type, trade: s.trade, spec_section: s.spec_section,
            manufacturer: s.manufacturer, model_number: s.model_number, status: s.status,
            notes: s.notes, review_notes: s.review_notes,
            // Whether the document is attached - never the link itself, which is signed for ten years.
            has_document: !!s.file_url, created_at: s.created_at,
          })),
          truncated,
        },
      }
    },
  },
]

export const RFIS_SUBMITTALS_WRITE: WriteToolDef[] = [
  {
    name: 'create_rfi',
    title: 'Ask an RFI',
    write: true,
    description:
      'File a new RFI on a job as the general contractor, as the New RFI button on the RFIs tab does: a subject and the question. ' +
      'It is numbered automatically and starts open; the people at the company who answer RFIs get a notification. ' +
      'It sends nothing to an architect or anybody outside the company - the answer link is a button a person presses. ' +
      'It can carry a proposed change order, which starts pending; deciding it is not something Claude does. ' +
      'Check list_rfis first so the same question is not asked twice.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        subject: { type: 'string', description: 'A short title, e.g. "Header size over the kitchen opening".' },
        description: { type: 'string', description: 'The question in full.' },
        is_change_order: { type: 'boolean', description: 'True when the answer is expected to change the price.' },
        change_order_description: { type: 'string' },
        change_order_amount: { type: 'number', minimum: 0, description: 'Dollars.' },
      },
      required: ['project_id', 'subject'],
      additionalProperties: false,
    },
    resource: 'rfis',
    action: 'create',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      const subject = str(args.subject)
      if (!subject) return { error: 'Give the RFI a subject.' }
      const isCo = args.is_change_order === true
      const coAmount = money(args.change_order_amount)
      if (coAmount === 'bad') return { error: 'change_order_amount must be a number, zero or more.' }
      if (!isCo && (args.change_order_description != null || coAmount != null)) {
        return { error: 'Change order details need is_change_order: true.' }
      }
      const result = await createRfi(db, {
        userId: actor.userId, projectId: projectId!, via: VIA,
        // The dispatcher only lets Claude act on the company's own jobs, so
        // this is always the GC asking - filed under no sub's company.
        asker: { company_id: null, company_name: null },
        body: {
          subject, description: str(args.description),
          is_change_order: isCo,
          change_order_description: isCo ? str(args.change_order_description) : null,
          change_order_amount: isCo ? coAmount : null,
        },
      })
      return outcome(result, 'rfi', r => ({
        record: 'rfi', id: r.id, number: r.rfi_number, subject: r.subject, status: r.status,
        change_order: r.is_change_order ? 'pending' : null,
      }))
    },
  },

  {
    name: 'update_rfi',
    title: 'Edit or answer an RFI',
    write: true,
    description:
      'Correct an RFI\'s subject or question, record the answer, or move its status (open / answered / closed), as the RFIs tab does. ' +
      'Only the fields you pass change. Recording an answer or a status signs it as answered by this person via Claude. ' +
      'It does not decide the change order riding on an RFI, does not send the answer link, and sends nothing to anybody. ' +
      'Get the rfi_id from list_rfis.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        rfi_id: { type: 'string', description: 'From list_rfis.' },
        subject: { type: 'string' },
        description: { type: 'string', description: 'The question.' },
        response: { type: 'string', description: 'The answer.' },
        status: { type: 'string', enum: ['open', 'answered', 'closed'] },
      },
      required: ['project_id', 'rfi_id'],
      additionalProperties: false,
    },
    resource: 'rfis',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      const where = await onJob(db, 'rfis', args.rfi_id, projectId!)
      if (where) return { error: where }
      // NOT `change_order_status`: approving a change order is the person's call.
      const body = given(args, ['subject', 'description', 'response', 'status'])
      for (const k of Object.keys(body)) {
        if (typeof body[k] !== 'string') return { error: `${k} must be text.` }
      }
      if (!Object.keys(body).length) return { error: 'Nothing to change - pass at least one field.' }
      const result = await updateRfi(db, { userId: actor.userId, projectId: projectId!, rfiId: args.rfi_id as string, body, via: VIA })
      return outcome(result, 'rfi', r => ({
        record: 'rfi', id: r.id, number: r.rfi_number, subject: r.subject, status: r.status, changed: Object.keys(body),
      }))
    },
  },

  {
    name: 'update_submittal',
    title: 'Review a submittal',
    write: true,
    description:
      'Record the review of a submittal, as the Submittals tab does: its status (pending, approved, rejected, or revise - sent back ' +
      'for revision) and the review notes. Only the fields you pass change. It sends nothing to the sub or supplier, does not add a ' +
      'submittal (one needs its document uploaded) and changes nothing else about it. Get the submittal_id from list_submittals.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        submittal_id: { type: 'string', description: 'From list_submittals.' },
        status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'revise'] },
        review_notes: { type: 'string' },
      },
      required: ['project_id', 'submittal_id'],
      additionalProperties: false,
    },
    resource: 'submittals',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      const where = await onJob(db, 'submittals', args.submittal_id, projectId!)
      if (where) return { error: where }
      const body = given(args, ['status', 'review_notes'])
      if (!Object.keys(body).length) return { error: 'Nothing to change - pass status or review_notes.' }
      const result = await updateSubmittal(db, {
        userId: actor.userId, projectId: projectId!, submittalId: args.submittal_id as string, body, via: VIA,
      })
      return outcome(result, 'submittal', s => ({
        record: 'submittal', id: s.id, title: s.title, status: s.status, review_notes: s.review_notes, changed: Object.keys(body),
      }))
    },
  },
]
