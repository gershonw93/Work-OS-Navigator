'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart2, Play, Loader2, Save, Share2, Printer, FileSpreadsheet, Search,
  FolderKanban, UsersRound, HardHat, Truck, Trash2, Link2, Copy, Power, Bookmark,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/lib/use-permissions'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useNotice } from '@/components/ui/notice'
import { useDeleteGuard } from '@/components/ui/delete-guard'
import { RowMenu, MenuItem } from '@/components/ui/row-menu'
import { ReportView } from '@/components/reports/report-view'
import { SaveDialog, ShareDialog, type ShareRecipient, type ShareResult } from '@/components/reports/report-dialogs'
import {
  SUBJECTS, PERIODS, DEFAULT_CONFIG, sectionsFor, configProblem, internalSections,
  type ReportConfig, type ReportDoc, type ReportSubject, type SectionKey, type PeriodPreset,
} from '@/lib/report-builder'
import { docToSheets } from '@/lib/report-format'
import { fetchProblem } from '@/lib/fetch-error'
import { formatDate } from '@/lib/dates'

// ─────────────────────────────────────────────────────────────────────────────
// Reports - build one, save it, share it, print it.
//
// The screen only COLLECTS settings. The route runs them through the one
// builder (lib/report-builder.ts), and what comes back is a finished document
// this page renders with the same component the shared link uses - so what
// you look at here is exactly what a developer or a sub will open.
// ─────────────────────────────────────────────────────────────────────────────

interface Pick { id: string; name: string; trade?: string | null; status?: string | null; email?: string | null }
interface Options {
  projects: Pick[]
  customers: Pick[]
  subs: Pick[]
  suppliers: Pick[]
  sections: SectionKey[]
  canSave: boolean
  canDelete: boolean
  companyName: string | null
  logoUrl: string | null
}
interface Saved { id: string; name: string; config: ReportConfig; created_by_name: string | null; updated_at: string }
interface Share {
  id: string; token: string; title: string; recipient_name: string | null; recipient_email: string | null
  emailed_at: string | null; created_by_name: string | null; created_at: string; viewed_at: string | null; revoked_at: string | null
}

const SUBJECT_ICON: Record<ReportSubject, typeof FolderKanban> = { job: FolderKanban, customer: UsersRound, sub: HardHat, supplier: Truck }
const JOB_STATUSES = [
  { key: 'planning', label: 'Planning' },
  { key: 'active', label: 'Active' },
  { key: 'on_hold', label: 'On hold' },
  { key: 'completed', label: 'Completed' },
]

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await createClient().auth.getSession()
  return { Authorization: `Bearer ${session?.access_token ?? ''}`, 'Content-Type': 'application/json' }
}

