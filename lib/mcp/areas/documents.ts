import type { SupabaseClient } from '@supabase/supabase-js'
import {
  type ToolDef, type WriteToolDef, PROJECT_ID, DATE, VIA, capped, failed, str, isDate, onJob,
} from '../tool-kit'
import {
  DOCUMENT_ARG, readDocument, storeDocument, discardDocument, attachUrl,
  compliancePath, companyFilePath, planPath, type StoredDocument,
} from '@/lib/writes/stored-document'
import { fileComplianceDocument, complianceStatusFor, COMPLIANCE_TYPES } from '@/lib/writes/compliance-document'
import { recordCompanyFile, FILE_CATEGORIES } from '@/lib/writes/company-file'
import { recordPlanSheet, PLAN_TYPES } from '@/lib/writes/plan-sheet'
import { complianceReport } from '@/lib/compliance-report'
import { DOC_LABELS, type DocType } from '@/lib/compliance-requirements'
import { expiryLabel } from '@/lib/expiry'

// ─────────────────────────────────────────────────────────────────────────────
// Claude FILING DOCUMENTS - "I send Claude a doc, it works out whether it is a
// bill, a certificate or whatever, and puts it where it goes, or asks when it
// is not sure."
//
// Claude does the classifying. What lives here is the places to file INTO and
// a catalogue of them (`document_destinations`) that says, per kind of
// document, which tool files it and what to ask the person when it is not
// clear - which job, which sub, which kind.
//
// THE FILE ITSELF IS ALWAYS OPTIONAL. A model is usually shown a document's
// contents, not handed its bytes, so every tool here works without one and
// answers with `attach_url`: the page in SyteNav where the person can drop the
// original. When the bytes DO come (`document`), they are checked and stored by
// lib/writes/stored-document.ts the way the destination's own upload stores
// them: PDF or photo, 3MB at most, a sentence naming that page when too big.
//
// Every write goes through lib/writes - the function the app's route calls -
// and nothing in this file inserts or updates a row itself.
//
// WHAT IS NOT HERE, on purpose:
//   - asking a sub for their paperwork (compliance/request emails them) and the
//     compliance SCAN (a model call) - Claude is already the reader;
//   - APPROVING a certificate. A dated document's status follows its date
//     (`complianceStatusFor`); an undated one is filed `pending` for a person;
//   - renaming, moving or deleting a file in Files, and packets;
//   - a plan sheet or a Files entry WITHOUT the file. Both are the file itself:
//     a row with nothing behind it is a placeholder nothing can ever fill (the
//     app has no "attach later" on either), so with no bytes those two file
//     nothing and say where to drop it.
// ─────────────────────────────────────────────────────────────────────────────

/** "COI", "W-9" - what the app calls a compliance type. */
const complianceLabel = (t: string) => DOC_LABELS[t as DocType] ?? t.replace(/_/g, ' ')

const STATUS_WORDS: Record<string, string> = {
  pending: 'Pending review', approved: 'Approved', expired: 'Expired', expiring_soon: 'Expiring soon', missing: 'Missing',
  optional: 'Not required by default', not_required: 'Not required',
}

const complianceTab = (projectId: string) => attachUrl(`/projects/${projectId}/compliance`)
const plansTab = (projectId: string) => attachUrl(`/projects/${projectId}/plans`)
const filesPage = () => attachUrl('/files')

/** The companies with a subcontract on this job. A failed read is said, never "none". */
async function vendorsOnJob(db: SupabaseClient, projectId: string): Promise<{ rows: any[] } | { error: { message: string } }> {
  const { data, error } = await db.from('subcontracts').select('id, company_id, companies ( id, name, type )').eq('project_id', projectId)
  if (error) return { error }
  return { rows: data ?? [] }
}

