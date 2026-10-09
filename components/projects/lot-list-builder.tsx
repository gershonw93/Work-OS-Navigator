'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { ACCEPT_SCAN } from '@/lib/file-accept'
import { fetchProblem } from '@/lib/fetch-error'
import { fullAddress, lotRowProblem, lotJobName, MAX_LOTS, type LotRow } from '@/lib/lot-list'
import { lotFacts } from '@/lib/lot-details'
import { CheckCircle2, AlertTriangle, XCircle, Loader2, Upload, Trash2, Plus, MapPin } from 'lucide-react'

/** What the map said about one row. `null` is "not checked yet". */
type Located =
  | { ok: true; lat: number; lng: number; matched: string | null; precision: 'exact' | 'approximate' | 'unknown' }
  | { ok: false; why: string }

interface Row extends LotRow { key: number; located: Located | null }

let nextKey = 1
const keyed = (r: LotRow): Row => ({ ...r, key: nextKey++, located: null })

/**
 * Bulk Add from a list of real addresses.
 *
 * Read the list, SHOW every row with where the map put it, let the person fix
 * or drop rows, and only then create. Nothing is created from a scan nobody
 * has looked at - the reader is allowed to be unsure, and the map is allowed to
 * find only the street, and both have to be visible before forty jobs exist.
 */
