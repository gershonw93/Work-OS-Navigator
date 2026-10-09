'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RowMenu, MenuItem } from '@/components/ui/row-menu'
import { cn } from '@/lib/utils'
import { dayWords } from '@/lib/dates'
import {
  requiredStatuses, requiredSummary, missingTypes, typeNameProblem, cleanTypeName,
  REQUIRED_STATE_LABEL, type RequiredRow, type InspectionLike, type RequiredState,
} from '@/lib/inspection-types'
import { ListChecks, Plus, X, Lightbulb } from 'lucide-react'

const TONE: Record<RequiredState, string> = {
  not_requested: 'text-muted-fg',
  to_book: 'text-warn',
  booked: 'text-info',
  reinspection: 'text-warn',
  failed: 'text-danger',
  passed: 'text-success',
}

type LoadState = 'loading' | 'ready' | 'failed'

/**
 * The inspections this job will need, decided up front, each with where it
 * stands - read off the inspection rows the page already holds, so the list
 * cannot claim "Booked" while the card below says "Requested".
 *
 * "Request" opens the page's ordinary request form with the type filled in.
 * Nothing here books, requests or notifies anybody by itself.
 */
export function RequiredInspections({
  projectId, inspections, getToken, onRequest,
}: {
  projectId: string
  inspections: InspectionLike[]
  getToken: () => Promise<string>
  onRequest: (type: string) => void
}) {
  const [state, setState] = useState<LoadState>('loading')
  const [required, setRequired] = useState<RequiredRow[]>([])
  const [options, setOptions] = useState<string[]>([])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // The page hands a fresh getToken every render; reading it through a ref
  // keeps `load` stable, or the effect below would refetch on every render.
  const tokenRef = useRef(getToken)
  tokenRef.current = getToken
  const token = () => tokenRef.current()

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/required-inspections`, {
        headers: { Authorization: `Bearer ${await tokenRef.current()}` },
      })
      if (!res.ok) { setState('failed'); return }
      const d = await res.json()
      setRequired(d.required ?? [])
      setOptions(d.options ?? [])
      setSuggestions(d.suggestions ?? [])
      setState('ready')
    } catch {
      setState('failed')
    }
  }, [projectId])

  useEffect(() => { load() }, [load])

  async function add(types: string[]) {
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/required-inspections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ types }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error ?? 'Could not save the list.'); return false }
      await load()
      return true
    } catch {
      setError('We could not reach the server, so we do not know whether that saved. Reload before trying again.')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function remove(row: RequiredRow) {
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/required-inspections?rid=${row.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${await token()}` },
      })
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? 'Could not remove it.'); return }
      await load()
    } catch {
      setError('We could not reach the server. Reload and check before trying again.')
    }
  }

  const rows = requiredStatuses(required, inspections)
  const sum = requiredSummary(rows)

  return (
    <div className="rounded-2xl border border-line bg-panel lg:rounded-xl">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <ListChecks className="h-4 w-4 shrink-0 text-muted-fg" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-ink">Required for this job</h2>
            {state === 'ready' && sum.total > 0 && (
              <p className="text-xs text-muted-fg">
                {sum.passed} of {sum.total} passed{sum.notRequested ? ` · ${sum.notRequested} not requested yet` : ''}
              </p>
            )}
          </div>
        </div>
        {state === 'ready' && (
          <Button variant="secondary" size="sm" onClick={() => setPicking(true)}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        )}
      </div>

      {error && <p role="alert" className="mx-4 mb-3 rounded-lg bg-danger-tint px-3 py-2 text-sm text-danger">{error}</p>}

      {state === 'loading' && <p className="px-4 pb-4 text-sm text-faint">Loading the list…</p>}
      {state === 'failed' && (
        <p className="px-4 pb-4 text-sm text-danger">
          Could not load the required inspections. That does not mean there are none - reload to try again.
        </p>
      )}

      {state === 'ready' && suggestions.length > 0 && (
        <div className="mx-4 mb-3 flex flex-col gap-2 rounded-lg border border-line-soft bg-surface px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm text-ink-soft">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <span>
              This lot has {[
                suggestions.some(t => /septic/i.test(t)) ? 'no city sewer' : null,
                suggestions.some(t => /well/i.test(t)) ? 'no city water' : null,
              ].filter(Boolean).join(' and ')}. Add {suggestions.join(', ')}?
            </span>
          </p>
          <Button size="sm" onClick={() => add(suggestions)} disabled={saving}>Add {suggestions.length === 1 ? 'it' : 'them'}</Button>
        </div>
      )}

      {state === 'ready' && rows.length === 0 && (
        <p className="px-4 pb-4 text-sm text-muted-fg">
          Nothing listed yet. Add the inspections this job will need, and each one shows here until it passes - so
          nothing is forgotten until the day somebody asks for the CO.
        </p>
      )}

      {state === 'ready' && rows.length > 0 && (
        <div className="divide-y divide-line-soft border-t border-line-soft">
          {rows.map(r => (
            <div key={r.required.id} className="flex min-h-[52px] items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{r.required.type}</p>
                <p className={cn('text-xs', TONE[r.state])}>
                  {REQUIRED_STATE_LABEL[r.state]}
                  {r.date ? ` · ${r.state === 'booked' ? '' : 'needed by '}${dayWords(r.date) ?? r.date}` : ''}
                </p>
              </div>
              {r.state === 'not_requested' && (
                <Button size="sm" variant="secondary" onClick={() => onRequest(r.required.type)}>Request</Button>
              )}
              <RowMenu label={`More for ${r.required.type}`}>
                {close => (
                  <>
                    {r.state !== 'not_requested' && (
                      <MenuItem onClick={() => { close(); onRequest(r.required.type) }}>Request another visit</MenuItem>
                    )}
                    <MenuItem danger onClick={() => { close(); remove(r.required) }}>Remove from the list</MenuItem>
                  </>
                )}
              </RowMenu>
            </div>
          ))}
        </div>
      )}

      {picking && (
        <PickDialog
          options={options}
          have={required}
          saving={saving}
          onCancel={() => setPicking(false)}
          onSave={async types => { if (await add(types)) setPicking(false) }}
        />
      )}
    </div>
  )
}