/** The structured line the Compliance tab's form writes into notes, built from the same fields. */
function complianceSummary(type: string, a: Record<string, unknown>): string {
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? `$${v.toLocaleString('en-US')}` : null)
  const parts: (string | null)[] = []
  if (type === 'coi') {
    parts.push(n(a.gl_per_occurrence) && `GL ${n(a.gl_per_occurrence)}`, n(a.gl_aggregate) && `Agg ${n(a.gl_aggregate)}`,
      n(a.auto_limit) && `Auto ${n(a.auto_limit)}`, n(a.umbrella_limit) && `Umbrella ${n(a.umbrella_limit)}`,
      str(a.insurer) && `Insurer: ${str(a.insurer)}`, str(a.policy_number) && `Policy: ${str(a.policy_number)}`,
      typeof a.additional_insured === 'boolean' ? `Add'l Insured: ${a.additional_insured ? 'Yes' : 'No'}` : null)
  } else if (type === 'license') {
    parts.push(str(a.license_type), str(a.license_number) && `#${str(a.license_number)}`, str(a.issuing_state))
  } else if (type === 'w9') {
    parts.push(str(a.entity_type), str(a.ein_last4) && `EIN …${str(a.ein_last4)}`)
  } else if (type === 'workers_comp') {
    parts.push(str(a.insurer), str(a.policy_number) && `Policy: ${str(a.policy_number)}`, n(a.wc_el_accident) && `EL/Accident ${n(a.wc_el_accident)}`)
  } else {
    parts.push(str(a.insurer), str(a.policy_number) && `Policy: ${str(a.policy_number)}`)
  }
  return parts.filter(Boolean).join(' · ')
}

// ── where each kind of document goes ────────────────────────────────────────

export interface Destination {
  kind: string
  looks_like: string
  tool: string | null
  /** Where in SyteNav the person drops the original. `{project_id}` is filled in by the caller. */
  attach_path: string
  ask_when_unsure: string[]
  note?: string
}

/**
 * Pure data - no reads. The tool names here are pinned against the dispatcher's
 * own list in lib/__tests__/mcp-area-documents.ts, so a renamed tool fails the
 * suite instead of sending Claude to a tool that does not exist.
 */
