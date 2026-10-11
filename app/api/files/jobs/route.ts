import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { actorCan } from '@/lib/server-permissions'
import { myJobs } from '@/lib/my-jobs'
import { JOB_FILE_KINDS, nameFromUrl, type JobFile, type JobFileKind } from '@/lib/job-files'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const RESTRICTED_ROLES = ['field_supervisor', 'worker', 'read_only', 'member']

/**
 * Every file on this company's jobs, for the Files page - see lib/job-files.ts
 * for why Files was blank over a company full of paperwork.
 *
 * THE SAME FENCES AS THE JOB SCREENS. Only jobs this company runs; a role that
 * only sees the jobs it is assigned to sees only those here (the Projects
 * list's rule, via `myJobs`); and each kind is asked its OWN permission, so a
 * worker sees the plans and the photos and not the bills.
 *
 * A READ THAT FAILED IS NOT AN EMPTY KIND. Each kind that could not be read is
 * named in `failed`, so the page can say "quotes could not be loaded" rather
 * than show a folder that looks complete.
 */
export async function GET(request: Request) {
  const db = admin()
  const gate = await requirePermission(db, request, 'files', 'view')
  if (denied(gate)) return gate.denied
  const { actor } = gate
  if (!actor.companyId) return NextResponse.json({ files: [], failed: [] })

  let { data: projects, error: pErr } = await db
    .from('projects').select('id, name').eq('gc_company_id', actor.companyId)
  if (pErr) {
    console.error('[files/jobs] projects read failed', pErr.message)
    return NextResponse.json({ error: 'Could not load your jobs.' }, { status: 500 })
  }
  if (RESTRICTED_ROLES.includes(actor.role)) {
    const { data: me } = await db.from('profiles').select('email, full_name, company_id').eq('id', actor.userId).maybeSingle()
    const { projectIds } = await myJobs(db, actor.userId, me as any)
    const mine = new Set(projectIds)
    projects = (projects ?? []).filter(p => mine.has(p.id))
  }
  const ids = (projects ?? []).map(p => p.id)
  if (!ids.length) return NextResponse.json({ files: [], failed: [] })
  const jobName = new Map((projects ?? []).map(p => [p.id, p.name as string]))

  const allowed = new Set(JOB_FILE_KINDS.filter(k => actorCan(actor, k.resource, 'view')).map(k => k.kind))
  const want = (k: JobFileKind) => allowed.has(k)
  const none = Promise.resolve({ data: [] as any[], error: null as any })

  const [plans, photos, submittals, quotes, rfq, bills] = await Promise.all([
    want('plan') ? db.from('project_plans').select('id, name, project_id, created_at').in('project_id', ids) : none,
    want('photo') ? db.from('daily_log_photos').select('id, photo_url, caption, created_at, daily_logs!inner ( project_id, log_date )').in('daily_logs.project_id', ids) : none,
    want('submittal') ? db.from('submittals').select('id, title, file_url, project_id, created_at').in('project_id', ids).not('file_url', 'is', null) : none,
    want('quote') ? db.from('quotes').select('id, file_url, file_name, vendor_name, created_at, quote_comparisons!inner ( project_id )').in('quote_comparisons.project_id', ids).not('file_url', 'is', null) : none,
    want('rfq') ? db.from('bid_request_attachments').select('id, file_url, file_name, created_at, bid_requests!inner ( project_id, title )').in('bid_requests.project_id', ids) : none,
    want('bill') ? db.from('invoices').select('id, document_url, document_name, company_name, invoice_number, project_id, created_at').in('project_id', ids).not('document_url', 'is', null) : none,
  ])

  const failed: JobFileKind[] = []
  const files: JobFile[] = []
  const add = (kind: JobFileKind, res: { data: any[] | null; error: any }, map: (r: any) => Omit<JobFile, 'kind' | 'project_name'>) => {
    if (res.error) {
      console.error(`[files/jobs] ${kind} read failed`, res.error.message)
      failed.push(kind)
      return
    }
    for (const r of res.data ?? []) {
      const f = map(r)
      files.push({ ...f, kind, project_name: jobName.get(f.project_id) ?? 'Job' })
    }
  }

  // Plans open on the job's Plans tab: their bytes are signed per request by
  // the plan file route, and a stored URL is only as good as the key that
  // signed it.
  add('plan', plans, r => ({ id: r.id, name: r.name || 'Plan', project_id: r.project_id, created_at: r.created_at, url: null }))
  add('photo', photos, r => ({
    id: r.id, name: r.caption || `Site photo, ${r.daily_logs?.log_date ?? ''}`.trim(),
    project_id: r.daily_logs?.project_id, created_at: r.created_at, url: r.photo_url ?? null,
  }))
  add('submittal', submittals, r => ({ id: r.id, name: r.title || nameFromUrl(r.file_url, 'Submittal'), project_id: r.project_id, created_at: r.created_at, url: r.file_url }))
  add('quote', quotes, r => ({
    id: r.id, name: r.file_name || (r.vendor_name ? `Quote - ${r.vendor_name}` : nameFromUrl(r.file_url, 'Quote')),
    project_id: r.quote_comparisons?.project_id, created_at: r.created_at, url: r.file_url,
  }))
  add('rfq', rfq, r => ({
    id: r.id, name: r.file_name || nameFromUrl(r.file_url, 'Attachment'),
    project_id: r.bid_requests?.project_id, created_at: r.created_at, url: r.file_url,
  }))
  add('bill', bills, r => ({
    id: r.id, name: r.document_name || [r.company_name, r.invoice_number].filter(Boolean).join(' ') || 'Bill',
    project_id: r.project_id, created_at: r.created_at, url: r.document_url,
  }))

  files.sort((a, b) => b.created_at.localeCompare(a.created_at))
  return NextResponse.json({ files, failed })
}
