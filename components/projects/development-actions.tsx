'use client'

// Adding to and moving between developments - "the ease of moving things
// around and adding things everywhere". Three dialogs, one rule set
// (lib/development.ts), and the routes behind them are the only writers of a
// job's development after it exists:
//   AddJobDialog       one more job in this development, a house model with it
//   AddExistingDialog  jobs you already have, moved in (from anywhere)
//   MoveJobDialog      one job to another development, or out on its own

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { AddressAutocomplete } from '@/components/ui/address-autocomplete'
import { LotDetailsFields } from '@/components/projects/lot-details-fields'
import { lotFormBody, lotFormFrom, type LotForm } from '@/lib/lot-details'
import { track } from '@/lib/analytics-client'
import { projectType } from '@/lib/analytics'
import { newJobProblem, newDevelopmentProblem, DEVELOPMENT_LOWER } from '@/lib/development'
import { autoFocusOnDesktop } from '@/lib/auto-focus'

async function authHeaders() {
  const { data: { session } } = await createClient().auth.getSession()
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` }
}

interface ProjectRow { id: string; name: string; status?: string | null; address?: string | null; is_site?: boolean | null; parent_project_id?: string | null }

/** The company's jobs and developments, once - both pickers read it. */
function useCompanyProjects(open: boolean) {
  const [rows, setRows] = useState<ProjectRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!open) return
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/projects', { headers: await authHeaders() })
        if (!res.ok) { if (alive) setFailed(true); return }
        const d = await res.json()
        if (alive) setRows(d.projects ?? [])
      } catch {
        if (alive) setFailed(true)
      }
    })()
    return () => { alive = false }
  }, [open])
  return { rows, failed }
}

function Shell({ title, sub, onClose, children, footer }: {
  title: string; sub?: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode
}) {
  return (
    <div className="overlay items-center justify-center bg-black/50" data-overlay>
      <div className="flex max-h-full w-full max-w-lg min-w-0 flex-col overflow-hidden rounded-xl bg-panel shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-ink">{title}</h2>
            {sub && <p className="truncate text-sm text-muted-fg">{sub}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" title="Close" className="shrink-0 text-faint hover:text-ink"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        <div className="row-even shrink-0 border-t border-line px-5 py-4 lg:flex lg:justify-end gap-2">{footer}</div>
      </div>
    </div>
  )
}

// ── One more job in this development ────────────────────────────────────────
export function AddJobDialog({ developmentId, developmentName, models, onClose, onDone }: {
  developmentId: string
  developmentName: string
  models: { id: string; name: string }[]
  onClose: () => void
  /** The new job's id, and anything worth saying about how it went. */
  onDone: (projectId: string, note: string | null) => void
}) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [lot, setLot] = useState<LotForm>(lotFormFrom(null))
  const [modelId, setModelId] = useState('')
  const [apply, setApply] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    const problem = newJobProblem({ name, address })
    if (problem) { setErr(problem); return }
    setSaving(true); setErr('')
    try {
      const headers = await authHeaders()
      const res = await fetch(`/api/projects/${developmentId}/children/new`, {
        method: 'POST', headers,
        body: JSON.stringify({ name: name.trim(), address: address.trim(), model_id: modelId || null, ...lotFormBody(lot) }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error ?? 'Could not create the job.'); return }
      const id: string = d.project.id
      track('project_created', { entry_point: 'development', project_type: projectType(d.project?.type), project_count: 1 })

      // THE MODEL, applied through the ONE route that applies models, for this
      // one house. Only the parts this person may write - the preview says
      // which - so a project manager without budget rights still gets the plans.
      let note: string | null = d.located === false && address.trim() ? 'It is not on the map yet - check the address in Project Settings.' : null
      if (modelId && apply) {
        const pre = await fetch(`/api/projects/${developmentId}/models/${modelId}/apply`, { headers })
        const allowed: string[] = pre.ok ? ((await pre.json()).allowed ?? []) : []
        if (allowed.length) {
          const ap = await fetch(`/api/projects/${developmentId}/models/${modelId}/apply`, {
            method: 'POST', headers, body: JSON.stringify({ house_ids: [id], parts: allowed }),
          })
          const r = await ap.json().catch(() => ({}))
          const errors: string[] = r.results?.[0]?.errors ?? []
          if (!ap.ok || errors.length) {
            note = `The job was made, but the model was not fully applied${errors.length ? `: ${errors.join('; ')}` : ''}. Apply it again from the models panel.`
          }
        } else {
          note = 'The job was made with the model assigned, but you cannot add its parts. Somebody who can should press Apply on the models panel.'
        }
      }
      onDone(id, note)
    } catch {
      setErr('We could not tell whether that went through. Close this and check the list before trying again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Shell title="Add a job" sub={`In ${developmentName}`} onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>{saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Adding…</> : 'Add the job'}</Button>
      </>}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="dev-addr">Address (optional)</Label>
          <AddressAutocomplete id="dev-addr" value={address} onChange={setAddress} placeholder="e.g. 12 Oak Ln, Palm Coast, FL" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dev-name">Job name (optional)</Label>
          <Input id="dev-name" autoFocus={autoFocusOnDesktop()} value={name} onChange={e => setName(e.target.value)} placeholder="Leave blank to use the street address" />
          <p className="text-xs text-faint">Give it a name, an address, or both. The client and type come from the development.</p>
        </div>
        {models.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="dev-model">House model (optional)</Label>
            <Select id="dev-model" value={modelId} onChange={e => setModelId(e.target.value)}>
              <option value="">No model</option>
              {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
            {modelId && (
              <label className="flex items-center gap-2 text-sm text-ink-soft">
                <input type="checkbox" checked={apply} onChange={e => setApply(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                Apply its plans, budget, inspections and punch list now
              </label>
            )}
          </div>
        )}
        <LotDetailsFields value={lot} onChange={setLot} idPrefix="dev-lot" />
        {err && <p className="text-sm text-danger">{err}</p>}
      </div>
    </Shell>
  )
}

// ── Jobs you already have, moved into this development ──────────────────────
export function AddExistingDialog({ developmentId, developmentName, onClose, onDone }: {
  developmentId: string
  developmentName: string
  onClose: () => void
  onDone: (moved: number) => void
}) {
  const { rows, failed } = useCompanyProjects(true)
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const devName = useMemo(() => new Map((rows ?? []).filter(r => r.is_site).map(r => [r.id, r.name])), [rows])
  const choices = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (rows ?? [])
      .filter(r => !r.is_site && r.parent_project_id !== developmentId)
      .filter(r => !s || [r.name, r.address].some(v => (v ?? '').toLowerCase().includes(s)))
  }, [rows, q, developmentId])

  async function submit() {
    if (!picked.size) { setErr('Tick at least one job.'); return }
    setSaving(true); setErr('')
    try {
      const res = await fetch(`/api/projects/${developmentId}/children`, {
        method: 'POST', headers: await authHeaders(), body: JSON.stringify({ project_ids: Array.from(picked) }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error ?? 'Could not move those jobs.'); return }
      onDone(d.moved ?? 0)
    } catch {
      setErr('We could not tell whether that went through. Close this and check the list before trying again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Shell title="Add jobs you already have" sub={`Into ${developmentName}`} onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>{saving ? 'Moving…' : picked.size ? `Add ${picked.size} job${picked.size === 1 ? '' : 's'}` : 'Add jobs'}</Button>
      </>}>
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input className="pl-9" placeholder="Find a job…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        {failed ? <p className="text-sm text-danger">Could not load your jobs. Reload to try again.</p>
          : rows === null ? <p className="text-sm text-muted-fg">Loading…</p>
          : choices.length === 0 ? <p className="text-sm text-muted-fg">{q ? 'Nothing matches.' : 'Every job you have is already in this development.'}</p>
          : (
            <div className="divide-y divide-line-soft rounded-xl border border-line">
              {choices.map(r => (
                <label key={r.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-surface">
                  <input type="checkbox" className="h-4 w-4 shrink-0 accent-[var(--accent)]" checked={picked.has(r.id)}
                    onChange={e => setPicked(p => { const n = new Set(p); e.target.checked ? n.add(r.id) : n.delete(r.id); return n })} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{r.name}</span>
                    <span className="block truncate text-xs text-muted-fg">
                      {r.parent_project_id
                        ? `In ${devName.get(r.parent_project_id) ?? `another ${DEVELOPMENT_LOWER}`} - moves here`
                        : (r.address || 'On its own')}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        <p className="text-xs text-faint">Nothing on the jobs changes - their budgets, schedules and files go with them. A house model from another development comes off, because models belong to one development.</p>
        {err && <p className="text-sm text-danger">{err}</p>}
      </div>
    </Shell>
  )
}

// ── One job: to another development, or out on its own ──────────────────────
export function MoveJobDialog({ job, currentDevelopmentId, onClose, onDone }: {
  job: { id: string; name: string }
  /** Where it is now, or null for a job on its own. */
  currentDevelopmentId: string | null
  onClose: () => void
  onDone: (to: string | null) => void
}) {
  const { rows, failed } = useCompanyProjects(true)
  const [target, setTarget] = useState('')
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const developments = (rows ?? []).filter(r => r.is_site && r.id !== currentDevelopmentId)

  async function submit() {
    if (!target) { setErr('Pick where it goes.'); return }
    setSaving(true); setErr('')
    try {
      const headers = await authHeaders()
      let res: Response
      if (target === '__none') {
        res = await fetch(`/api/projects/${currentDevelopmentId}/children?project=${job.id}`, { method: 'DELETE', headers })
      } else if (target === '__new') {
        const problem = newDevelopmentProblem({ name: newName, projectIds: [job.id] })
        if (problem) { setErr(problem); return }
        res = await fetch('/api/projects/developments', { method: 'POST', headers, body: JSON.stringify({ name: newName.trim(), project_ids: [job.id] }) })
      } else {
        res = await fetch(`/api/projects/${target}/children`, { method: 'POST', headers, body: JSON.stringify({ project_ids: [job.id] }) })
      }
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error ?? 'Could not move it.'); return }
      onDone(target === '__none' ? null : target === '__new' ? d.development?.id ?? null : target)
    } catch {
      setErr('We could not tell whether that went through. Close this and check before trying again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Shell title={currentDevelopmentId ? 'Move to another development' : 'Put in a development'} sub={job.name} onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>{saving ? 'Moving…' : 'Move'}</Button>
      </>}>
      <div className="space-y-4">
        {failed ? <p className="text-sm text-danger">Could not load your developments. Reload to try again.</p> : (
          <div className="space-y-1.5">
            <Label htmlFor="move-to">Move to *</Label>
            <Select id="move-to" value={target} onChange={e => { setTarget(e.target.value); setErr('') }}>
              <option value="">-- Select --</option>
              {developments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              <option value="__new">A new development…</option>
              {currentDevelopmentId && <option value="__none">No development - a job on its own</option>}
            </Select>
          </div>
        )}
        {target === '__new' && (
          <div className="space-y-1.5">
            <Label htmlFor="move-new">New development name *</Label>
            <Input id="move-new" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Palm Coast lots" />
          </div>
        )}
        <p className="text-xs text-faint">The job keeps everything on it. A house model comes off, because a model belongs to one development.</p>
        {err && <p className="text-sm text-danger">{err}</p>}
      </div>
    </Shell>
  )
}

// ── A new development from jobs you already have (inside Bulk Add) ──────────
export function GroupExistingForm({ onCancel, onDone }: {
  onCancel: () => void
  onDone: (developmentId: string) => void
}) {
  const { rows, failed } = useCompanyProjects(true)
  const [name, setName] = useState('')
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const devName = useMemo(() => new Map((rows ?? []).filter(r => r.is_site).map(r => [r.id, r.name])), [rows])
  const choices = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (rows ?? [])
      .filter(r => !r.is_site)
      .filter(r => !s || [r.name, r.address].some(v => (v ?? '').toLowerCase().includes(s)))
  }, [rows, q])

  async function submit() {
    const problem = newDevelopmentProblem({ name, projectIds: Array.from(picked) })
    if (problem) { setErr(problem); return }
    setSaving(true); setErr('')
    try {
      const res = await fetch('/api/projects/developments', {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({ name: name.trim(), project_ids: Array.from(picked) }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error ?? 'Could not create the development.'); return }
      onDone(d.development.id)
    } catch {
      setErr('We could not tell whether that went through. Check your Projects list before trying again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="grp-name">Development name *</Label>
        <Input id="grp-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Palm Coast lots" />
      </div>
      <div className="space-y-1.5">
        <Label>Jobs to put in it *</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input className="pl-9" placeholder="Find a job…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>
      {failed ? <p className="text-sm text-danger">Could not load your jobs. Reload to try again.</p>
        : rows === null ? <p className="text-sm text-muted-fg">Loading…</p>
        : choices.length === 0 ? <p className="text-sm text-muted-fg">{q ? 'Nothing matches.' : 'No jobs yet.'}</p>
        : (
          <div className="max-h-72 divide-y divide-line-soft overflow-y-auto rounded-xl border border-line">
            {choices.map(r => (
              <label key={r.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-surface">
                <input type="checkbox" className="h-4 w-4 shrink-0 accent-[var(--accent)]" checked={picked.has(r.id)}
                  onChange={e => setPicked(p => { const n = new Set(p); e.target.checked ? n.add(r.id) : n.delete(r.id); return n })} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{r.name}</span>
                  <span className="block truncate text-xs text-muted-fg">
                    {r.parent_project_id ? `In ${devName.get(r.parent_project_id) ?? `another ${DEVELOPMENT_LOWER}`} - moves to the new one` : (r.address || 'On its own')}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
      <p className="text-xs text-faint">Nothing on the jobs changes, and a development does not count toward your plan&apos;s active projects.</p>
      {err && <p className="text-sm text-danger">{err}</p>}
      <div className="row-even lg:flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="button" onClick={submit} disabled={saving}>
          {saving ? 'Creating…' : picked.size ? `Create with ${picked.size} job${picked.size === 1 ? '' : 's'}` : 'Create development'}
        </Button>
      </div>
    </div>
  )
}