export const DESTINATIONS: Destination[] = [
  {
    kind: 'Bill from a subcontractor or supplier',
    looks_like: 'An invoice addressed TO the contractor: a vendor letterhead, an amount due, an invoice number, a due date.',
    tool: 'create_sub_bill',
    attach_path: '/projects/{project_id}/invoices',
    ask_when_unsure: ['Which job is it for?', 'Which sub or vendor sent it (list_subcontracts)?', 'Is it already entered (list_sub_bills)?'],
    note: 'Born waiting for approval; nothing reaches QuickBooks until a person approves it. Takes the PDF as `document`.',
  },
  {
    kind: 'Certificate of insurance, W-9, licence or workers\' comp',
    looks_like: 'An ACORD 25 certificate, a W-9 form, a contractor licence card or certificate, a workers\' compensation policy page.',
    tool: 'file_compliance_document',
    attach_path: '/projects/{project_id}/compliance',
    ask_when_unsure: ['Which job is it for?', 'Which sub does it belong to (list_compliance shows the vendors on the job)?', 'Is it a renewal of one already on file - replace it?'],
    note: 'Status follows the expiry date; an undated one is filed Pending for the contractor to review. Never store a full EIN or SSN - the last four digits only.',
  },
  {
    kind: 'Building permit',
    looks_like: 'A permit issued by a township, city or county building department, with a permit number.',
    tool: 'create_permit',
    attach_path: '/projects/{project_id}/permits',
    ask_when_unsure: ['Which job is it for?', 'Is it already on the job (list_permits) - then update_permit instead?'],
  },
  {
    kind: 'Inspection result',
    looks_like: 'An inspector\'s report or card: passed, failed, partial, with corrections.',
    tool: 'update_inspection',
    attach_path: '/projects/{project_id}/inspections',
    ask_when_unsure: ['Which job, and which inspection on it (list_inspections)?'],
  },
  {
    kind: 'Store receipt',
    looks_like: 'A till receipt from a supplier or big-box store for materials bought for a job.',
    tool: 'add_material_purchase',
    attach_path: '/projects/{project_id}/materials',
    ask_when_unsure: ['Which job were the materials for?', 'Which budget line (get_budget)?'],
    note: 'The receipt image is not attached by the tool; drop it on the receipt in Materials.',
  },
  {
    kind: 'Change order',
    looks_like: 'A signed or proposed change to the contract scope or price.',
    tool: 'create_change_order',
    attach_path: '/projects/{project_id}/change-orders',
    ask_when_unsure: ['Which job?', 'Is it already entered (list_change_orders)?'],
  },
  {
    kind: 'Quote or proposal from a sub',
    looks_like: 'A price for a scope of work sent BY a sub or supplier, not yet a bill.',
    tool: null,
    attach_path: '/projects/{project_id}/request-quotes',
    ask_when_unsure: ['Which job?', 'Has it been accepted? An accepted one becomes a subcontract (create_subcontract).'],
    note: 'Comparing quotes reads the PDF with a model on the Request Quotes tab; there is no tool for that upload. Once awarded, create_subcontract records the agreement.',
  },
  {
    kind: 'RFI',
    looks_like: 'A question about the drawings or specs that needs an answer from the architect or engineer.',
    tool: 'create_rfi',
    attach_path: '/projects/{project_id}/rfis',
    ask_when_unsure: ['Which job?', 'Is it already open (list_rfis)?'],
  },
  {
    kind: 'Plan sheet or drawing',
    looks_like: 'An architectural, structural, MEP, civil or landscape drawing.',
    tool: 'add_plan_sheet',
    attach_path: '/projects/{project_id}/plans',
    ask_when_unsure: ['Which job?', 'Which discipline (architectural, structural, mep, civil, landscape)?'],
    note: 'Needs the file itself, under 3MB; a full set is bigger than that, so it is usually dropped on the Plans tab.',
  },
  {
    kind: 'Anything else for the company\'s records',
    looks_like: 'A company document that is not tied to one job\'s tab: the company\'s own insurance, licences, legal or ID papers, templates.',
    tool: 'file_document',
    attach_path: '/files',
    ask_when_unsure: ['Is it really not one of the kinds above?', 'Which folder: Insurance, License, W-9, Site Plans, ID/Legal, Permits or Other?'],
    note: 'Files is the COMPANY library - it has no place for a document belonging to one job. Needs the file itself.',
  },
]

// ── reading ─────────────────────────────────────────────────────────────────

