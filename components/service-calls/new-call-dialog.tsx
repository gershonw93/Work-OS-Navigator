'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AddressAutocomplete } from '@/components/ui/address-autocomplete'
import { autoFocusOnDesktop } from '@/lib/auto-focus'
import { callProblem, CALL_PRIORITIES, PRIORITY_LABEL } from '@/lib/service-calls'
import { callFetch, fromLocalInput } from '@/lib/service-calls-client'
import { fetchProblem } from '@/lib/fetch-error'

// Take a call. Every label is marked (* or optional), the problem is answered
// by the SAME `callProblem` the route asks, and the button is disabled only
// while it is in flight - a greyed-out button explains nothing.

type Crew = { id: string; name: string }

export function NewCallDialog({ crew, onClose, onCreated, initial }: {
  crew: Crew[]
  onClose: () => void
  onCreated: (id: string, warning: string | null) => void
  /** From a click on the dispatch board: who and when, as datetime-local values. */
  initial?: { assigned_to?: string; start?: string; end?: string }
}) {
  const [f, setF] = useState({
    customer_name: '', site_address: '', contact_name: '', contact_phone: '', contact_email: '',
    issue: '', priority: 'normal', assigned_to: initial?.assigned_to ?? '', start: initial?.start ?? '', end: initial?.end ?? '', notes: '',
  })
  // The contractor jobs this company is awarded on - the only jobs a call can
  // be tied to (the route checks the same thing). A failed read just leaves
  // the picker empty: a call does not need a job.
  const [jobs, setJobs] = useState<{ id: string; name: string }[]>([])
  const [gcJob, setGcJob] = useState('')
  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const res = await callFetch('/api/my-jobs')
        if (!res.ok) return
        const json = await res.json()
        const seen = new Map<string, string>()
        for (const s of (json.awarded ?? []) as any[]) if (s.projects?.id) seen.set(s.projects.id, s.projects.name ?? 'Job')
        if (live) setJobs(Array.from(seen, ([id, name]) => ({ id, name })))
      } catch { /* optional */ }
    })()
    return () => { live = false }
  }, [])
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState('')
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(p => ({ ...p, [k]: e.target.value }))

  async function save() {
    const body = {
      customer_name: f.customer_name, site_address: f.site_address,
      contact_name: f.contact_name || null, contact_phone: f.contact_phone || null, contact_email: f.contact_email || null,
      issue: f.issue, priority: f.priority, notes: f.notes || null,
      assigned_to: f.assigned_to || null,
      gc_project_id: gcJob || null, source: gcJob ? 'gc_job' : 'direct',
      scheduled_start: fromLocalInput(f.start), scheduled_end: fromLocalInput(f.end),
    }
    const local = callProblem({ ...body, status: body.assigned_to && body.scheduled_start ? 'scheduled' : 'new' })
    if (local) { setProblem(local); return }
    setSaving(true)
    setProblem('')
    try {
      const res = await callFetch('/api/service-calls', { method: 'POST', body: JSON.stringify(body) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setProblem(json.error ?? 'Could not save the call. Try again.'); return }
      onCreated(json.call.id, json.unmapped ?? null)
    } catch (e) {
      setProblem(fetchProblem(e, 'saving the call'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="overlay items-center justify-center bg-black/50" data-overlay onClick={onClose}>
      <div className="bg-panel rounded-2xl border border-line w-full max-w-full sm:max-w-lg flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line-soft flex items-center justify-between gap-3">
          <h2 className="font-semibold text-ink">New service call</h2>
          <button type="button" onClick={onClose} aria-label="Close" title="Close" className="text-faint hover:text-ink p-1"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-6 py-4 space-y-4 overflow-y-auto">
          <div className="space-y-1.5">
            <Label htmlFor="sc-customer">Customer *</Label>
            <Input id="sc-customer" value={f.customer_name} onChange={set('customer_name')} autoFocus={autoFocusOnDesktop()} placeholder="Dana Whitfield" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sc-address">Site address *</Label>
            {/* The same live search a project's address uses. The route still
                places the address itself (lookUpAddress) - a picked
                suggestion is just a spelling it can place. */}
            <AddressAutocomplete id="sc-address" value={f.site_address}
              onChange={v => setF(p => ({ ...p, site_address: v }))}
              onPick={s => setF(p => ({ ...p, site_address: s.label }))}
              placeholder="Start typing an address" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sc-issue">What is the problem? *</Label>
            <textarea id="sc-issue" value={f.issue} onChange={set('issue')} rows={3}
              className="w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink" placeholder="No cooling upstairs since this morning" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sc-contact">Contact name (optional)</Label>
              <Input id="sc-contact" value={f.contact_name} onChange={set('contact_name')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sc-phone">Contact phone (optional)</Label>
              <Input id="sc-phone" type="tel" value={f.contact_phone} onChange={set('contact_phone')} />
            </div>
          </div>
          {jobs.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="sc-job">For a contractor job (optional)</Label>
              <select id="sc-job" value={gcJob} onChange={e => setGcJob(e.target.value)}
                className="h-11 lg:h-9 w-full rounded-md border border-line bg-panel px-3 text-sm text-ink">
                <option value="">-- My own customer --</option>
                {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
              </select>
              <p className="text-xs text-muted-fg">The contractor sees that the call exists and where it stands - never your notes, photos or customer details.</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="sc-priority">Priority *</Label>
            <select id="sc-priority" value={f.priority} onChange={set('priority')}
              className="h-11 lg:h-9 w-full rounded-md border border-line bg-panel px-3 text-sm text-ink">
              {CALL_PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </select>
          </div>
          <div className="rounded-lg border border-line-soft p-3 space-y-3">
            <p className="text-sm text-muted-fg">Put somebody on it now, or leave it for the dispatch board.</p>
            <div className="space-y-1.5">
              <Label htmlFor="sc-crew">Crew member (optional)</Label>
              <select id="sc-crew" value={f.assigned_to} onChange={set('assigned_to')}
                className="h-11 lg:h-9 w-full rounded-md border border-line bg-panel px-3 text-sm text-ink">
                <option value="">-- Not yet --</option>
                {crew.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sc-start">Starts (optional)</Label>
                <Input id="sc-start" type="datetime-local" value={f.start} onChange={set('start')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sc-end">Finishes (optional)</Label>
                <Input id="sc-end" type="datetime-local" value={f.end} onChange={set('end')} />
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sc-notes">Notes (optional)</Label>
            <textarea id="sc-notes" value={f.notes} onChange={set('notes')} rows={2}
              className="w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink" />
          </div>
          {problem && <p className="text-sm text-danger">{problem}</p>}
        </div>
        <div className="px-6 py-4 border-t border-line-soft row-even lg:flex lg:justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save call'}</Button>
        </div>
      </div>
    </div>
  )
}
