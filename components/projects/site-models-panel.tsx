'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { SearchableSelect, type SelectOption } from '@/components/ui/searchable-select'
import { RowMenu, MenuItem } from '@/components/ui/row-menu'
import { useDeleteGuard } from '@/components/ui/delete-guard'
import { InspectionTypeChips } from '@/components/inspections/type-chips'
import { cn } from '@/lib/utils'
import { fetchProblem } from '@/lib/fetch-error'
import { typeOptions } from '@/lib/inspection-types'
import { guessPlanType, baseName } from '@/lib/upload-plan'
import { ACCEPT_PLANS } from '@/lib/file-accept'
import {
  HANDINGS, HANDING_LABEL, APPLY_PARTS, PART_LABEL, applySummary, modelNameProblem,
  type Handing, type ApplyPart, type HouseApply,
} from '@/lib/site-models'
import { pickerValue, parsePickerValue, modelAssigneeProblem, type ModelAssignee } from '@/lib/model-assignee'
import type { AssignablePeople } from '@/lib/model-assignee-db'
import { Home, Plus, X, Upload, Loader2, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react'

export interface HouseRow { id: string; name: string; model_id?: string | null; garage_side?: string | null; lot?: string | null }

interface ModelRow {
  id: string
  name: string
  budget_template_id: string | null
  plans: { id: string; name: string; plan_type: string; handing: Handing }[]
  items: ({ id: string; kind: 'inspection' | 'punch'; title: string } & ModelAssignee)[]
}

type Dialog =
  | { kind: 'new' }
  | { kind: 'edit'; modelId: string }
  | { kind: 'assign'; modelId: string }
  | { kind: 'apply'; modelId: string }
  | null

async function token() {
  const { data: { session } } = await createClient().auth.getSession()
  return session?.access_token ?? ''
}
async function call(url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}`, ...(init.headers ?? {}) },
  })
  const d = await res.json().catch(() => ({}))
  return { ok: res.ok, data: d as any }
}

/**
 * The group's house models: "The Aspen", "The Birch". Each carries a budget
 * template, plan sets, required inspections and punch items, and is APPLIED to
 * the houses you pick - after a preview of what each house would get.
 */
export function SiteModelsPanel({ siteId, houses, onChanged }: {
  siteId: string
  houses: HouseRow[]
  /** Houses changed model - the Jobs list re-reads. */
  onChanged: () => void
}) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [models, setModels] = useState<ModelRow[]>([])
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([])
  // Null when the list could not be read - said in the editor, not shown as nobody.
  const [people, setPeople] = useState<AssignablePeople | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const guardDelete = useDeleteGuard()

  const load = useCallback(async () => {
    try {
      const r = await call(`/api/projects/${siteId}/models`)
      if (!r.ok) { setState('failed'); return }
      setModels(r.data.models ?? [])
      setTemplates(r.data.templates ?? [])
      setPeople(r.data.people ?? null)
      setState('ready')
    } catch { setState('failed') }
  }, [siteId])
  useEffect(() => { load() }, [load])

  const current = (id: string) => models.find(m => m.id === id) ?? null
  const housesOn = (id: string) => houses.filter(h => h.model_id === id).length
  const unassigned = houses.filter(h => !h.model_id).length

  function remove(m: ModelRow) {
    guardDelete(async () => {
      const r = await call(`/api/projects/${siteId}/models/${m.id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error(r.data.error ?? 'Could not delete the model.')
      await load(); onChanged()
    }, {
      title: `Delete ${m.name}?`,
      body: `Its plans, inspections and punch items come off the model. Anything already applied stays on each house, and the ${housesOn(m.id)} houses on it are left without a model.`,
      confirmLabel: 'Delete model',
    })
  }

  return (
    <div className="rounded-2xl border border-line bg-panel lg:rounded-xl">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-ink">House models</h2>
          <p className="text-xs text-muted-fg">
            Set up a model once - plans, budget, inspections, punch list - and apply it to the houses built to it.
            {state === 'ready' && models.length > 0 && unassigned > 0 ? ` ${unassigned} ${unassigned === 1 ? 'house has' : 'houses have'} no model yet.` : ''}
          </p>
        </div>
        {state === 'ready' && (
          <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: 'new' })}><Plus className="h-4 w-4" /> Model</Button>
        )}
      </div>
      {state === 'loading' && <p className="px-4 pb-4 text-sm text-faint">Loading models…</p>}
      {state === 'failed' && <p className="px-4 pb-4 text-sm text-danger">Could not load the models. That does not mean there are none - reload to try again.</p>}
      {state === 'ready' && models.length === 0 && (
        <p className="px-4 pb-4 text-sm text-muted-fg">No models yet. Add one for each house design, e.g. &ldquo;The Aspen&rdquo;.</p>
      )}
      {state === 'ready' && models.length > 0 && (
        <div className="divide-y divide-line-soft border-t border-line-soft">
          {models.map(m => {
            const insp = m.items.filter(i => i.kind === 'inspection').length
            const punch = m.items.filter(i => i.kind === 'punch').length
            const tpl = templates.find(t => t.id === m.budget_template_id)?.name
            return (
              <div key={m.id} className="flex flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-ink"><Home className="h-4 w-4 text-muted-fg" />{m.name}</p>
                  <p className="text-xs text-muted-fg">
                    {housesOn(m.id)} {housesOn(m.id) === 1 ? 'house' : 'houses'} · {m.plans.length} {m.plans.length === 1 ? 'plan' : 'plans'}
                    {' · '}{tpl ? `budget: ${tpl}` : 'no budget template'} · {insp} inspections · {punch} punch items
                  </p>
                </div>
                <div className="row-even lg:flex lg:flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: 'edit', modelId: m.id })}>Edit</Button>
                  <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: 'assign', modelId: m.id })}>Houses</Button>
                  <Button size="sm" onClick={() => setDialog({ kind: 'apply', modelId: m.id })}>Apply</Button>
                </div>
                <div className="hidden lg:block">
                  <RowMenu label={`More for ${m.name}`}>
                    {close => <MenuItem danger onClick={() => { close(); remove(m) }}>Delete model</MenuItem>}
                  </RowMenu>
                </div>
                <button type="button" onClick={() => remove(m)} className="text-left text-xs text-danger lg:hidden">Delete model</button>
              </div>
            )
          })}
        </div>
      )}

      {dialog?.kind === 'new' && (
        <NewModelDialog siteId={siteId} names={models.map(m => m.name)} onClose={() => setDialog(null)}
          onCreated={async id => { await load(); setDialog({ kind: 'edit', modelId: id }) }} />
      )}
      {dialog?.kind === 'edit' && current(dialog.modelId) && (
        <ModelEditor siteId={siteId} model={current(dialog.modelId)!} templates={templates} people={people}
          names={models.filter(m => m.id !== dialog.modelId).map(m => m.name)}
          onReload={load} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'assign' && current(dialog.modelId) && (
        <AssignDialog siteId={siteId} model={current(dialog.modelId)!} models={models} houses={houses}
          onClose={() => setDialog(null)} onSaved={() => { setDialog(null); onChanged() }} />
      )}
      {dialog?.kind === 'apply' && current(dialog.modelId) && (
        <ApplyDialog siteId={siteId} model={current(dialog.modelId)!} onClose={() => setDialog(null)} onApplied={onChanged} />
      )}
    </div>
  )
}

