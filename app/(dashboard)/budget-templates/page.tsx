'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LayoutTemplate, FileSpreadsheet, Trash2, ChevronDown, ChevronRight, Loader2, Check, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface TemplateItem { id?: string; description: string; default_amount: number | null; category?: string }
interface Template { id: string; name: string; source: string; created_at: string; budget_template_items: TemplateItem[] }

const money = (n: number | null) => n == null ? '-' : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

export default function BudgetTemplatesPage() {
  const supabase = createClient()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [staged, setStaged] = useState<{ name: string; items: TemplateItem[] } | null>(null)
  const [saving, setSaving] = useState(false)

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function load() {
    const token = await getToken()
    const res = await fetch('/api/budget-templates', { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) setTemplates((await res.json()).templates ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function importExcel(file: File) {
    setImporting(true)
    const token = await getToken()
    const form = new FormData(); form.append('file', file)
    const res = await fetch('/api/budget-templates/import', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
    setImporting(false)
    if (res.ok) { const d = await res.json(); setStaged({ name: d.suggested_name ?? 'New template', items: d.items ?? [] }) }
    else alert((await res.json().catch(() => ({}))).error ?? 'Could not read file')
  }

  async function saveStaged() {
    if (!staged || !staged.name.trim()) return
    setSaving(true)
    const token = await getToken()
    const res = await fetch('/api/budget-templates', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: staged.name, source: 'excel', items: staged.items }),
    })
    setSaving(false)
    if (res.ok) { setStaged(null); load() }
  }

  async function remove(id: string) {
    if (!confirm('Delete this template?')) return
    const token = await getToken()
    await fetch(`/api/budget-templates/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    load()
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-muted-fg hover:text-ink mb-2"><ArrowLeft className="h-4 w-4" /> Back to Settings</Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-ink flex items-center gap-2"><LayoutTemplate className="h-6 w-6 text-accent-fg" /> Budget Templates</h1>
            <p className="text-sm text-muted-fg mt-0.5">Upload your Excel budget sheets to build reusable templates. Apply them to any project from its Budget tab.</p>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) importExcel(f); e.target.value = '' }} />
          <Button onClick={() => fileRef.current?.click()} disabled={importing} className="gap-1.5">
            {importing ? <><Loader2 className="h-4 w-4 animate-spin" /> Reading…</> : <><FileSpreadsheet className="h-4 w-4" /> Upload Excel</>}
          </Button>
        </div>
      </div>

      {/* Staged import - review & save */}
      {staged && (
        <div className="bg-panel rounded-xl border border-accent/40 p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink-soft">New template from Excel</p>
            <span className="text-xs text-faint">{staged.items.length} line items</span>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-fg">Template name</label>
            <Input value={staged.name} onChange={e => setStaged({ ...staged, name: e.target.value })} placeholder="e.g. New build - full custom" />
          </div>
          <div className="rounded-lg border border-line-soft max-h-60 overflow-y-auto divide-y divide-line-soft">
            {staged.items.map((it, i) => (
              <div key={i} className="flex justify-between gap-2 px-3 py-1.5 text-sm">
                <span className="text-ink-soft truncate">{it.description}</span>
                <span className="text-muted-fg shrink-0">{money(it.default_amount)}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-faint">Amounts are kept as suggested defaults - when you apply the template, amounts come in blank unless you choose to copy them.</p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setStaged(null)}>Discard</Button>
            <Button onClick={saveStaged} disabled={saving || !staged.name.trim()}>{saving ? 'Saving…' : 'Save Template'}</Button>
          </div>
        </div>
      )}

      {/* Library */}
      {loading ? (
        <div className="text-sm text-faint py-12 text-center">Loading…</div>
      ) : templates.length === 0 && !staged ? (
        <div className="bg-panel rounded-xl border border-dashed border-line p-10 text-center">
          <FileSpreadsheet className="h-8 w-8 text-faint mx-auto mb-3" />
          <p className="text-sm text-muted-fg">No templates yet. Upload an Excel budget sheet to create your first one.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map(t => {
            const open = expanded === t.id
            const total = (t.budget_template_items ?? []).reduce((s, i) => s + Number(i.default_amount || 0), 0)
            return (
              <div key={t.id} className="bg-panel rounded-xl border border-line overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <button onClick={() => setExpanded(open ? null : t.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                    {open ? <ChevronDown className="h-4 w-4 text-faint shrink-0" /> : <ChevronRight className="h-4 w-4 text-faint shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-soft truncate">{t.name}</p>
                      <p className="text-xs text-faint">{(t.budget_template_items?.length ?? 0)} line items · {money(total)}{t.source === 'excel' ? ' · from Excel' : ''}</p>
                    </div>
                  </button>
                  <button onClick={() => remove(t.id)} className="p-1.5 rounded-lg text-faint hover:bg-danger-tint hover:text-danger shrink-0"><Trash2 className="h-4 w-4" /></button>
                </div>
                {open && (
                  <div className="border-t border-line-soft max-h-72 overflow-y-auto divide-y divide-line-soft">
                    {(t.budget_template_items ?? []).map((it, i) => (
                      <div key={i} className="flex justify-between gap-2 px-4 py-1.5 text-sm">
                        <span className="text-muted-fg truncate">{it.category && <span className="text-faint mr-1.5">{it.category}</span>}{it.description}</span>
                        <span className="text-ink-soft shrink-0">{money(it.default_amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="rounded-lg bg-success-tint/50 border border-success/20 px-4 py-3 text-sm text-ink-soft flex items-start gap-2">
        <Check className="h-4 w-4 text-success shrink-0 mt-0.5" />
        Saved templates appear under each project's <span className="font-medium">Budget → Use Template</span>, where you can apply them with blank or copied amounts.
      </div>
    </div>
  )
}
