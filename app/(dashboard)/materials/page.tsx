'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { CameraCapture } from '@/components/ui/camera-capture'
import { useDeleteGuard } from '@/components/ui/delete-guard'
import { cn } from '@/lib/utils'
import { Plus, X, ShoppingCart, Camera, Upload, Loader2, Receipt, Trash2, ExternalLink, Search } from 'lucide-react'

const CATEGORIES = ['Lumber', 'Electrical', 'Plumbing', 'Hardware', 'Concrete', 'Paint', 'Drywall', 'Tools', 'Fuel', 'Rental', 'Other']
const money = (n: number) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`

type Material = {
  id: string; project_id: string; project_name: string; store_name: string | null
  amount: number; tax: number | null; purchase_date: string | null; category: string | null
  notes: string | null; receipt_url: string | null; line_items: any[] | null; company_id: string | null
}
type ProjectOpt = { id: string; name: string }

async function authHeaders() {
  const { data: { session } } = await createClient().auth.getSession()
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }
}

// ── Add receipt modal ────────────────────────────────────────────────────────
function AddModal({ projects, onClose, onSaved }: { projects: ProjectOpt[]; onClose: () => void; onSaved: () => void }) {
  const [stage, setStage] = useState<'capture' | 'form'>('capture')
  const [showCamera, setShowCamera] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanNote, setScanNote] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // form fields
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)
  const [store, setStore] = useState('')
  const [date, setDate] = useState('')
  const [amount, setAmount] = useState('')
  const [tax, setTax] = useState('')
  const [category, setCategory] = useState('')
  const [projectId, setProjectId] = useState(projects.length === 1 ? projects[0].id : '')
  const [notes, setNotes] = useState('')
  const [lineItems, setLineItems] = useState<any[]>([])
  const [saveStore, setSaveStore] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  // Budget lines for the chosen job, so a receipt can roll into a line's actuals
  const [budgetLines, setBudgetLines] = useState<{ id: string; label: string }[]>([])
  const [budgetLineId, setBudgetLineId] = useState('')

  useEffect(() => {
    setBudgetLineId('')
    if (!projectId) { setBudgetLines([]); return }
    let alive = true
    ;(async () => {
      const res = await fetch(`/api/projects/${projectId}/budget`, { headers: await authHeaders() })
      if (!res.ok) { if (alive) setBudgetLines([]); return }
      const d = await res.json()
      if (alive) setBudgetLines((d.items ?? []).map((l: any) => ({ id: l.id, label: [l.category, l.description].filter(Boolean).join(' · ') || 'Line' })))
    })()
    return () => { alive = false }
  }, [projectId])

  async function scan(file: File | Blob) {
    setScanning(true); setScanNote(''); setStage('form')
    const fd = new FormData()
    fd.append('file', file, (file as File).name || 'receipt.jpg')
    const { data: { session } } = await createClient().auth.getSession()
    const res = await fetch('/api/materials/scan', { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token}` }, body: fd })
    setScanning(false)
    const d = await res.json().catch(() => ({}))
    if (d.receipt_url) setReceiptUrl(d.receipt_url)
    if (d.fields) {
      const f = d.fields
      if (f.store_name) setStore(f.store_name)
      if (f.purchase_date) setDate(f.purchase_date)
      if (f.total != null) setAmount(String(f.total))
      if (f.tax != null) setTax(String(f.tax))
      if (f.category) setCategory(f.category)
      if (Array.isArray(f.line_items)) setLineItems(f.line_items)
      setScanNote('Scanned — review the details below.')
    } else {
      setScanNote(d.error || 'Could not read the receipt — enter the details manually.')
    }
  }

  async function save() {
    if (!projectId) { setErr('Pick which job this is for.'); return }
    if (!amount) { setErr('Enter the total amount.'); return }
    setSaving(true); setErr('')
    const res = await fetch('/api/materials', {
      method: 'POST', headers: await authHeaders(),
      body: JSON.stringify({
        project_id: projectId, store_name: store.trim() || null, amount, tax, purchase_date: date || null,
        category: category || null, notes: notes.trim() || null, receipt_url: receiptUrl, line_items: lineItems.length ? lineItems : null,
        budget_line_id: budgetLineId || null, save_store: saveStore,
      }),
    })
    setSaving(false)
    if (res.ok) onSaved()
    else setErr((await res.json().catch(() => ({}))).error || 'Could not save.')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && onClose()}>
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-xl bg-panel shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold text-ink">Add material receipt</h2>
          <button onClick={onClose} className="text-faint hover:text-ink"><X className="h-5 w-5" /></button>
        </div>

        {stage === 'capture' ? (
          <div className="space-y-3 px-5 py-6">
            <p className="text-sm text-muted-fg">Snap a photo of the receipt and we'll read the store and total for you.</p>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="sr-only"
              onChange={e => { const f = e.target.files?.[0]; if (f) scan(f) }} />
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setShowCamera(true)}
                className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-accent/50 bg-accent-tint/40 px-4 py-6 text-accent-fg hover:bg-accent-tint">
                <Camera className="h-6 w-6" /> <span className="text-sm font-semibold">Take photo</span>
              </button>
              <button onClick={() => fileRef.current?.click()}
                className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line px-4 py-6 text-muted-fg hover:bg-surface">
                <Upload className="h-6 w-6" /> <span className="text-sm font-semibold">Upload file</span>
              </button>
            </div>
            <button onClick={() => setStage('form')} className="w-full text-center text-xs text-faint hover:text-muted-fg">or enter it manually</button>
          </div>
        ) : (
          <div className="space-y-4 px-5 py-4">
            {scanning && <div className="flex items-center gap-2 rounded-lg bg-accent-tint/50 px-3 py-2.5 text-sm text-accent-fg"><Loader2 className="h-4 w-4 animate-spin" /> Reading the receipt…</div>}
            {!scanning && scanNote && <p className="text-xs text-muted-fg">{scanNote}</p>}

            {receiptUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={receiptUrl} alt="Receipt" className="max-h-40 rounded-lg border border-line object-contain" />
            )}

            <div>
              <Label>Which job is this for? <span className="text-danger">*</span></Label>
              <Select value={projectId} onChange={e => setProjectId(e.target.value)}>
                <option value="">Select a project…</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
            {projectId && budgetLines.length > 0 && (
              <div>
                <Label>Budget line <span className="text-faint font-normal">(optional — rolls into its actual cost)</span></Label>
                <Select value={budgetLineId} onChange={e => setBudgetLineId(e.target.value)}>
                  <option value="">Not linked to a budget line</option>
                  {budgetLines.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Store / vendor</Label><Input value={store} onChange={e => setStore(e.target.value)} placeholder="e.g. Home Depot" /></div>
              <div><Label>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
              <div><Label>Total ($)</Label><Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></div>
              <div><Label>Tax ($)</Label><Input type="number" value={tax} onChange={e => setTax(e.target.value)} placeholder="optional" /></div>
              <div><Label>Category</Label>
                <Select value={category} onChange={e => setCategory(e.target.value)}>
                  <option value="">Uncategorized</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
              </div>
            </div>
            <div><Label>Notes</Label><Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="optional" /></div>

            {lineItems.length > 0 && (
              <div className="rounded-lg border border-line-soft bg-surface p-2.5">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-faint">Items read from receipt</p>
                <div className="max-h-28 space-y-0.5 overflow-y-auto">
                  {lineItems.map((li, i) => (
                    <div key={i} className="flex justify-between gap-2 text-xs">
                      <span className="truncate text-muted-fg">{li.qty ? `${li.qty}× ` : ''}{li.description}</span>
                      <span className="shrink-0 text-ink-soft">{li.amount != null ? money(li.amount) : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" className="accent-[#C9F24A]" checked={saveStore} onChange={e => setSaveStore(e.target.checked)} />
              Save the store to my Directory as a supplier
            </label>
            {err && <p className="text-sm text-danger">{err}</p>}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {stage === 'form' && <Button onClick={save} disabled={saving || scanning}>{saving ? 'Saving…' : 'Save receipt'}</Button>}
        </div>
      </div>

      {showCamera && (
        <CameraCapture facing="environment" onClose={() => setShowCamera(false)}
          onCapture={(blob) => { setShowCamera(false); scan(blob) }} />
      )}
    </div>
  )
}

export default function MaterialsPage() {
  const guardDelete = useDeleteGuard()
  const [materials, setMaterials] = useState<Material[]>([])
  const [projects, setProjects] = useState<ProjectOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [query, setQuery] = useState('')
  const [projectFilter, setProjectFilter] = useState('all')

  async function load() {
    const res = await fetch('/api/materials', { headers: await authHeaders() })
    if (res.ok) { const d = await res.json(); setMaterials(d.materials); setProjects(d.projects) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function remove(m: Material) {
    guardDelete(async () => {
      await fetch(`/api/materials/${m.id}`, { method: 'DELETE', headers: await authHeaders() })
      setMaterials(prev => prev.filter(x => x.id !== m.id))
    }, { label: `the ${money(m.amount)} receipt from ${m.store_name ?? 'this store'}`, protected: true })
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return materials.filter(m => {
      if (projectFilter !== 'all' && m.project_id !== projectFilter) return false
      if (!q) return true
      return [m.store_name, m.category, m.project_name, m.notes].filter(Boolean).some(s => (s as string).toLowerCase().includes(q))
    })
  }, [materials, query, projectFilter])

  const total = useMemo(() => filtered.reduce((s, m) => s + Number(m.amount || 0), 0), [filtered])

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Materials"
        subtitle="Snap a receipt, assign it to a job, and it flows into that project's costs."
        action={<Button onClick={() => setShowAdd(true)}><Plus className="mr-1.5 h-4 w-4" />Add receipt</Button>}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-panel px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-fg">Receipts</p>
          <p className="mt-0.5 text-2xl font-bold text-ink">{filtered.length}</p>
        </div>
        <div className="rounded-xl border border-line bg-panel px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-fg">Total spent</p>
          <p className="mt-0.5 text-2xl font-bold text-ink">{money(total)}</p>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input className="pl-9" placeholder="Search store, category, job…" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <Select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className="sm:w-56">
          <option value="all">All jobs</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </div>

      {loading ? (
        <p className="py-16 text-center text-sm text-muted-fg">Loading…</p>
      ) : filtered.length === 0 ? (
        <EmptyState icon={ShoppingCart}
          title={materials.length === 0 ? 'No receipts yet' : 'Nothing matches'}
          description={materials.length === 0 ? 'Add your first material receipt — take a photo and we\'ll read it.' : 'Try a different search or filter.'} />
      ) : (
        <div className="space-y-2">
          {filtered.map(m => (
            <div key={m.id} className="flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-ink-soft">
                {m.receipt_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={m.receipt_url} alt="" className="h-full w-full object-cover" />
                  : <Receipt className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-semibold text-ink">{m.store_name || 'Material purchase'}</p>
                  {m.category && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-fg">{m.category}</span>}
                </div>
                <p className="truncate text-xs text-muted-fg">
                  {m.project_name}{m.purchase_date ? ` · ${new Date(m.purchase_date + 'T00:00:00').toLocaleDateString()}` : ''}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-bold text-ink">{money(m.amount)}</p>
                <div className="mt-0.5 flex items-center justify-end gap-2">
                  {m.receipt_url && <a href={m.receipt_url} target="_blank" rel="noreferrer" className="text-faint hover:text-accent-fg"><ExternalLink className="h-3.5 w-3.5" /></a>}
                  <button onClick={() => remove(m)} className="text-faint hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && <AddModal projects={projects} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load() }} />}
    </div>
  )
}