export const DOCUMENTS_READ: ToolDef[] = [
  {
    name: 'document_destinations',
    title: 'Where each kind of document goes',
    description:
      'Call this FIRST when somebody hands you a document to file. It lists every kind of document SyteNav keeps, what each ' +
      'looks like, which tool files it, where in the app the original file can be dropped, and what to ask the person when it ' +
      'is not clear. When you are not sure which kind it is, which job it is for, or which sub it belongs to - ASK, do not guess.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    resource: 'projects',
    project: 'none',
    async run() {
      return {
        data: {
          rule: 'File only when the kind, the job and (where it applies) the sub are clear. Otherwise ask the questions listed for that kind.',
          attachments: 'Most tools take the original as an optional `document` (PDF or photo, 3MB at most). When you cannot pass the bytes, file the details and give the person the attach_url.',
          destinations: DESTINATIONS.map(d => ({ ...d, attach_url: attachUrl(d.attach_path) })),
        },
      }
    },
  },

  {
    name: 'list_compliance',
    title: 'List compliance documents on a job',
    description:
      'Every vendor (subcontractor) on a job and its compliance paperwork - COI, W-9, licence, workers\' comp - with each ' +
      'document\'s status as the app shows it (it follows the expiry date), the expiry, whether a file is attached, and what ' +
      'the vendor still owes. Use the company_id here for file_compliance_document.',
    inputSchema: { type: 'object', properties: { project_id: PROJECT_ID }, required: ['project_id'], additionalProperties: false },
    resource: 'compliance',
    project: 'required',
    async run({ db, projectIds }) {
      const projectId = projectIds[0]
      const subs = await vendorsOnJob(db, projectId)
      if ('error' in subs) return failed('the vendors on this job', subs.error)
      const companyIds = Array.from(new Set(subs.rows.map((s: any) => s.company_id).filter(Boolean))) as string[]
      if (!companyIds.length) return { data: { vendors: [], attach_url: complianceTab(projectId) } }
      const [docs, reqs] = await Promise.all([
        db.from('compliance_documents').select('id, company_id, project_id, type, status, expiry_date, notes, file_url')
          .in('company_id', companyIds).or(`project_id.eq.${projectId},project_id.is.null`),
        db.from('compliance_requirements').select('company_id, project_id, type, required, note')
          .in('company_id', companyIds).or(`project_id.eq.${projectId},project_id.is.null`),
      ])
      if (docs.error) return failed('the compliance documents', docs.error)
      if (reqs.error) return failed('what each vendor owes', reqs.error)
      const byId = new Map((docs.data ?? []).map((d: any) => [d.id, d]))
      const groups = complianceReport({
        subcontracts: subs.rows.map((s: any) => ({ id: s.id, companies: s.companies })),
        docs: docs.data as any, requirements: reqs.data as any, projectId,
      })
      const seen = new Set(groups.map(g => g.companyId))
      const vendors = [
        ...groups.map(g => ({
          company_id: g.companyId,
          name: g.name,
          action_required: g.actionRequired,
          documents: g.docs.map(d => {
            const row: any = d.onFile ? byId.get(d.id) : null
            return {
              id: d.onFile ? d.id : null,
              type: d.type,
              label: d.label,
              status: STATUS_WORDS[d.status] ?? d.status,
              on_file: d.onFile,
              expiry_date: d.expiry_date,
              expiry: expiryLabel(d.expiry_date),
              file_attached: !!row?.file_url,
              company_wide: row ? row.project_id === null : null,
              notes: row?.notes ?? null,
            }
          }),
        })),
        // A vendor that owes nothing and has filed nothing is still on the job.
        ...Array.from(new Map(subs.rows
          .filter((s: any) => s.companies?.id && !seen.has(s.companies.id))
          .map((s: any) => [s.companies.id, s.companies.name])))
          .map(([id, name]) => ({ company_id: id, name, action_required: false, documents: [] })),
      ]
      return { data: { vendors, attach_url: complianceTab(projectId) } }
    },
  },

  {
    name: 'list_files',
    title: 'List the company Files library',
    description:
      'The company\'s Files library (its own insurance, licences, W-9, legal papers, templates) - name, folder, type and size. ' +
      'This is the COMPANY library; a job\'s paperwork is read with list_compliance, list_permits, list_sub_bills and list_plan_sheets. ' +
      'Check here before file_document so the same file is not added twice.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    resource: 'files',
    project: 'none',
    async run({ db, actor }) {
      if (!actor.companyId) return { data: { files: [], truncated: false, attach_url: filesPage() } }
      const { data, error } = await db.from('company_files')
        .select('id, name, category, file_type, size_bytes, file_url, created_at')
        .eq('company_id', actor.companyId)
        .order('created_at', { ascending: false })
      if (error) return failed('the Files library', error)
      const { rows, truncated } = capped(data ?? [])
      return {
        data: {
          files: rows.map((f: any) => ({
            id: f.id, name: f.name, folder: f.category ?? 'Other', file_type: f.file_type ?? null,
            size_bytes: f.size_bytes == null ? null : Number(f.size_bytes), has_file: !!f.file_url, added: f.created_at,
          })),
          truncated,
          attach_url: filesPage(),
        },
      }
    },
  },

  {
    name: 'list_plan_sheets',
    title: 'List plan sheets on a job',
    description: 'The plan sheets on a job - name, discipline and folder. Check here before add_plan_sheet so a sheet is not added twice.',
    inputSchema: { type: 'object', properties: { project_id: PROJECT_ID }, required: ['project_id'], additionalProperties: false },
    resource: 'plans',
    project: 'required',
    async run({ db, projectIds }) {
      const projectId = projectIds[0]
      const [plans, folders] = await Promise.all([
        db.from('project_plans').select('id, name, plan_type, folder_id, created_at').eq('project_id', projectId).order('created_at', { ascending: false }),
        db.from('plan_folders').select('id, name').eq('project_id', projectId).order('name'),
      ])
      if (plans.error) return failed('the plan sheets', plans.error)
      if (folders.error) return failed('the plan folders', folders.error)
      const folderName = new Map((folders.data ?? []).map((f: any) => [f.id, f.name]))
      const { rows, truncated } = capped(plans.data ?? [])
      return {
        data: {
          plans: rows.map((p: any) => ({ id: p.id, name: p.name, discipline: p.plan_type, folder: p.folder_id ? (folderName.get(p.folder_id) ?? null) : null, added: p.created_at })),
          folders: (folders.data ?? []).map((f: any) => ({ id: f.id, name: f.name })),
          truncated,
          attach_url: plansTab(projectId),
        },
      }
    },
  },
]