// ── shells ──────────────────────────────────────────────────────────────────

function Shell({ title, onClose, busy, children, footer, wide }: {
  title: string; onClose: () => void; busy?: boolean; children: React.ReactNode; footer: React.ReactNode; wide?: boolean
}) {
  return (
    <div className="overlay items-center justify-center bg-black/50" data-overlay onClick={() => !busy && onClose()}>
      <div className={cn('flex w-full flex-col rounded-xl bg-panel shadow-xl', wide ? 'max-w-2xl' : 'max-w-lg')} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-4">
          <h2 className="min-w-0 truncate text-base font-semibold text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Close" title="Close" className="text-faint hover:text-ink"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        <div className="row-even lg:flex justify-end gap-2 border-t border-line-soft px-5 py-3">{footer}</div>
      </div>
    </div>
  )
}

function NewModelDialog({ siteId, names, onClose, onCreated }: {
  siteId: string; names: string[]; onClose: () => void; onCreated: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  async function save() {
    const problem = modelNameProblem(name, names)
    if (problem) { setError(problem); return }
    setSaving(true); setError(null)
    try {
      const r = await call(`/api/projects/${siteId}/models`, { method: 'POST', body: JSON.stringify({ name }) })
      if (!r.ok) { setError(r.data.error ?? 'Could not save the model.'); return }
      onCreated(r.data.model.id)
    } catch (e) { setError(fetchProblem(e, 'saving the model')) } finally { setSaving(false) }
  }
  return (
    <Shell title="New house model" onClose={onClose} busy={saving}
      footer={<><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Add model'}</Button></>}>
      <div className="space-y-1.5">
        <Label htmlFor="model-name">Model name *</Label>
        <Input id="model-name" value={name} onChange={e => { setName(e.target.value); setError(null) }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save() } }} placeholder="e.g. The Aspen" />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </Shell>
  )
}

