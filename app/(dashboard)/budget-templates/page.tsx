'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LayoutTemplate, FileSpreadsheet, Trash2, ChevronDown, ChevronRight, Loader2, Check, ArrowLeft, Plus } from 'lucide-react'
import { useNotice } from '@/components/ui/notice'
import { useDeleteGuard } from '@/components/ui/delete-guard'
import { autoFocusOnDesktop } from '@/lib/auto-focus'
import { fetchProblem } from '@/lib/fetch-error'
import { toAmount } from '@/lib/schedule-dependencies'
import { templateNameProblem } from '@/lib/budget-template-line'
import Link from 'next/link'
import { TemplateLineDialog, SmallDialog } from '@/components/budget/template-line-dialog'

interface TemplateItem {
  id?: string; description: string
  /** NUMERIC - a string off the wire. */
  default_amount: number | string | null
  category?: string | null; cost_code?: string | null; cost_type?: string | null
}
interface Template { id: string; name: string; source: string; created_at: string; budget_template_items: TemplateItem[] }

const money = (n: unknown) => { const a = toAmount(n); return a == null ? '-' : `$${a.toLocaleString(undefined, { maximumFractionDigits: 2 })}` }

async function getToken() {
  const { data: { session } } = await createClient().auth.getSession()
  return session?.access_token ?? ''
}
async function call(url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getToken()}`, ...(init.headers ?? {}) },
  })
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as any }
}

type LineDialog = { templateId: string; item: TemplateItem | null }

export default function BudgetTemplatesPage() {
  const guardDelete = useDeleteGuard()
  const notify = useNotice()
  const [templates, setTemplates] = useState<Template[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [expanded, setExpanded] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [staged, setStaged] = useState<{ name: string; items: TemplateItem[] } | null>(null)
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [lineDialog, setLineDialog] = useState<LineDialog | null>(null)
  // `/budget-templates?t=<id>` opens that template - the model editor links
  // here. Once, by ref, so it can still be closed.
  const deepLinked = useRef(false)

  async function load() {
    try {
      const r = await call('/api/budget-templates')
      if (!r.ok) { setState('failed'); return }
      const list: Template[] = r.data.templates ?? []
      setTemplates(list)
      setState('ready')
      if (!deepLinked.current) {
        deepLinked.current = true
        const want = new URLSearchParams(window.location.search).get('t')
        if (want && list.some(t => t.id === want)) {
          setExpanded(want)
          setTimeout(() => document.getElementById(`tpl-${want}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50)
        }
      }
    } catch { setState('failed') }
  }
  useEffect(() => { load() }, [])

  async function importExcel(file: File) {
    setImporting(true)
    try {
      const form = new FormData(); form.append('file', file)
      const res = await fetch('/api/budget-templates/import', { method: 'POST', headers: { Authorization: `Bearer ${await getToken()}` }, body: form })
      if (res.ok) { const d = await res.json(); setStaged({ name: d.suggested_name ?? 'New template', items: d.items ?? [] }) }
      else notify((await res.json().catch(() => ({}))).error ?? 'Could not read file')
    } catch (e) { notify(fetchProblem(e, 'reading the file')) } finally { setImporting(false) }
  }

  async function saveStaged() {
    if (!staged) return
    const problem = templateNameProblem(staged.name)
    if (problem) { notify(problem); return }
    setSaving(true)
    try {
      const r = await call('/api/budget-templates', { method: 'POST', body: JSON.stringify({ name: staged.name, source: 'excel', items: staged.items }) })
      if (!r.ok) { notify(r.data.error ?? 'Could not save the template.'); return }
      setStaged(null); setExpanded(r.data.template?.id ?? null); load()
    } catch (e) { notify(fetchProblem(e, 'saving the template')) } finally { setSaving(false) }
  }

  function remove(t: Template) {
    guardDelete(async () => {
      const r = await call(`/api/budget-templates/${t.id}`, { method: 'DELETE' })
      if (!r.ok) notify(r.data.error ?? 'Could not delete the template.')
      load()
    }, { label: `the template "${t.name}"`, body: 'Houses and jobs already given this budget keep their lines. A house model using it is left with no budget.' })
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-muted-fg hover:text-ink mb-2"><ArrowLeft className="h-4 w-4" /> Back to Settings</Link>
        <div className="space-y-3">
          <div>
            <h1 className="text-2xl font-bold text-ink flex items-center gap-2"><LayoutTemplate className="h-6 w-6 text-accent-fg" /> Budget Templates</h1>
            <p className="text-sm text-muted-fg mt-0.5">Reusable budgets: start one from scratch, upload an Excel sheet, or save one from a job&apos;s Budget tab. Open a template to add or change its lines.</p>
          </div>
          <div className="row-even lg:flex lg:flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setCreating(true)} className="gap-1.5"><Plus className="h-4 w-4" /> New template</Button>
            {/* A label wrapping an sr-only input, like every other upload here. */}
            <label className={`inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg hover:opacity-90 lg:min-h-[36px] ${importing ? 'pointer-events-none opacity-60' : ''}`}>
              {importing ? <><Loader2 className="h-4 w-4 animate-spin" /> Reading…</> : <><FileSpreadsheet className="h-4 w-4" /> Upload Excel</>}
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) importExcel(f); e.target.value = '' }} />
            </label>
          </div>
        </div>
      </div>

      {/* Staged import - review & save */}
      {staged && (
        <div className="bg-panel rounded-2xl border border-accent/40 p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink-soft">New template from Excel</p>
            <span className="text-xs text-faint">{staged.items.length} line items</span>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staged-name">Template name *</Label>
            <Input id="staged-name" value={staged.name} onChange={e => setStaged({ ...staged, name: e.target.value })} placeholder="e.g. New build - full custom" />
          </div>
          <div className="rounded-lg border border-line-soft max-h-60 overflow-y-auto divide-y divide-line-soft">
            {staged.items.map((it, i) => (
              <div key={i} className="flex justify-between gap-2 px-3 py-1.5 text-sm">
                <span className="text-ink-soft truncate">{it.description}</span>
                <span className="text-muted-fg shrink-0">{money(it.default_amount)}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-faint">You can add, change or remove lines after saving.</p>
          <div className="row-even lg:flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setStaged(null)}>Discard</Button>
            <Button onClick={saveStaged} disabled={saving}>{saving ? 'Saving…' : 'Save Template'}</Button>
          </div>
        </div>
      )}

      {/* Library */}
      {state === 'loading' ? (
        <div className="text-sm text-faint py-12 text-center">Loading…</div>
      ) : state === 'failed' ? (
        <div className="text-sm text-danger py-12 text-center">Could not load your templates. Reload to try again.</div>
      ) : templates.length === 0 && !staged ? (
        <div className="bg-panel rounded-2xl border border-dashed border-line p-10 text-center">
          <FileSpreadsheet className="h-8 w-8 text-faint mx-auto mb-3" />
          <p className="text-sm text-muted-fg">No templates yet. Start one from scratch or upload an Excel budget sheet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map(t => (
            <TemplateCard key={t.id} t={t} open={expanded === t.id}
              onToggle={() => setExpanded(expanded === t.id ? null : t.id)}
              onDelete={() => remove(t)} onReload={load}
              onLine={item => setLineDialog({ templateId: t.id, item })} />
          ))}
        </div>
      )}

      <div className="rounded-lg bg-success-tint/50 border border-success/20 px-4 py-3 text-sm text-ink-soft flex items-start gap-2">
        <Check className="h-4 w-4 text-success shrink-0 mt-0.5" />
        <span>
          Saved templates appear under each project&apos;s <span className="font-medium">Budget → Use Template</span>, and on a
          development&apos;s house models. Changing a template does not change houses on its own: open the development,
          press <span className="font-medium">Apply</span> on the model, and it shows the new lines and changed amounts for each
          house before anything is written.
        </span>
      </div>

      {creating && <NewTemplateDialog onClose={() => setCreating(false)} onCreated={id => { setCreating(false); setExpanded(id); load() }} />}
      {lineDialog && (
        <TemplateLineDialog templateId={lineDialog.templateId} item={lineDialog.item}
          onClose={() => setLineDialog(null)} onSaved={() => { setLineDialog(null); load() }} />
      )}
    </div>
  )
}