/** Tick the inspections this job needs; type one that is not on the list. */
function PickDialog({
  options, have, saving, onCancel, onSave,
}: {
  options: string[]
  have: RequiredRow[]
  saving: boolean
  onCancel: () => void
  onSave: (types: string[]) => void
}) {
  const [extra, setExtra] = useState<string[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [typed, setTyped] = useState('')
  const [typedError, setTypedError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const offered = missingTypes([...options, ...extra], have)
  const toggle = (t: string) => setChecked(prev => {
    const next = new Set(prev)
    if (next.has(t)) next.delete(t); else next.add(t)
    return next
  })

  function addTyped() {
    const problem = typeNameProblem(typed)
    if (problem) { setTypedError(problem); return }
    const name = cleanTypeName(typed)!
    // Already offered (or already on the job)? Tick it rather than add a twin.
    const existing = [...options, ...extra, ...have.map(h => h.type)].find(o => o.toLowerCase() === name.toLowerCase())
    if (existing && have.some(h => h.type.toLowerCase() === name.toLowerCase())) {
      setTypedError(`${existing} is already on this job's list.`); return
    }
    if (!existing) setExtra(prev => [...prev, name])
    setChecked(prev => new Set(prev).add(existing ?? name))
    setTyped(''); setTypedError(null)
  }

  function save() {
    if (!checked.size) { setFormError('Tick at least one inspection, or add one by name.'); return }
    onSave(offered.filter(o => checked.has(o)))
  }

  return (
    <div className="overlay items-center justify-center bg-black/50" data-overlay onClick={() => !saving && onCancel()}>
      <div className="flex w-full max-w-lg flex-col rounded-xl bg-panel shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line-soft px-5 py-4">
          <h2 className="text-base font-semibold text-ink">Required inspections</h2>
          <button onClick={onCancel} aria-label="Close" title="Close" className="text-faint hover:text-ink"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <p className="text-sm text-muted-fg">
            Tick what this job will need. Adding one does not request it or tell anybody - it sits on the list
            until somebody presses Request.
          </p>
          {offered.length === 0 ? (
            <p className="text-sm text-faint">Every type on the list is already on this job. Add another by name below.</p>
          ) : (
            <div className="divide-y divide-line-soft rounded-lg border border-line">
              {offered.map(t => (
                <label key={t} className="flex min-h-[44px] cursor-pointer items-center gap-3 px-3 py-2 text-sm text-ink">
                  <input type="checkbox" checked={checked.has(t)} onChange={() => toggle(t)} className="h-4 w-4 accent-[#C9F24A]" />
                  {t}
                </label>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="req-insp-other">Another type <span className="text-faint font-normal">(optional)</span></Label>
            <div className="flex gap-2">
              <Input id="req-insp-other" value={typed} className="min-w-0 flex-1"
                onChange={e => { setTyped(e.target.value); setTypedError(null) }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTyped() } }}
                placeholder="e.g. Pool Bonding" />
              <Button type="button" variant="secondary" onClick={addTyped}>Add</Button>
            </div>
            {typedError
              ? <p className="text-xs text-danger">{typedError}</p>
              : <p className="text-xs text-faint">Saved to your company&apos;s list, so it is there for the next job.</p>}
          </div>
          {formError && <p className="text-sm text-danger">{formError}</p>}
        </div>
        <div className="row-even lg:flex justify-end gap-2 border-t border-line-soft px-5 py-3">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : checked.size ? `Add ${checked.size}` : 'Add'}
          </Button>
        </div>
      </div>
    </div>
  )
}