/** A filterable checklist. Nothing ticked means "all of them" - and says so. */
function Picker({ items, picked, onChange, noun }: { items: Pick[]; picked: string[]; onChange: (ids: string[]) => void; noun: string }) {
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const f = q.trim().toLowerCase()
    return f ? items.filter(i => i.name.toLowerCase().includes(f) || (i.trade ?? '').toLowerCase().includes(f)) : items
  }, [items, q])
  const set = new Set(picked)
  const toggle = (id: string) => onChange(set.has(id) ? picked.filter(x => x !== id) : [...picked, id])

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${noun}`} className="pl-9" />
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-fg">{picked.length ? `${picked.length} picked` : `All ${noun} (${items.length})`}</span>
        {picked.length > 0 && <button type="button" onClick={() => onChange([])} className="font-medium text-accent-fg">Clear - use all</button>}
      </div>
      <div className="max-h-56 overflow-y-auto rounded-xl border border-line divide-y divide-line-soft">
        {shown.length === 0 && <p className="px-3 py-4 text-center text-sm text-muted-fg">{items.length ? 'Nothing matches.' : `No ${noun} yet.`}</p>}
        {shown.map(i => (
          <label key={i.id} className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-surface lg:min-h-0">
            <input type="checkbox" checked={set.has(i.id)} onChange={() => toggle(i.id)} className="h-4 w-4 shrink-0 accent-[var(--accent)]" />
            <span className="min-w-0 flex-1 truncate text-ink">{i.name}</span>
            {(i.trade || i.status) && <span className="shrink-0 text-xs capitalize text-faint">{i.trade || i.status?.replace(/_/g, ' ')}</span>}
          </label>
        ))}
      </div>
    </div>
  )
}

export default function ReportsPage() {
  const notice = useNotice()
  const guard = useDeleteGuard()
  const { can, loading: permsLoading } = usePermissions()
  const [opts, setOpts] = useState<Options | null>(null)
  const [optsError, setOptsError] = useState('')
  const [config, setConfig] = useState<ReportConfig>(DEFAULT_CONFIG)
  const [doc, setDoc] = useState<ReportDoc | null>(null)
  // The settings that PRODUCED the report on screen. Save and Share use these,
  // not the form: somebody who ran a report and then changed a box must share
  // the report they are looking at, not one they have never seen.
  const [docConfig, setDocConfig] = useState<ReportConfig | null>(null)
  const [dropped, setDropped] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState('')
  const [saved, setSaved] = useState<Saved[]>([])
  const [savedState, setSavedState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [openSaved, setOpenSaved] = useState<Saved | null>(null)
  const [shares, setShares] = useState<Share[]>([])
  const [showShares, setShowShares] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sharing, setSharing] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)
  // The id of the run being waited for: a slow first run that lands after a
  // second one must not paint over it.
  const runSeq = useRef(0)

  useEffect(() => {
    (async () => {
      try {
        const headers = await authHeaders()
        const [o, s, sh] = await Promise.all([
          fetch('/api/reports/options', { headers }),
          fetch('/api/reports/saved', { headers }),
          fetch('/api/reports/shares', { headers }),
        ])
        if (o.ok) {
          const data: Options = await o.json()
          setOpts(data)
          // Start with only the sections this person may run.
          setConfig(c => ({ ...c, sections: c.sections.filter(k => data.sections.includes(k)) }))
        } else {
          setOptsError((await o.json().catch(() => ({}))).error || 'Could not load Reports.')
        }
        if (s.ok) { setSaved((await s.json()).reports ?? []); setSavedState('ready') } else setSavedState('failed')
        if (sh.ok) setShares((await sh.json()).shares ?? [])
      } catch (e) {
        setOptsError(fetchProblem(e, 'loading Reports'))
        setSavedState('failed')
      }
    })()
  }, [])

  const allowed = new Set(opts?.sections ?? [])
  const subjectSections = sectionsFor(config.subject)
  const offered = subjectSections.filter(s => allowed.has(s.key))
  const hiddenCount = subjectSections.length - offered.length
  const isVendor = config.subject === 'sub' || config.subject === 'supplier'

  function patch(p: Partial<ReportConfig>) { setConfig(c => ({ ...c, ...p })) }

  function setSubject(subject: ReportSubject) {
    if (subject === config.subject) return
    const ok = sectionsFor(subject).map(s => s.key).filter(k => allowed.has(k))
    // Keep what still applies; a vendor report never carries job-wide sections.
    const keep = config.sections.filter(k => ok.includes(k))
    patch({ subject, ids: [], sections: keep.length ? keep : ok.slice(0, 3) })
  }

  function toggleSection(k: SectionKey) {
    patch({ sections: config.sections.includes(k) ? config.sections.filter(x => x !== k) : [...config.sections, k] })
  }

  const pickList: Pick[] = !opts ? [] :
    config.subject === 'job' ? opts.projects :
    config.subject === 'customer' ? opts.customers :
    config.subject === 'sub' ? opts.subs : opts.suppliers
  const noun = (SUBJECTS.find(s => s.key === config.subject)?.plural ?? '').toLowerCase()

  async function run(c: ReportConfig = config) {
    const problem = configProblem(c)
    if (problem) { setRunError(problem); return }
    const seq = ++runSeq.current
    setRunning(true); setRunError('')
    try {
      const res = await fetch('/api/reports/run', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ config: c }) })
      const body = await res.json().catch(() => ({}))
      if (seq !== runSeq.current) return
      if (!res.ok) { setRunError(body.error || 'Could not run the report.'); return }
      setDoc(body.doc)
      setDocConfig(c)
      setDropped(body.dropped ?? [])
      // On a phone the report is below the form - take them to it.
      requestAnimationFrame(() => reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    } catch (e) {
      if (seq === runSeq.current) setRunError(fetchProblem(e, 'running the report'))
    } finally {
      if (seq === runSeq.current) setRunning(false)
    }
  }

  function openReport(s: Saved) {
    const c = { ...DEFAULT_CONFIG, ...s.config }
    setConfig(c)
    setOpenSaved(s)
    run(c)
  }

  async function save(name: string, asNew: boolean): Promise<string | null> {
    try {
      const headers = await authHeaders()
      const res = asNew || !openSaved
        ? await fetch('/api/reports/saved', { method: 'POST', headers, body: JSON.stringify({ name, config: docConfig ?? config }) })
        : await fetch(`/api/reports/saved/${openSaved.id}`, { method: 'PATCH', headers, body: JSON.stringify({ name, config: docConfig ?? config }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) return body.error || 'Could not save the report.'
      const r: Saved = body.report
      setSaved(list => [r, ...list.filter(x => x.id !== r.id)])
      setOpenSaved(r)
      setSaving(false)
      notice(`Saved "${r.name}".`, { tone: 'success' })
      return null
    } catch (e) {
      return fetchProblem(e, 'saving the report')
    }
  }

  function removeSaved(s: Saved) {
    guard(async () => {
      const res = await fetch(`/api/reports/saved/${s.id}`, { method: 'DELETE', headers: await authHeaders() })
      if (!res.ok) { notice((await res.json().catch(() => ({}))).error || 'Could not delete that report.'); return }
      setSaved(list => list.filter(x => x.id !== s.id))
      if (openSaved?.id === s.id) setOpenSaved(null)
    }, { label: `the saved report "${s.name}"`, body: 'Links you already shared from it keep working - they hold their own copy.' })
  }

  async function share(r: { recipientName: string; recipientEmail: string; message: string; sendEmail: boolean }): Promise<ShareResult | string> {
    try {
      const res = await fetch('/api/reports/shares', {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({ config: docConfig ?? config, savedReportId: openSaved?.id ?? null, ...r }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) return body.error || 'Could not share the report.'
      setShares(list => [body.share, ...list])
      return { url: body.url, emailed: !!body.emailed, emailError: body.emailError ?? null, dropped: body.dropped ?? [] }
    } catch (e) {
      return fetchProblem(e, 'sharing the report')
    }
  }

  function revoke(s: Share) {
    guard(async () => {
      const res = await fetch(`/api/reports/shares/${s.id}`, { method: 'DELETE', headers: await authHeaders() })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { notice(body.error || 'Could not turn that link off.'); return }
      setShares(list => list.map(x => x.id === s.id ? { ...x, revoked_at: body.revoked_at } : x))
    }, { title: 'Turn this link off?', body: `Whoever has the link to "${s.title}" will see that it was turned off. This cannot be undone - share again to send a new one.`, confirmLabel: 'Turn off' })
  }

  async function copyShare(s: Share) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/shared-report/${s.token}`)
      notice('Link copied.', { tone: 'success' })
    } catch {
      notice('Could not copy the link.')
    }
  }

  async function exportExcel() {
    if (!doc) return
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()
      for (const sh of docToSheets(doc)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sh.rows), sh.name)
      const file = `${doc.title.replace(/[^\w\- ]+/g, '').trim() || 'report'}.xlsx`
      XLSX.writeFile(wb, file)
    } catch (e) {
      console.error('[reports] excel', e)
      notice('Could not make the spreadsheet.')
    }
  }

  const recipients: ShareRecipient[] = !opts ? [] : [
    ...opts.customers.map(c => ({ key: `c:${c.id}`, label: c.email ? `${c.name} (${c.email})` : `${c.name} (no email)`, name: c.name, email: c.email ?? null, kind: 'customer' as const })),
    ...opts.subs.map(c => ({ key: `s:${c.id}`, label: c.email ? `${c.name} (${c.email})` : `${c.name} (no email)`, name: c.name, email: c.email ?? null, kind: 'sub' as const })),
    ...opts.suppliers.map(c => ({ key: `p:${c.id}`, label: c.email ? `${c.name} (${c.email})` : `${c.name} (no email)`, name: c.name, email: c.email ?? null, kind: 'supplier' as const })),
  ]

  if (permsLoading) return <div className="p-6 py-12 text-center text-sm text-faint">Loading…</div>
  if (!can('reports', 'view')) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-ink">Reports</h1>
        <p className="mt-2 text-sm text-muted-fg">You do not have access to Reports. Ask your company admin.</p>
      </div>
    )
  }

  const liveShares = shares.filter(s => !s.revoked_at)

  return (
    <div className="p-6 space-y-6">
      <div className="print:hidden flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink"><BarChart2 className="h-6 w-6 text-accent-fg" /> Reports</h1>
        <p className="text-sm text-muted-fg">Build a report on a job, a customer, a sub or a supplier - pick what goes in it, then save it, share it, or export it as a PDF or a spreadsheet.</p>
      </div>

      {optsError && <p className="print:hidden rounded-xl border border-danger/40 bg-danger-tint px-4 py-3 text-sm text-danger">{optsError}</p>}

      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)] print:block">
        {/* ── Settings ─────────────────────────────────────────────────── */}
        <div className="print:hidden space-y-6">
          <Card className="space-y-5 p-5">
            <div>
              <Label>What is it about? <span className="text-danger">*</span></Label>
              <div className="grid grid-cols-2 gap-2">
                {SUBJECTS.map(s => {
                  const Icon = SUBJECT_ICON[s.key]
                  const on = config.subject === s.key
                  return (
                    <button key={s.key} type="button" onClick={() => setSubject(s.key)}
                      className={cn('flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm font-medium',
                        on ? 'border-accent bg-accent-tint text-accent-fg' : 'border-line text-muted-fg hover:bg-surface')}>
                      <Icon className="h-4 w-4 shrink-0" /> {s.label}
                    </button>
                  )
                })}
              </div>
              <p className="mt-1 text-xs text-faint">{SUBJECTS.find(s => s.key === config.subject)?.hint}</p>
            </div>

            <div>
              <Label>Which {noun}? (optional)</Label>
              {opts ? <Picker items={pickList} picked={config.ids} onChange={ids => patch({ ids })} noun={noun} /> : <p className="text-sm text-faint">Loading…</p>}
            </div>

            <div>
              <Label>Job status (optional)</Label>
              <div className="flex flex-wrap gap-2">
                {JOB_STATUSES.map(s => {
                  const on = config.statuses.includes(s.key)
                  return (
                    <button key={s.key} type="button"
                      onClick={() => patch({ statuses: on ? config.statuses.filter(x => x !== s.key) : [...config.statuses, s.key] })}
                      className={cn('min-h-11 whitespace-nowrap rounded-full border px-3 text-sm lg:min-h-0 lg:py-1',
                        on ? 'border-accent bg-accent-tint text-accent-fg' : 'border-line text-muted-fg hover:bg-surface')}>
                      {s.label}
                    </button>
                  )
                })}
              </div>
              <p className="mt-1 text-xs text-faint">{config.statuses.length ? 'Only jobs in these statuses.' : 'Every status.'}</p>
            </div>

            <div>
              <Label>Period <span className="text-danger">*</span></Label>
              <Select value={config.period.preset} onChange={e => patch({ period: { ...config.period, preset: e.target.value as PeriodPreset } })}>
                {PERIODS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </Select>
              {config.period.preset === 'custom' && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <Label>From (optional)</Label>
                    <Input type="date" value={config.period.from ?? ''} onChange={e => patch({ period: { ...config.period, from: e.target.value || null } })} />
                  </div>
                  <div>
                    <Label>To (optional)</Label>
                    <Input type="date" value={config.period.to ?? ''} onChange={e => patch({ period: { ...config.period, to: e.target.value || null } })} />
                  </div>
                </div>
              )}
              <p className="mt-1 text-xs text-faint">Applies to dated things - bills, payments, logs, hours. Contracts and budgets are always to date.</p>
            </div>

            <div>
              <Label>What goes in it? <span className="text-danger">*</span></Label>
              <div className="space-y-1">
                {offered.map(s => (
                  <label key={s.key} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-surface">
                    <input type="checkbox" checked={config.sections.includes(s.key)} onChange={() => toggleSection(s.key)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink">{s.label}{s.internal && <span className="ml-1 text-xs font-normal text-faint">- internal</span>}</span>
                      <span className="block text-xs text-muted-fg">{s.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              {offered.length > 0 && (
                <div className="mt-1 flex gap-3 text-xs">
                  <button type="button" className="font-medium text-accent-fg" onClick={() => patch({ sections: offered.map(s => s.key) })}>Tick all</button>
                  <button type="button" className="font-medium text-muted-fg" onClick={() => patch({ sections: [] })}>Untick all</button>
                </div>
              )}
              {isVendor && <p className="mt-2 text-xs text-faint">A report about a {config.subject === 'sub' ? 'sub' : 'supplier'} only carries their own rows, so it is safe to share with them. Client billing, margin, permits and logs are left out.</p>}
              {hiddenCount > 0 && <p className="mt-2 text-xs text-faint">{hiddenCount} more {hiddenCount === 1 ? 'section is' : 'sections are'} not shown - your role does not have access.</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Lay out (optional)</Label>
                <Select value={config.groupBy} onChange={e => patch({ groupBy: e.target.value === 'none' ? 'none' : 'job' })}>
                  <option value="job">A table per job</option>
                  <option value="none">One combined table</option>
                </Select>
              </div>
              <div>
                <Label>Title (optional)</Label>
                <Input value={config.title ?? ''} onChange={e => patch({ title: e.target.value })} placeholder="Made for you" />
              </div>
            </div>

            {runError && <p className="text-sm text-danger">{runError}</p>}
            <Button className="w-full" onClick={() => run()} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {running ? 'Running…' : 'Run report'}
            </Button>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink"><Bookmark className="h-4 w-4 text-faint" /> Saved reports</h2>
            {savedState === 'loading' && <p className="text-sm text-faint">Loading…</p>}
            {savedState === 'failed' && <p className="text-sm text-danger">Could not load your saved reports. Reload to try again.</p>}
            {savedState === 'ready' && saved.length === 0 && (
              <p className="text-sm text-muted-fg">None yet. Run a report and press Save to keep its settings here.</p>
            )}
            {saved.length > 0 && (
              <div className="divide-y divide-line-soft">
                {saved.map(s => (
                  <div key={s.id} className={cn('flex items-center gap-2 py-2', openSaved?.id === s.id && 'bg-surface -mx-2 rounded-lg px-2')}>
                    <button type="button" onClick={() => openReport(s)} className="min-h-11 min-w-0 flex-1 text-left lg:min-h-0">
                      <span className="block truncate text-sm font-medium text-ink">{s.name}</span>
                      <span className="block truncate text-xs text-faint">
                        {SUBJECTS.find(x => x.key === s.config?.subject)?.label ?? 'Report'} - {PERIODS.find(p => p.key === s.config?.period?.preset)?.label ?? 'All time'}
                      </span>
                    </button>
                    {opts?.canDelete && (
                      <RowMenu label={`More for ${s.name}`}>
                        {close => (
                          <MenuItem danger onClick={() => { close(); removeSaved(s) }}>
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </MenuItem>
                        )}
                      </RowMenu>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <button type="button" onClick={() => setShowShares(v => !v)} className="flex w-full items-center justify-between text-left">
              <span className="flex items-center gap-2 text-sm font-semibold text-ink"><Link2 className="h-4 w-4 text-faint" /> Shared links</span>
              <span className="text-xs text-muted-fg">{liveShares.length} live {showShares ? '- hide' : '- show'}</span>
            </button>
            {showShares && (
              <div className="mt-3 divide-y divide-line-soft">
                {shares.length === 0 && <p className="py-2 text-sm text-muted-fg">Nothing shared yet.</p>}
                {shares.map(s => (
                  <div key={s.id} className="flex items-center gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <p className={cn('truncate text-sm font-medium', s.revoked_at ? 'text-faint line-through' : 'text-ink')}>{s.title}</p>
                      <p className="truncate text-xs text-faint">
                        {s.recipient_name || s.recipient_email || 'Link only'} - {formatDate(s.created_at)}
                        {s.revoked_at ? ' - turned off' : s.viewed_at ? ' - opened' : ' - not opened yet'}
                      </p>
                    </div>
                    {!s.revoked_at && (
                      <RowMenu label={`More for ${s.title}`}>
                        {close => (
                          <>
                            <MenuItem onClick={() => { close(); copyShare(s) }}><Copy className="h-3.5 w-3.5" /> Copy link</MenuItem>
                            <MenuItem href={`/shared-report/${s.token}`} newTab onClick={close}><Link2 className="h-3.5 w-3.5" /> Open what they see</MenuItem>
                            {opts?.canSave && <MenuItem danger onClick={() => { close(); revoke(s) }}><Power className="h-3.5 w-3.5" /> Turn link off</MenuItem>}
                          </>
                        )}
                      </RowMenu>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ── The report ───────────────────────────────────────────────── */}
        <div ref={reportRef} className="min-w-0 scroll-mt-4 space-y-4">
          {doc && (
            <div className="print:hidden row-even lg:flex lg:flex-wrap gap-2">
              {opts?.canSave && (
                <Button variant="secondary" onClick={() => setSaving(true)}><Save className="h-4 w-4" /> {openSaved ? 'Save' : 'Save report'}</Button>
              )}
              {opts?.canSave && (
                <Button variant="secondary" onClick={() => setSharing(true)}><Share2 className="h-4 w-4" /> Share</Button>
              )}
              <Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" /> PDF / Print</Button>
              <Button variant="secondary" onClick={exportExcel}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
            </div>
          )}
          {doc && dropped.length > 0 && (
            <p className="print:hidden text-sm text-muted-fg">Left out because your role does not have access: {dropped.join(', ')}.</p>
          )}
          {doc ? (
            <Card className={cn('p-5 lg:p-6 print:border-0 print:p-0 print:shadow-none', running && 'opacity-60')}>
              <ReportView doc={doc} companyName={opts?.companyName} logoUrl={opts?.logoUrl} />
            </Card>
          ) : (
            <Card className="print:hidden flex flex-col items-center gap-2 px-6 py-16 text-center">
              <BarChart2 className="h-8 w-8 text-faint" />
              <p className="font-medium text-ink">{running ? 'Running your report…' : 'Your report shows up here'}</p>
              <p className="max-w-sm text-sm text-muted-fg">Pick what it is about and what goes in it, then press Run report. Open a saved report to run it again with today&apos;s numbers.</p>
            </Card>
          )}
        </div>
      </div>

      {saving && (
        <SaveDialog
          initialName={openSaved?.name ?? doc?.title ?? ''}
          existingName={openSaved?.name ?? null}
          onClose={() => setSaving(false)}
          onSave={save}
        />
      )}
      {sharing && doc && (
        <ShareDialog
          title={doc.title}
          recipients={recipients}
          internal={internalSections(docConfig ?? config)}
          onClose={() => setSharing(false)}
          onShare={share}
        />
      )}
    </div>
  )
}