function TemplateCard({ t, open, onToggle, onDelete, onReload, onLine }: {
  t: Template; open: boolean; onToggle: () => void; onDelete: () => void; onReload: () => void
  onLine: (item: TemplateItem | null) => void
}) {
  const notify = useNotice()
  const [name, setName] = useState(t.name)
  useEffect(() => { setName(t.name) }, [t.name])
  const items = t.budget_template_items ?? []
  const total = items.reduce((s, i) => s + (toAmount(i.default_amount) ?? 0), 0)

  async function rename() {
    if (name.trim() === t.name) return
    const problem = templateNameProblem(name)
    if (problem) { notify(problem); setName(t.name); return }
    try {
      const r = await call(`/api/budget-templates/${t.id}`, { method: 'PATCH', body: JSON.stringify({ name }) })
      if (!r.ok) { notify(r.data.error ?? 'Could not rename the template.'); setName(t.name); return }
      onReload()
    } catch (e) { notify(fetchProblem(e, 'renaming the template')) }
  }

  return (
    <div id={`tpl-${t.id}`} className="bg-panel rounded-2xl border border-line scroll-mt-4">
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={onToggle} aria-expanded={open} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          {open ? <ChevronDown className="h-4 w-4 text-faint shrink-0" /> : <ChevronRight className="h-4 w-4 text-faint shrink-0" />}
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-soft truncate">{t.name}</p>
            <p className="text-xs text-faint">{items.length} line items · {money(total)}{t.source === 'excel' ? ' · from Excel' : ''}</p>
          </div>
        </button>
        <button onClick={onDelete} aria-label={`Delete ${t.name}`} title="Delete template"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-faint hover:bg-danger-tint hover:text-danger shrink-0 lg:h-8 lg:w-8">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {open && (
        <div className="border-t border-line-soft space-y-3 px-4 py-3">
          <div className="space-y-1.5">
            <Label htmlFor={`tpl-name-${t.id}`}>Template name *</Label>
            <Input id={`tpl-name-${t.id}`} value={name} onChange={e => setName(e.target.value)} onBlur={rename}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() } }} />
          </div>
          <div className="divide-y divide-line-soft rounded-lg border border-line-soft">
            {items.length === 0 && <p className="px-3 py-3 text-sm text-muted-fg">No lines yet. Add the first one below.</p>}
            {items.map((it, i) => (
              <button key={it.id ?? i} type="button" onClick={() => onLine(it)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-surface">
                <span className="min-w-0 truncate text-ink-soft">
                  {it.category && it.category !== 'General' && <span className="text-faint mr-1.5">{it.category}</span>}
                  {it.description}
                  {it.cost_type === 'soft' && <span className="ml-1.5 text-xs text-faint">soft</span>}
                </span>
                <span className="text-ink shrink-0">{money(it.default_amount)}</span>
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" onClick={() => onLine(null)} className="gap-1.5"><Plus className="h-4 w-4" /> Add line</Button>
        </div>
      )}
    </div>
  )
}

function NewTemplateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function save() {
    const problem = templateNameProblem(name)
    if (problem) { setError(problem); return }
    setBusy(true); setError(null)
    try {
      const r = await call('/api/budget-templates', { method: 'POST', body: JSON.stringify({ name, source: 'manual', items: [] }) })
      if (!r.ok) { setError(r.data.error ?? 'Could not create the template.'); return }
      onCreated(r.data.template.id)
    } catch (e) { setError(fetchProblem(e, 'creating the template')) } finally { setBusy(false) }
  }
  return (
    <SmallDialog title="New budget template" onClose={onClose} busy={busy}
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? 'Creating…' : 'Create'}</Button></>}>
      <div className="space-y-1.5">
        <Label htmlFor="new-tpl-name">Name *</Label>
        <Input id="new-tpl-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. The Aspen - per house"
          autoFocus={autoFocusOnDesktop()} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save() } }} />
      </div>
      <p className="text-xs text-faint">You add the lines next.</p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </SmallDialog>
  )
}