// ── the editor ──────────────────────────────────────────────────────────────

/**
 * Everything on a model. EACH CHANGE SAVES AS IT IS MADE and says so - this is
 * a library being stocked, not a form with a half that could be abandoned, and
 * there is no Save button to promise otherwise. Nothing here touches a house;
 * that is Apply's job, with its own preview.
 */
function ModelEditor({ siteId, model, templates, people, names, onReload, onClose }: {
  siteId: string; model: ModelRow; templates: { id: string; name: string }[]; people: AssignablePeople | null; names: string[]
  onReload: () => Promise<void>; onClose: () => void
}) {
  const base = `/api/projects/${siteId}/models/${model.id}`
  const [name, setName] = useState(model.name)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [handing, setHanding] = useState<Handing>('any')
  const [punchText, setPunchText] = useState('')
  const [pickTypes, setPickTypes] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement | null>(null)
  const budgetRef = useRef<HTMLInputElement | null>(null)
  // What the last budget upload read - said, because a sheet that imports at
  // zero looks exactly like one that worked until somebody opens a house.
  const [budgetNote, setBudgetNote] = useState<string | null>(null)
  const [choices, setChoices] = useState<string[]>(() => typeOptions())

  useEffect(() => {
    ;(async () => {
      const r = await call('/api/inspection-types').catch(() => null)
      if (r?.ok) setChoices(r.data.types ?? typeOptions())
    })()
  }, [])

  async function act(label: string, fn: () => Promise<{ ok: boolean; data: any }>) {
    setBusy(label); setError(null)
    try {
      const r = await fn()
      if (!r.ok) { setError(r.data.error ?? 'That did not save.'); return false }
      await onReload()
      return true
    } catch (e) { setError(fetchProblem(e, 'saving that')); return false } finally { setBusy(null) }
  }

  async function rename() {
    const problem = modelNameProblem(name, names)
    if (problem) { setError(problem); return }
    if (name.trim() === model.name) return
    await act('name', () => call(base, { method: 'PATCH', body: JSON.stringify({ name }) }))
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return
    setBusy('plan'); setError(null)
    const supabase = createClient()
    try {
      for (const f of Array.from(files)) {
        const sign = await call(`${base}/plans/upload-url`, { method: 'POST', body: JSON.stringify({ file_name: f.name }) })
        if (!sign.ok) { setError(sign.data.error ?? `Could not upload ${f.name}.`); break }
        const { error: up } = await supabase.storage.from(sign.data.bucket).uploadToSignedUrl(sign.data.path, sign.data.token, f, { contentType: f.type || undefined })
        if (up) { setError(`Could not upload ${f.name}: ${up.message}`); break }
        const saved = await call(`${base}/plans`, { method: 'POST', body: JSON.stringify({ storage_path: sign.data.path, name: baseName(f.name), plan_type: guessPlanType(f.name), handing }) })
        if (!saved.ok) { setError(saved.data.error ?? `Could not save ${f.name}.`); break }
      }
      await onReload()
    } catch (e) {
      setError(fetchProblem(e, 'uploading the plans'))
    } finally {
      setBusy(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  /**
   * A budget straight from a spreadsheet, in this dialog - "can I upload a
   * budget right here?". It was a trip to the Budget Templates page and back.
   *
   * THE SAME TWO STEPS that page takes, through the same routes: the importer
   * reads the sheet (`parseBudgetRows`, the one reader), and the result is
   * saved as a template - named after the model - which this model then
   * points at. A template, not a second place to keep a budget, so it shows on
   * the Budget Templates page and can be edited there like any other.
   */
  async function uploadBudget(file: File | null) {
    if (!file) return
    setBusy('budget'); setError(null); setBudgetNote(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const read = await fetch('/api/budget-templates/import', {
        method: 'POST', headers: { Authorization: `Bearer ${await token()}` }, body: form,
      })
      const d = await read.json().catch(() => ({}))
      if (!read.ok) { setError(d.error ?? 'Could not read that spreadsheet.'); return }
      const items: unknown[] = d.items ?? []
      if (!items.length) { setError('No budget lines were found in that sheet. Check it has a description column and an amount column.'); return }

      const tplName = `${model.name} budget`
      const made = await call('/api/budget-templates', { method: 'POST', body: JSON.stringify({ name: tplName, source: 'excel', items }) })
      if (!made.ok) { setError(made.data.error ?? 'Could not save the budget.'); return }
      const ok = await act('tpl', () => call(base, { method: 'PATCH', body: JSON.stringify({ budget_template_id: made.data.template.id }) }))
      if (!ok) return
      const amounts = Number(d.with_amounts ?? 0)
      setBudgetNote(
        `Read ${items.length} line${items.length === 1 ? '' : 's'} from ${file.name}` +
        (amounts === 0
          ? ' - but no amounts. Check the sheet has a number column, or fill the amounts in on the Budget Templates page.'
          : amounts < items.length ? `, ${amounts} with amounts.` : ', all with amounts.') +
        ` Saved as "${tplName}".`,
      )
    } catch (e) {
      setError(fetchProblem(e, 'uploading the budget'))
    } finally {
      setBusy(null)
      if (budgetRef.current) budgetRef.current.value = ''
    }
  }

  const inspections = model.items.filter(i => i.kind === 'inspection')
  const punch = model.items.filter(i => i.kind === 'punch')
  const offered = choices.filter(c => !inspections.some(i => i.title.toLowerCase() === c.toLowerCase()))

  return (
    <Shell title={`Model: ${model.name}`} onClose={onClose} busy={!!busy} wide
      footer={<Button onClick={onClose} disabled={!!busy}>Done</Button>}>
      <p className="rounded-lg bg-surface px-3 py-2 text-xs text-muted-fg">
        Changes here save as you make them, and change the MODEL only. Use Apply to put them on houses - you see what each
        house would get first.
      </p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <div className="space-y-1.5">
        <Label htmlFor="edit-model-name">Name *</Label>
        <div className="flex gap-2">
          <Input id="edit-model-name" className="min-w-0 flex-1" value={name} onChange={e => setName(e.target.value)}
            onBlur={rename} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); rename() } }} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-model-tpl">Budget template <span className="text-faint font-normal">(optional)</span></Label>
        <Select id="edit-model-tpl" value={model.budget_template_id ?? ''}
          onChange={e => act('tpl', () => call(base, { method: 'PATCH', body: JSON.stringify({ budget_template_id: e.target.value || null }) }))}>
          <option value="">-- No budget --</option>
          {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        {/* A LABEL WRAPPING AN sr-only INPUT, like every other upload here. */}
        <label className={cn('inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg border border-line px-3 text-sm font-medium text-ink-soft hover:bg-surface',
          busy && 'pointer-events-none opacity-60')}>
          {busy === 'budget' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy === 'budget' ? 'Reading the budget…' : 'Upload a budget (Excel or CSV)'}
          <input ref={budgetRef} type="file" className="sr-only"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            onChange={e => uploadBudget(e.target.files?.[0] ?? null)} />
        </label>
        {budgetNote && <p className="text-xs text-success">{budgetNote}</p>}
        <p className="text-xs text-faint">
          The per-house budget, amounts included. Upload a sheet here, or pick a template made on the Budget Templates
          page - from scratch, from an existing job, or from Excel.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Plans</Label>
        {model.plans.length > 0 && (
          <div className="divide-y divide-line-soft rounded-lg border border-line">
            {model.plans.map(p => (
              <div key={p.id} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{p.name}</p>
                  <p className="text-xs text-muted-fg">{HANDING_LABEL[p.handing]} · {p.plan_type}</p>
                </div>
                <button type="button" aria-label={`Remove ${p.name}`} title="Remove from the model"
                  onClick={() => act(`plan-${p.id}`, () => call(`${base}/plans?plan=${p.id}`, { method: 'DELETE' }))}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-faint hover:text-danger lg:h-8 lg:w-8">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex gap-1.5">
            {HANDINGS.map(h => (
              <button key={h} type="button" aria-pressed={handing === h} onClick={() => setHanding(h)}
                className={cn('min-h-[44px] whitespace-nowrap rounded-lg border px-3 text-xs lg:min-h-[36px]',
                  handing === h ? 'border-accent bg-accent-tint font-semibold text-accent-fg' : 'border-line text-ink-soft hover:bg-surface')}>
                {HANDING_LABEL[h]}
              </button>
            ))}
          </div>
          {/* A label over an sr-only input, the way every upload here works -
              see the note in lot-list-builder.tsx. */}
          <label className={cn('inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-line px-3 text-sm font-medium text-ink hover:bg-surface lg:min-h-[36px]',
            busy === 'plan' && 'pointer-events-none opacity-60')}>
            {busy === 'plan' ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</> : <><Upload className="h-4 w-4" /> Upload plans</>}
            <input ref={fileRef} type="file" multiple accept={ACCEPT_PLANS} className="sr-only" onChange={e => upload(e.target.files)} />
          </label>
        </div>
        <p className="text-xs text-faint">
          Pick the garage side first. A left or right set only goes on houses whose garage side is set to match - set it in
          each house&apos;s lot details.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Required inspections</Label>
        {inspections.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {inspections.map(i => (
              <span key={i.id} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-line bg-surface py-1 pl-3 pr-1 text-xs text-ink">
                {i.title}
                <button type="button" aria-label={`Remove ${i.title}`} title="Remove"
                  onClick={() => act(`i-${i.id}`, () => call(`${base}/items?item=${i.id}`, { method: 'DELETE' }))}
                  className="rounded-full p-1 text-faint hover:text-danger"><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}
        <InspectionTypeChips options={offered} value={pickTypes} onChange={setPickTypes} />
        <Button type="button" size="sm" variant="secondary" disabled={busy === 'insp'}
          onClick={async () => {
            if (!pickTypes.length) { setError('Tick the inspections to add first.'); return }
            if (await act('insp', () => call(`${base}/items`, { method: 'POST', body: JSON.stringify({ kind: 'inspection', titles: pickTypes }) }))) setPickTypes([])
          }}>Add {pickTypes.length || ''} inspections</Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="model-punch">Punch items</Label>
        {punch.length > 0 && (
          <div className="divide-y divide-line-soft rounded-lg border border-line">
            {punch.map(i => (
              <div key={i.id} className="flex flex-col gap-2 px-3 py-2 lg:flex-row lg:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <p className="min-w-0 flex-1 text-sm text-ink">{i.title}</p>
                  <button type="button" aria-label={`Remove ${i.title}`} title="Remove"
                    onClick={() => act(`p-${i.id}`, () => call(`${base}/items?item=${i.id}`, { method: 'DELETE' }))}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-faint hover:text-danger lg:order-last lg:h-8 lg:w-8"><Trash2 className="h-4 w-4" /></button>
                </div>
                <PunchAssignee item={i} people={people} busy={busy === `a-${i.id}`}
                  onSave={assignee => act(`a-${i.id}`, () => call(`${base}/items`, { method: 'PATCH', body: JSON.stringify({ item: i.id, assignee }) }))} />
              </div>
            ))}
          </div>
        )}
        <textarea id="model-punch" rows={3} value={punchText} onChange={e => setPunchText(e.target.value)}
          placeholder={'One per line, e.g.\nTouch up paint in garage\nInstall closet shelving'}
          className="flex w-full rounded-md border border-muted2 bg-panel px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent" />
        <Button type="button" size="sm" variant="secondary" disabled={busy === 'punch'}
          onClick={async () => {
            const titles = punchText.split(/\r?\n/).map(t => t.trim()).filter(Boolean)
            if (!titles.length) { setError('Write at least one punch item.'); return }
            if (await act('punch', () => call(`${base}/items`, { method: 'POST', body: JSON.stringify({ kind: 'punch', titles }) }))) setPunchText('')
          }}>Add punch items</Button>
        <p className="text-xs text-faint">Each becomes a task marked Punch on every house the model is applied to, assigned to whoever you pick beside it - a teammate, a sub, or any name. They are told once per apply, not once per house.</p>
        {people === null && <p className="text-xs text-warn">Could not load your team and subs, so only a typed name can be picked right now. Close and reopen to try again.</p>}
      </div>
    </Shell>
  )
}

// ── who a punch item goes to ────────────────────────────────────────────────

/**
 * "Who does it get assigned to?" - one dropdown per punch item: nobody yet,
 * a typed name, a teammate, or a sub from the Directory. A pick saves at once,
 * like everything else in this dialog; a typed name has its own Save because
 * a half-typed name is not an answer yet.
 */
function PunchAssignee({ item, people, busy, onSave }: {
  item: ModelAssignee & { title: string }
  people: AssignablePeople | null
  busy: boolean
  onSave: (assignee: unknown) => Promise<boolean>
}) {
  const saved = pickerValue(item)
  const [choice, setChoice] = useState(saved)
  const [typed, setTyped] = useState(saved === 'n' ? (item.assignee_name ?? '') : '')
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => { setChoice(saved) }, [saved])

  const options: SelectOption[] = [
    { value: '', label: 'Nobody yet' },
    { value: 'n', label: saved === 'n' ? `${item.assignee_name} (typed name)` : 'Type a name…' },
    ...(people?.teammates ?? []).map(t => ({ value: `p:${t.id}`, label: t.name, hint: `Teammate${t.role ? ` | ${t.role}` : ''}` })),
    ...(people?.companies ?? []).map(c => ({ value: `c:${c.id}`, label: c.name, hint: `Sub${c.trade ? ` | ${c.trade}` : ''}` })),
  ]
  // A pick whose person has since left the list still reads as who it was.
  if (saved.startsWith('p:') || saved.startsWith('c:')) {
    if (!options.some(o => o.value === saved)) options.push({ value: saved, label: item.assignee_name || 'Somebody no longer listed' })
  }

  async function save(input: unknown) {
    const p = modelAssigneeProblem(input)
    setProblem(p)
    if (p) return
    await onSave(input)
  }

  return (
    <div className="space-y-1.5 lg:w-72">
      <SearchableSelect sort={false} value={choice} disabled={busy} placeholder="Assign to…"
        onChange={e => {
          const v = e.target.value
          setChoice(v); setProblem(null)
          if (v !== 'n') save(parsePickerValue(v))
        }}
        options={options} />
      {choice === 'n' && (
        <div className="flex gap-2">
          <Input aria-label={`Who does ${item.title}`} placeholder="Any name, e.g. Touch-up crew" value={typed}
            onChange={e => setTyped(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(parsePickerValue('n', typed)) } }} />
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => save(parsePickerValue('n', typed))}>Save</Button>
        </div>
      )}
      {problem && <p className="text-xs text-danger">{problem}</p>}
    </div>
  )
}

// ── which houses are this model ─────────────────────────────────────────────

function AssignDialog({ siteId, model, models, houses, onClose, onSaved }: {
  siteId: string; model: ModelRow; models: ModelRow[]; houses: HouseRow[]; onClose: () => void; onSaved: () => void
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(houses.filter(h => h.model_id === model.id).map(h => h.id)))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameOf = (id: string | null | undefined) => models.find(m => m.id === id)?.name

  async function save() {
    setSaving(true); setError(null)
    try {
      const was = houses.filter(h => h.model_id === model.id).map(h => h.id)
      const add = Array.from(picked).filter(id => !was.includes(id))
      const drop = was.filter(id => !picked.has(id))
      if (add.length) {
        const r = await call(`/api/projects/${siteId}/house-models`, { method: 'PUT', body: JSON.stringify({ house_ids: add, model_id: model.id }) })
        if (!r.ok) { setError(r.data.error ?? 'Could not save.'); return }
      }
      if (drop.length) {
        const r = await call(`/api/projects/${siteId}/house-models`, { method: 'PUT', body: JSON.stringify({ house_ids: drop, model_id: null }) })
        if (!r.ok) { setError(r.data.error ?? 'Could not save.'); return }
      }
      onSaved()
    } catch (e) { setError(fetchProblem(e, 'saving the houses')) } finally { setSaving(false) }
  }

  return (
    <Shell title={`Houses built as ${model.name}`} onClose={onClose} busy={saving}
      footer={<><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? 'Saving…' : `Save ${picked.size} ${picked.size === 1 ? 'house' : 'houses'}`}</Button></>}>
      <p className="text-sm text-muted-fg">Tick the houses built to this model. This applies nothing by itself - Apply does, after showing you what each house gets.</p>
      <div className="divide-y divide-line-soft rounded-lg border border-line">
        {houses.map(h => {
          const other = h.model_id && h.model_id !== model.id ? nameOf(h.model_id) : null
          return (
            <label key={h.id} className="flex min-h-[44px] cursor-pointer items-center gap-3 px-3 py-2 text-sm text-ink">
              <input type="checkbox" className="h-4 w-4 accent-[#C9F24A]" checked={picked.has(h.id)}
                onChange={() => setPicked(prev => { const n = new Set(prev); if (n.has(h.id)) n.delete(h.id); else n.add(h.id); return n })} />
              <span className="min-w-0 flex-1 truncate">{h.name}</span>
              {other && <span className="whitespace-nowrap text-xs text-warn">now {other}</span>}
              {h.garage_side && <span className="whitespace-nowrap text-xs text-faint">garage {h.garage_side}</span>}
            </label>
          )
        })}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </Shell>
  )
}

// ── apply, after a preview ──────────────────────────────────────────────────

/**
 * "Ask and I'll select." The route works out what each house would get; this
 * shows it, ticked for the houses on this model that have something new, and
 * writes only what is ticked. Applying again adds only what is missing.
 */
function ApplyDialog({ siteId, model, onClose, onApplied }: {
  siteId: string; model: ModelRow; onClose: () => void; onApplied: () => void
}) {
  const url = `/api/projects/${siteId}/models/${model.id}/apply`
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [houses, setHouses] = useState<HouseApply[]>([])
  const [allowed, setAllowed] = useState<ApplyPart[]>([])
  const [parts, setParts] = useState<Set<ApplyPart>>(new Set())
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ houseName: string; added: Record<ApplyPart, number>; errors: string[] }[] | null>(null)
  const [showOthers, setShowOthers] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await call(url)
      if (!r.ok) { setState('failed'); setError(r.data.error ?? null); return }
      const hs: HouseApply[] = r.data.houses ?? []
      const al: ApplyPart[] = r.data.allowed ?? []
      setHouses(hs); setAllowed(al)
      setParts(prev => (prev.size ? prev : new Set(al)))
      setPicked(new Set(hs.filter(h => h.onModel && applySummary(h, al)).map(h => h.houseId)))
      setState('ready')
    } catch { setState('failed') }
  }, [url])
  useEffect(() => { load() }, [load])

  const partList = APPLY_PARTS.filter(p => parts.has(p))
  const visible = houses.filter(h => h.onModel || showOthers || picked.has(h.houseId))
  const others = houses.filter(h => !h.onModel).length

  async function apply() {
    setError(null)
    if (!partList.length) { setError('Tick at least one thing to apply.'); return }
    if (!picked.size) { setError('Tick at least one house.'); return }
    setSaving(true)
    try {
      const r = await call(url, { method: 'POST', body: JSON.stringify({ house_ids: Array.from(picked), parts: partList }) })
      if (!r.ok) { setError(r.data.error ?? 'Could not apply.'); return }
      setDone(r.data.results ?? [])
      onApplied()
    } catch (e) {
      // Not knowing is not failing. Applying again adds only what is missing,
      // so the safe next step is to reload and look.
      setError(fetchProblem(e, 'applying the model'))
    } finally { setSaving(false) }
  }

  if (done) {
    const total = (p: ApplyPart) => done.reduce((t, d) => t + d.added[p], 0)
    return (
      <Shell title={`${model.name} applied`} onClose={onClose}
        footer={<Button onClick={onClose}>Done</Button>}>
        <p className="text-sm text-ink">
          {APPLY_PARTS.filter(p => total(p) > 0).map(p => `${total(p)} ${PART_LABEL[p].toLowerCase()}`).join(', ') || 'Nothing new'}
          {' '}across {done.length} {done.length === 1 ? 'house' : 'houses'}.
        </p>
        {done.some(d => d.errors.length) && (
          <div className="space-y-1 rounded-lg border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger">
            {done.filter(d => d.errors.length).map(d => <p key={d.houseName}><span className="font-semibold">{d.houseName}:</span> {d.errors.join('; ')}</p>)}
            <p className="text-xs">Applying again adds only what is missing, so it is safe to retry.</p>
          </div>
        )}
      </Shell>
    )
  }

  return (
    <Shell title={`Apply ${model.name}`} onClose={onClose} busy={saving} wide
      footer={<><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={apply} disabled={saving || state !== 'ready'}>{saving ? 'Applying…' : `Apply to ${picked.size} ${picked.size === 1 ? 'house' : 'houses'}`}</Button></>}>
      {state === 'loading' && <p className="text-sm text-faint">Working out what each house would get…</p>}
      {state === 'failed' && <p className="text-sm text-danger">{error ?? 'Could not work out what applying would add. Reload and try again.'}</p>}
      {state === 'ready' && (
        <>
          <div className="space-y-1.5">
            <Label>Apply</Label>
            <div className="flex flex-wrap gap-1.5">
              {APPLY_PARTS.map(p => allowed.includes(p) ? (
                <button key={p} type="button" aria-pressed={parts.has(p)}
                  onClick={() => setParts(prev => { const n = new Set(prev); if (n.has(p)) n.delete(p); else n.add(p); return n })}
                  className={cn('min-h-[36px] whitespace-nowrap rounded-full border px-3 text-xs',
                    parts.has(p) ? 'border-accent bg-accent-tint font-semibold text-accent-fg' : 'border-line text-ink-soft hover:bg-surface')}>
                  {PART_LABEL[p]}
                </button>
              ) : (
                <span key={p} className="min-h-[36px] whitespace-nowrap rounded-full border border-line-soft px-3 py-2 text-xs text-faint">
                  {PART_LABEL[p]} - not your permission
                </span>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-fg">
            Only what a house does not already have from this model is added - a plan, line, inspection or punch item it
            already holds is never doubled, so applying again after you change the model adds just the new ones.
          </p>
          <div className="divide-y divide-line-soft rounded-lg border border-line">
            {visible.map(h => {
              const sum = applySummary(h, partList)
              return (
                <label key={h.houseId} className="flex cursor-pointer items-start gap-3 px-3 py-2.5">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#C9F24A]" checked={picked.has(h.houseId)}
                    onChange={() => setPicked(prev => { const n = new Set(prev); if (n.has(h.houseId)) n.delete(h.houseId); else n.add(h.houseId); return n })} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{h.houseName}{!h.onModel && <span className="text-xs text-warn"> · not on this model</span>}</span>
                    <span className={cn('block text-xs', sum ? 'text-muted-fg' : 'text-faint')}>
                      {sum ? <><CheckCircle2 className="mr-1 inline h-3 w-3 text-success" />Adds {sum}</> : 'Nothing new to add'}
                    </span>
                    {parts.has('plans') && h.plansSkipped.map(s => (
                      <span key={s.plan.id} className="block text-xs text-warn"><AlertTriangle className="mr-1 inline h-3 w-3" />{s.plan.name}: {s.why}.</span>
                    ))}
                  </span>
                </label>
              )
            })}
            {visible.length === 0 && <p className="px-3 py-3 text-sm text-muted-fg">No houses are on this model yet. Use Houses to pick them, or show the others below.</p>}
          </div>
          {others > 0 && (
            <button type="button" onClick={() => setShowOthers(v => !v)} className="text-xs font-semibold text-accent-fg hover:underline">
              {showOthers ? 'Hide' : 'Show'} the {others} {others === 1 ? 'house' : 'houses'} not on this model
            </button>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
        </>
      )}
    </Shell>
  )
}