export function LotListBuilder({
  token, shared, onCancel, onSuccess,
}: {
  token: string
  /** Client, type, start date and customer, from the dialog around this. */
  shared: Record<string, unknown>
  onCancel: () => void
  onSuccess: (result: { count: number; located: number; siteId?: string | null }) => void
}) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [pasted, setPasted] = useState('')
  const [areaCity, setAreaCity] = useState('')
  const [areaState, setAreaState] = useState('')
  const [reading, setReading] = useState(false)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [source, setSource] = useState<'sheet' | 'scan' | 'text' | null>(null)
  const [groupName, setGroupName] = useState('')
  const [prefix, setPrefix] = useState('')
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function read() {
    setError(null)
    if (!file && !pasted.trim()) { setError('Choose a file, or paste the addresses one per line.'); return }
    setReading(true)
    try {
      const form = new FormData()
      if (file) form.append('file', file); else form.append('text', pasted)
      if (areaCity.trim()) form.append('city', areaCity.trim())
      if (areaState.trim()) form.append('state', areaState.trim())
      const res = await fetch('/api/projects/bulk/scan', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error ?? 'Could not read that list.'); return }
      const got = (d.rows ?? []).map(keyed)
      setRows(got)
      setSource(d.source ?? null)
      setGroupName(d.place ? `${d.place} lots` : (d.suggested_name ?? ''))
      await locate(got)
    } catch (e) {
      setError(fetchProblem(e, 'reading that list'))
    } finally {
      setReading(false)
    }
  }

  /** Look up every row not yet checked (or all of them), and record what came back. */
  async function locate(list: Row[], onlyUnchecked = false) {
    const todo = list.filter(r => !lotRowProblem(r) && (!onlyUnchecked || !r.located))
    if (!todo.length) return
    setChecking(true)
    try {
      const res = await fetch('/api/projects/bulk/locate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ addresses: todo.map(fullAddress) }),
      })
      if (!res.ok) { setError('Could not check the addresses on the map. You can still create the jobs - unplaced ones say so on the job.'); return }
      const { results } = await res.json()
      const byKey = new Map(todo.map((r, i) => [r.key, results[i] as Located]))
      setRows(prev => (prev ?? list).map(r => (byKey.has(r.key) ? { ...r, located: byKey.get(r.key) ?? null } : r)))
    } catch (e) {
      setError(fetchProblem(e, 'checking the addresses on the map'))
    } finally {
      setChecking(false)
    }
  }

  function edit(key: number, patch: Partial<LotRow>) {
    // An edited address has not been checked - its old pin belongs to the old words.
    setRows(prev => (prev ?? []).map(r => (r.key === key ? { ...r, ...patch, located: null } : r)))
  }

  async function create() {
    if (!rows) return
    setError(null)
    if (!rows.length) { setError('There are no rows left to create.'); return }
    if (rows.length > MAX_LOTS) { setError(`That is ${rows.length} lots - the most at once is ${MAX_LOTS}. Remove some, or split the list.`); return }
    const bad = rows.findIndex(r => lotRowProblem(r))
    if (bad >= 0) { setError(`Row ${bad + 1}: ${lotRowProblem(rows[bad])} Fix it or remove the row.`); return }
    if (!groupName.trim()) { setError('Give the group a name - it is the one row these jobs sit under on the Projects list.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/projects/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...shared,
          mode: 'list',
          site_name: groupName.trim(),
          name_prefix: prefix.trim() || null,
          rows: rows.map(({ key: _k, located, unsure: _u, ...r }) => ({
            ...r,
            // Only a pin on the HOUSE travels. A street-centre match is left for
            // the job to say "not placed" about rather than stored as a lot.
            ...(located?.ok && located.precision !== 'approximate' ? { lat: located.lat, lng: located.lng } : {}),
          })),
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error ?? 'Could not create the jobs.'); return }
      onSuccess({ count: d.count ?? 0, located: d.located ?? 0, siteId: d.site?.id ?? null })
    } catch (e) {
      // We do not know whether they were made - say so rather than inviting a
      // second press that makes forty more.
      setError(fetchProblem(e, 'creating the jobs'))
    } finally {
      setSaving(false)
    }
  }

  // ── step one: the list ─────────────────────────────────────────────────────
  if (!rows) {
    return (
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Lot list *</Label>
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex w-full items-center gap-3 rounded-lg border-2 border-dashed border-line px-4 py-4 text-left hover:bg-surface">
            <Upload className="h-5 w-5 shrink-0 text-muted-fg" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-ink">{file ? file.name : 'Choose a file'}</span>
              <span className="block text-xs text-muted-fg">
                A spreadsheet (.xlsx, .csv) is read by its column headings. A PDF or a photo is read by AI and uses one scan.
              </span>
            </span>
          </button>
          <input ref={fileRef} type="file" className="hidden"
            accept={`${ACCEPT_SCAN},.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv`}
            onChange={e => { setFile(e.target.files?.[0] ?? null); setError(null) }} />
        </div>
        {!file && (
          <div className="space-y-1.5">
            <Label htmlFor="lot-paste">Or paste addresses <span className="text-faint font-normal">(optional)</span></Label>
            <textarea id="lot-paste" rows={5} value={pasted} onChange={e => setPasted(e.target.value)}
              placeholder={'89 White Hall Dr\n34 Wheeling Ln\n13 Princess Luise Ln'}
              className="flex w-full rounded-md border border-muted2 bg-panel px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent" />
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="lot-city">City <span className="text-faint font-normal">(optional)</span></Label>
            <Input id="lot-city" value={areaCity} onChange={e => setAreaCity(e.target.value)} placeholder="e.g. Palm Coast" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lot-state">State <span className="text-faint font-normal">(optional)</span></Label>
            <Input id="lot-state" value={areaState} onChange={e => setAreaState(e.target.value)} placeholder="e.g. FL" />
          </div>
        </div>
        <p className="text-xs text-faint">
          For rows that do not say where they are. A list grouped under headings (&ldquo;Palm Coast | Flagler&rdquo;) carries
          each heading onto its rows by itself.
        </p>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="row-even lg:flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={reading}>Cancel</Button>
          <Button type="button" onClick={read} disabled={reading}>
            {reading ? <><Loader2 className="h-4 w-4 animate-spin" /> Reading…</> : 'Read the list'}
          </Button>
        </div>
      </div>
    )
  }

  // ── step two: check every row ──────────────────────────────────────────────
  const exact = rows.filter(r => r.located?.ok && r.located.precision !== 'approximate').length
  const approx = rows.filter(r => r.located?.ok && r.located.precision === 'approximate').length
  const missed = rows.filter(r => r.located && !r.located.ok).length
  const blocked = rows.filter(r => lotRowProblem(r)).length
  const dupes = new Set(rows.map(r => fullAddress(r).toLowerCase()).filter((a, i, all) => all.indexOf(a) !== i))

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink-soft">
        <p className="font-semibold text-ink">
          {rows.length} {rows.length === 1 ? 'lot' : 'lots'} found
          {source === 'scan' ? ' - read by AI, so check each row' : source === 'sheet' ? ' - read from the spreadsheet' : ''}
        </p>
        <p className="mt-0.5 text-xs text-muted-fg">
          {checking ? 'Checking each address on the map…' : (
            <>
              {exact} placed on the map
              {approx ? ` · ${approx} found only the street` : ''}
              {missed ? ` · ${missed} not found` : ''}
              {blocked ? ` · ${blocked} need fixing` : ''}
            </>
          )}
        </p>
        {!checking && (approx > 0 || missed > 0) && (
          <p className="mt-1 text-xs text-muted-fg">
            Rows the map could not place exactly are still created - the job says it has no pin, and you can set it later.
            A misspelled street is the usual reason; fix it here and it is checked again.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="lot-group">Group name *</Label>
          <Input id="lot-group" value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="e.g. Palm Coast lots" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lot-prefix">Name each job with <span className="text-faint font-normal">(optional)</span></Label>
          <Input id="lot-prefix" value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="e.g. Mendy" />
        </div>
      </div>
      <p className="-mt-2 text-xs text-faint">Each job is named after its address{prefix.trim() ? `, e.g. "${lotJobName(rows[0], prefix)}"` : ` - e.g. "${lotJobName(rows[0])}"`}.</p>

      <div className="divide-y divide-line-soft rounded-lg border border-line">
        {rows.map((r, i) => {
          const problem = lotRowProblem(r)
          const facts = lotFacts(r).filter(f => f.label !== 'Lot').map(f => f.value)
          const dup = dupes.has(fullAddress(r).toLowerCase())
          return (
            <div key={r.key} className="space-y-2 px-3 py-3">
              <div className="flex items-start gap-2">
                <span className="mt-2.5 w-6 shrink-0 text-right text-xs text-faint">{i + 1}</span>
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-[2fr_1.3fr_0.6fr_0.8fr]">
                  <Input aria-label={`Row ${i + 1} street`} value={r.street} onChange={e => edit(r.key, { street: e.target.value })} />
                  <Input aria-label={`Row ${i + 1} city`} value={r.city ?? ''} placeholder="City" onChange={e => edit(r.key, { city: e.target.value || null })} />
                  <Input aria-label={`Row ${i + 1} state`} value={r.state ?? ''} placeholder="ST" onChange={e => edit(r.key, { state: e.target.value || null })} />
                  <Input aria-label={`Row ${i + 1} ZIP`} value={r.zip ?? ''} placeholder="ZIP" onChange={e => edit(r.key, { zip: e.target.value || null })} />
                </div>
                <button type="button" onClick={() => setRows(prev => (prev ?? []).filter(x => x.key !== r.key))}
                  aria-label={`Remove row ${i + 1}`} title="Remove this row"
                  className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-faint hover:bg-surface hover:text-danger lg:h-9 lg:w-9">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-0.5 pl-8 text-xs">
                {(r.lot || r.block || facts.length > 0 || r.model) && (
                  <p className="text-muted-fg">
                    {[r.lot ? `Lot ${r.lot}` : null, r.block ? `Block ${r.block}` : null, ...facts, r.model ? `Model: ${r.model}` : null].filter(Boolean).join(' · ')}
                  </p>
                )}
                {!!r.unsure.length && (
                  <p className="text-warn">Not sure of: {r.unsure.join(', ').replace(/_/g, ' ')} - check against the file.</p>
                )}
                {dup && <p className="text-warn">This address is in the list twice.</p>}
                <LocatedLine problem={problem} located={r.located} checking={checking} />
              </div>
            </div>
          )
        })}
      </div>

      <div className="row-even lg:flex lg:flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm"
          onClick={() => setRows(prev => [...(prev ?? []), keyed({ street: '', city: rows[rows.length - 1]?.city ?? null, state: rows[rows.length - 1]?.state ?? null, zip: null, model: null, unsure: [] })])}>
          <Plus className="h-4 w-4" /> Add a row
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => locate(rows, true)} disabled={checking}>
          <MapPin className="h-4 w-4" /> Check changed rows
        </Button>
      </div>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="row-even lg:flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => { setRows(null); setError(null) }} disabled={saving}>Back</Button>
        <Button type="button" onClick={create} disabled={saving || checking}>
          {saving ? 'Creating…' : `Create ${rows.length} ${rows.length === 1 ? 'job' : 'jobs'}`}
        </Button>
      </div>
    </div>
  )
}

/** One row's map verdict, in words. */
function LocatedLine({ problem, located, checking }: { problem: string | null; located: Located | null; checking: boolean }) {
  if (problem) return <p className="flex items-start gap-1 text-danger"><XCircle className="mt-px h-3.5 w-3.5 shrink-0" />{problem}</p>
  if (!located) {
    return <p className={cn('flex items-center gap-1', checking ? 'text-faint' : 'text-muted-fg')}>
      {checking ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…</> : 'Not checked on the map yet.'}
    </p>
  }
  if (!located.ok) return <p className="flex items-start gap-1 text-danger"><XCircle className="mt-px h-3.5 w-3.5 shrink-0" />Not found - {located.why}.</p>
  if (located.precision === 'approximate') {
    return <p className="flex items-start gap-1 text-warn"><AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />Found only {located.matched ?? 'the area'}, not this house. It will be created without a pin.</p>
  }
  return <p className="flex items-start gap-1 text-success"><CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" />On the map{located.matched ? ` - ${located.matched}` : ''}</p>
}