// ── filing ──────────────────────────────────────────────────────────────────

const money = { type: 'number', minimum: 0 }

export const DOCUMENTS_WRITE: WriteToolDef[] = [
  {
    name: 'file_compliance_document',
    title: 'File a compliance document',
    write: true,
    description:
      'File a sub\'s certificate of insurance (coi), W-9 (w9), licence (license), workers\' comp (workers_comp) or other ' +
      'compliance paper on a job, as the Compliance tab does - with its expiry date and the details printed on it. ' +
      'The status FOLLOWS THE DATE: expired if the date has passed, expiring soon inside 30 days, otherwise pending for the ' +
      'contractor to review. It never approves anything. The original file is optional (`document`); without it the answer ' +
      'gives attach_url, the page where the person can drop it. company_id comes from list_compliance - check it first: if that ' +
      'type is already on file for the sub, pass replaces_existing: true to replace it (fields you leave out are kept). ' +
      'Does not email the sub. Never store a full EIN or SSN - ein_last4 only.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        company_id: { type: 'string', description: 'The vendor, from list_compliance.' },
        type: { type: 'string', enum: [...COMPLIANCE_TYPES] },
        expiry_date: { ...DATE, description: 'YYYY-MM-DD, as printed on the document. Leave out for an undated one (a W-9).' },
        insurer: { type: 'string' }, policy_number: { type: 'string' },
        gl_per_occurrence: money, gl_aggregate: money, auto_limit: money, umbrella_limit: money, wc_el_accident: money,
        additional_insured: { type: 'boolean', description: 'Is the contractor named as additional insured?' },
        license_number: { type: 'string' }, license_type: { type: 'string' }, issuing_state: { type: 'string' },
        entity_type: { type: 'string', description: 'W-9: individual, llc, c_corp, s_corp, partnership...' },
        ein_last4: { type: 'string', pattern: '^\\d{4}$', description: 'The LAST FOUR digits only.' },
        notes: { type: 'string' },
        replaces_existing: { type: 'boolean', description: 'Required when this type is already on file for this sub on this job.' },
        document: DOCUMENT_ARG,
      },
      required: ['project_id', 'company_id', 'type'],
      additionalProperties: false,
    },
    resource: 'compliance',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      const pid = projectId!
      const attach = complianceTab(pid)
      const companyId = str(args.company_id)
      if (!companyId) return { error: 'Say whose document it is: company_id, from list_compliance.' }
      const type = str(args.type)
      if (!type || !(COMPLIANCE_TYPES as readonly string[]).includes(type)) return { error: `type must be one of: ${COMPLIANCE_TYPES.join(', ')}.` }
      if (args.expiry_date != null && !isDate(args.expiry_date)) return { error: 'expiry_date must be YYYY-MM-DD.' }
      if (args.ein_last4 != null && !/^\d{4}$/.test(String(args.ein_last4))) return { error: 'ein_last4 is the last four digits only - never the full number.' }

      // THE SUB MUST BE ON THIS JOB. The dispatcher checked the job is the
      // company's own; a company id from a model is checked here.
      const { data: sc, error: scError } = await db.from('subcontracts')
        .select('id, companies ( name )').eq('project_id', pid).eq('company_id', companyId).limit(1)
      if (scError) return failed('the vendors on this job', scError)
      if (!sc?.length) return { error: 'That company is not a vendor on this job. Use list_compliance for the ids.' }
      const vendor = (sc[0] as any).companies?.name ?? 'the vendor'

      const { data: existing, error: exError } = await db.from('compliance_documents')
        .select('id, expiry_date, notes, file_url').eq('company_id', companyId).eq('type', type).eq('project_id', pid).maybeSingle()
      if (exError) return failed('the compliance documents', exError)
      if (existing && args.replaces_existing !== true) {
        const when = (existing as any).expiry_date ? ` (${expiryLabel((existing as any).expiry_date)})` : ''
        return { error: `${vendor} already has a ${complianceLabel(type)} on file for this job${when}. Ask whether this one replaces it, then pass replaces_existing: true.` }
      }

      const doc = readDocument(args.document, attach)
      if (doc && 'problem' in doc) return { error: doc.problem }
      let stored: StoredDocument | null = null
      if (doc) {
        const s = await storeDocument(db, 'submittals', compliancePath(companyId, type, doc.filename), doc)
        if ('problem' in s) return { error: s.problem }
        stored = s
      }

      // Fields left out of a replacement keep what is on file.
      const expiry = (args.expiry_date as string | undefined) ?? (existing as any)?.expiry_date ?? null
      const summary = complianceSummary(type, args)
      const typed = [summary, str(args.notes)].filter(Boolean).join('\n')
      const notes = typed || (existing as any)?.notes || null
      const body = {
        company_id: companyId,
        type,
        status: complianceStatusFor(expiry),
        expiry_date: expiry,
        notes,
        file_url: stored?.url ?? (existing as any)?.file_url ?? null,
      }
      const result = await fileComplianceDocument(db, { userId: actor.userId, projectId: pid, body, via: VIA })
      if (result.status >= 400) {
        if (stored) await discardDocument(db, stored)
        return { error: String(result.body?.error ?? 'SyteNav refused that.') }
      }
      const row = result.body?.doc
      if (!row) return { error: 'SyteNav did not confirm the document was filed. Check the Compliance tab before trying again.' }
      return {
        data: {
          created: !existing, replaced: !!existing, record: 'compliance_document', id: row.id,
          vendor, type, label: complianceLabel(type), status: STATUS_WORDS[row.status] ?? row.status,
          expiry_date: row.expiry_date ?? null, expiry: expiryLabel(row.expiry_date),
          file_attached: !!row.file_url,
          attach_url: attach,
          next: row.file_url
            ? 'Filed on the Compliance tab.'
            : `Filed without the file. The original can be dropped on the Compliance tab: ${attach}`,
        },
      }
    },
  },

  {
    name: 'file_document',
    title: 'Add a document to the company Files',
    write: true,
    description:
      'Put a document into the company\'s Files library, in a folder (Insurance, License, W-9, Site Plans, ID/Legal, Permits, ' +
      'Other), as Files -> Upload does. For a document that belongs to the COMPANY rather than to one job\'s tab - check ' +
      'document_destinations first: bills, certificates, permits, receipts, plans and change orders each have their own tool. ' +
      'Needs the file itself (`document`, under 3MB): without it NOTHING is added and the answer gives attach_url, the page ' +
      'where the person can drop it. Check list_files first so it is not added twice.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'What to call it, e.g. "General liability certificate 2026".' },
        category: { type: 'string', enum: [...FILE_CATEGORIES] },
        document: DOCUMENT_ARG,
      },
      required: ['name'],
      additionalProperties: false,
    },
    resource: 'files',
    action: 'create',
    project: 'none',
    async run({ db, actor, args }) {
      const attach = filesPage()
      if (!actor.companyId) return { error: 'This person is not in a company.' }
      const name = str(args.name)
      if (!name) return { error: 'Say what to call it: name is required.' }
      const category = str(args.category) ?? 'Other'
      if (!(FILE_CATEGORIES as readonly string[]).includes(category)) return { error: `category must be one of: ${FILE_CATEGORIES.join(', ')}.` }
      const doc = readDocument(args.document, attach)
      if (doc && 'problem' in doc) return { error: doc.problem }
      if (!doc) {
        return {
          data: {
            created: false, record: 'company_file', name, folder: category, attach_url: attach,
            next: `Nothing was added: a Files entry is the file itself. Drop the original in the ${category} folder on Files: ${attach}`,
          },
        }
      }
      const stored = await storeDocument(db, 'company-files', companyFilePath(actor.companyId, doc.filename), doc)
      if ('problem' in stored) return { error: stored.problem }
      const result = await recordCompanyFile(db, {
        userId: actor.userId, companyId: actor.companyId, storagePath: stored.path, name, category,
        fileType: doc.contentType, fileSize: doc.bytes.length, filledFromId: null, via: VIA,
      })
      if (result.status >= 400) {
        await discardDocument(db, stored)
        return { error: String(result.body?.error ?? 'SyteNav refused that.') }
      }
      const f = result.body?.file
      if (!f) return { error: 'SyteNav did not confirm the file was added. Check Files before trying again.' }
      return { data: { created: true, record: 'company_file', id: f.id, name: f.name, folder: f.category, attach_url: attach } }
    },
  },

  {
    name: 'add_plan_sheet',
    title: 'Add a plan sheet to a job',
    write: true,
    description:
      'Add a drawing to a job\'s Plans, as the Plans tab\'s upload does: a name, its discipline (architectural, structural, mep, ' +
      'civil, landscape, other) and optionally a folder from list_plan_sheets. Needs the file itself (`document`: PDF, PNG or ' +
      'JPEG, under 3MB) - a full plan set is usually bigger, and without the file NOTHING is added and the answer gives ' +
      'attach_url, the Plans tab where the person can drop it. Check list_plan_sheets first so a sheet is not added twice.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        name: { type: 'string', description: 'e.g. "A-101 First floor plan".' },
        plan_type: { type: 'string', enum: [...PLAN_TYPES] },
        folder_id: { type: 'string', description: 'From list_plan_sheets.' },
        document: DOCUMENT_ARG,
      },
      required: ['project_id', 'name', 'plan_type'],
      additionalProperties: false,
    },
    resource: 'plans',
    action: 'create',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      const pid = projectId!
      const attach = plansTab(pid)
      const name = str(args.name)
      if (!name) return { error: 'Say what the sheet is called: name is required.' }
      const planType = str(args.plan_type)
      if (!planType || !(PLAN_TYPES as readonly string[]).includes(planType)) return { error: `plan_type must be one of: ${PLAN_TYPES.join(', ')}.` }
      const folderId = str(args.folder_id)
      if (folderId) {
        const where = await onJob(db, 'plan_folders', folderId, pid)
        if (where) return { error: where === 'That record is not on this job.' ? 'That folder is not on this job. Use list_plan_sheets for the folders.' : where }
      }
      const doc = readDocument(args.document, attach, ['application/pdf', 'image/png', 'image/jpeg'])
      if (doc && 'problem' in doc) return { error: doc.problem }
      if (!doc) {
        return {
          data: {
            created: false, record: 'plan_sheet', name, attach_url: attach,
            next: `Nothing was added: a plan sheet is the drawing itself. Drop the file on the Plans tab: ${attach}`,
          },
        }
      }
      const stored = await storeDocument(db, 'plans', planPath(pid, folderId, doc.filename), doc)
      if ('problem' in stored) return { error: stored.problem }
      // recordPlanSheet removes the stored file itself when the insert is refused.
      const result = await recordPlanSheet(db, { userId: actor.userId, projectId: pid, name, planType, folderId, storagePath: stored.path, via: VIA })
      if (result.status >= 400) return { error: String(result.body?.error ?? 'SyteNav refused that.') }
      const p = result.body?.plan
      if (!p) return { error: 'SyteNav did not confirm the sheet was added. Check the Plans tab before trying again.' }
      return { data: { created: true, record: 'plan_sheet', id: p.id, name: p.name, discipline: p.plan_type, attach_url: attach } }
    },
  },
]

