'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { FileText, Plus, X, Loader2, ArrowLeft, Printer, Trash2, Building2, Landmark } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { useDeleteGuard } from '@/components/ui/delete-guard'

const money = (n: number) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'bg-muted text-muted-fg' },
  submitted: { label: 'Submitted', cls: 'bg-info-tint text-info' },
  certified: { label: 'Certified', cls: 'bg-accent-tint text-accent-fg' },
  funded: { label: 'Funded', cls: 'bg-success-tint text-success' },
  rejected: { label: 'Rejected', cls: 'bg-danger-tint text-danger' },
}
const NEXT_STATUS: Record<string, { to: string; label: string }> = {
  draft: { to: 'submitted', label: 'Submit for payment' },
  submitted: { to: 'certified', label: 'Mark certified' },
  certified: { to: 'funded', label: 'Mark funded / paid' },
}

export default function PayAppsPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [apps, setApps] = useState<any[]>([])
  const [subOptions, setSubOptions] = useState<{ id: string; label: string; contract_amount: number }[]>([])
  const [contractSum, setContractSum] = useState(0)
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)

  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }
  }

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${params.id}/pay-apps`, { headers: await authHeaders() })
    if (res.ok) {
      const d = await res.json()
      setApps(d.applications ?? [])
      setSubOptions(d.subOptions ?? [])
      setContractSum(d.contractSum ?? 0)
    }
    setLoading(false)
  }, [params.id])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="text-sm text-faint py-12 text-center">Loading…</div>
  if (openId) return <PayAppDetail projectId={params.id} appId={openId} onBack={() => { setOpenId(null); load() }} authHeaders={authHeaders} />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Applications for Payment</h1>
          <p className="text-sm text-muted-fg mt-0.5">AIA-style G702 / G703 progress billing and bank draws. Bill the owner for the contract, or a sub bills you.</p>
        </div>
        <Button onClick={() => setShowNew(true)} className="gap-1.5"><Plus className="h-4 w-4" /> New Application</Button>
      </div>

      {showNew && <NewAppModal projectId={params.id} subOptions={subOptions} onClose={() => setShowNew(false)} onCreated={(id) => { setShowNew(false); load(); setOpenId(id) }} authHeaders={authHeaders} />}

      {apps.length === 0 ? (
        <div className="bg-panel rounded-xl border border-line p-10 text-center">
          <FileText className="h-8 w-8 text-faint mx-auto mb-3" />
          <p className="text-sm text-muted-fg">No pay applications yet. Create one to bill for a period against your schedule of values.</p>
        </div>
      ) : (
        <div className="bg-panel rounded-xl border border-line overflow-hidden divide-y divide-line-soft">
          {apps.map(a => (
            <button key={a.id} onClick={() => setOpenId(a.id)} className="w-full flex flex-wrap items-center gap-x-4 gap-y-1 px-4 sm:px-5 py-3.5 text-left hover:bg-surface transition-colors">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft shrink-0">
                {a.direction === 'gc_to_owner' ? <Landmark className="h-4 w-4 text-accent-fg" /> : <Building2 className="h-4 w-4 text-muted-fg" />}
                App #{a.application_number}
              </span>
              <span className="text-sm text-muted-fg flex-1 min-w-0 truncate">
                To {a.bill_to}{a.period_end ? ` · period ending ${new Date(a.period_end + 'T00:00:00').toLocaleDateString()}` : ''}
              </span>
              <span className="text-sm font-bold text-ink shrink-0">{money(a.current_due)}</span>
              <span className={cn('text-[10px] font-semibold rounded-full px-1.5 py-0.5 shrink-0', STATUS[a.status]?.cls)}>{STATUS[a.status]?.label ?? a.status}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function NewAppModal({ projectId, subOptions, onClose, onCreated, authHeaders }: { projectId: string; subOptions: any[]; onClose: () => void; onCreated: (id: string) => void; authHeaders: () => Promise<any> }) {
  const [direction, setDirection] = useState<'gc_to_owner' | 'sub_to_gc'>('gc_to_owner')
  const [subId, setSubId] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [retainage, setRetainage] = useState('10')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function create() {
    if (direction === 'sub_to_gc' && !subId) { setErr('Pick which subcontractor is billing.'); return }
    setSaving(true); setErr('')
    const res = await fetch(`/api/projects/${projectId}/pay-apps`, {
      method: 'POST', headers: await authHeaders(),
      body: JSON.stringify({ subcontract_id: direction === 'sub_to_gc' ? subId : null, period_end: periodEnd || null, retainage_pct: Number(retainage) || 0 }),
    })
    setSaving(false)
    if (res.ok) onCreated((await res.json()).id)
    else setErr((await res.json().catch(() => ({}))).error || 'Could not create the application.')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-panel rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-line-soft flex items-center justify-between">
          <h2 className="font-semibold text-ink">New Application for Payment</h2>
          <button onClick={onClose} className="text-faint hover:text-ink"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <Label>Who is billing?</Label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setDirection('gc_to_owner')} className={cn('rounded-lg border px-3 py-2.5 text-sm text-left', direction === 'gc_to_owner' ? 'border-accent bg-accent-tint text-accent-fg' : 'border-line text-ink-soft')}>
                <span className="font-semibold flex items-center gap-1.5"><Landmark className="h-4 w-4" /> We bill the owner</span>
                <span className="block text-xs text-muted-fg mt-0.5">Draw to the owner / bank for the whole contract</span>
              </button>
              <button type="button" onClick={() => setDirection('sub_to_gc')} className={cn('rounded-lg border px-3 py-2.5 text-sm text-left', direction === 'sub_to_gc' ? 'border-accent bg-accent-tint text-accent-fg' : 'border-line text-ink-soft')}>
                <span className="font-semibold flex items-center gap-1.5"><Building2 className="h-4 w-4" /> A sub bills us</span>
                <span className="block text-xs text-muted-fg mt-0.5">A subcontractor's pay app to you</span>
              </button>
            </div>
          </div>
          {direction === 'sub_to_gc' && (
            <div className="space-y-1.5">
              <Label>Subcontractor</Label>
              <SearchableSelect value={subId} onChange={e => setSubId(e.target.value)} placeholder="Pick a subcontractor…">
                <option value="">Select…</option>
                {subOptions.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </SearchableSelect>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Period ending</Label><Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Retainage %</Label><Input type="number" step="0.1" value={retainage} onChange={e => setRetainage(e.target.value)} /></div>
          </div>
          <p className="text-xs text-faint">The schedule of values and "previously billed" amounts fill in automatically from your budget and past applications.</p>
          {err && <p className="text-sm text-danger">{err}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={create} disabled={saving}>{saving ? 'Creating…' : 'Create'}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PayAppDetail({ projectId, appId, onBack, authHeaders }: { projectId: string; appId: string; onBack: () => void; authHeaders: () => Promise<any> }) {
  const guardDelete = useDeleteGuard()
  const [data, setData] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/pay-apps/${appId}`, { headers: await authHeaders() })
    if (res.ok) setData(await res.json())
  }, [projectId, appId])
  useEffect(() => { load() }, [load])

  if (!data) return <div className="text-sm text-faint py-12 text-center">Loading…</div>
  const { application: app, lines, summary, project } = data
  const locked = app.status !== 'draft'

  function setLine(id: string, field: 'this_period' | 'materials_stored', value: string) {
    setData((d: any) => ({ ...d, lines: d.lines.map((l: any) => l.id === id ? { ...l, [field]: value } : l) }))
    setDirty(true)
  }

  async function save(extra: Record<string, any> = {}) {
    setSaving(true)
    await fetch(`/api/projects/${projectId}/pay-apps/${appId}`, {
      method: 'PATCH', headers: await authHeaders(),
      body: JSON.stringify({ lines: lines.map((l: any) => ({ id: l.id, this_period: Number(l.this_period) || 0, materials_stored: Number(l.materials_stored) || 0 })), ...extra }),
    })
    setSaving(false); setDirty(false); load()
  }

  async function remove() {
    guardDelete(async () => {
      await fetch(`/api/projects/${projectId}/pay-apps/${appId}`, { method: 'DELETE', headers: await authHeaders() })
      onBack()
    }, { label: `Application #${app.application_number}`, protected: true })
  }

  const next = NEXT_STATUS[app.status]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-fg hover:text-ink"><ArrowLeft className="h-4 w-4" /> All applications</button>
        <div className="flex items-center gap-2">
          <Link href={`/projects/${projectId}/pay-apps/${appId}/print`} target="_blank" className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-ink-soft hover:bg-surface"><Printer className="h-4 w-4" /> G702 / G703 PDF</Link>
          <button onClick={remove} className="p-2 rounded-lg text-faint hover:bg-danger-tint hover:text-danger"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-ink">Application #{app.application_number}</h1>
        <span className={cn('text-[11px] font-semibold rounded-full px-2 py-0.5', STATUS[app.status]?.cls)}>{STATUS[app.status]?.label}</span>
        <span className="text-sm text-muted-fg">To {app.bill_to}{app.period_end ? ` · period ending ${new Date(app.period_end + 'T00:00:00').toLocaleDateString()}` : ''}</span>
      </div>

      {/* G702 summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ['Contract sum', summary.scheduled],
          ['Completed & stored', summary.completed_to_date],
          [`Retainage (${app.retainage_pct}%)`, summary.retainage],
          ['Current payment due', summary.current_due],
        ].map(([label, val], i) => (
          <div key={label as string} className={cn('rounded-xl border p-4', i === 3 ? 'border-accent bg-accent-tint/40' : 'border-line bg-panel')}>
            <p className="text-xs font-medium text-muted-fg">{label as string}</p>
            <p className={cn('text-lg font-bold mt-1', i === 3 ? 'text-accent-fg' : 'text-ink')}>{money(val as number)}</p>
          </div>
        ))}
      </div>

      {/* G703 continuation sheet */}
      <div className="bg-panel rounded-xl border border-line overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-soft text-[11px] uppercase tracking-wide text-faint">
                <th className="text-left px-3 py-2 font-semibold">Description of work</th>
                <th className="text-right px-3 py-2 font-semibold">Scheduled value</th>
                <th className="text-right px-3 py-2 font-semibold">From previous</th>
                <th className="text-right px-3 py-2 font-semibold">This period</th>
                <th className="text-right px-3 py-2 font-semibold">Stored</th>
                <th className="text-right px-3 py-2 font-semibold">% G/C</th>
                <th className="text-right px-3 py-2 font-semibold">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {lines.map((l: any) => {
                const completed = (Number(l.previous_completed) || 0) + (Number(l.this_period) || 0) + (Number(l.materials_stored) || 0)
                const sv = Number(l.scheduled_value) || 0
                return (
                  <tr key={l.id}>
                    <td className="px-3 py-2 text-ink-soft min-w-[180px]">{l.cost_code && <span className="text-faint mr-1.5">{l.cost_code}</span>}{l.description}</td>
                    <td className="px-3 py-2 text-right text-muted-fg whitespace-nowrap">{money(sv)}</td>
                    <td className="px-3 py-2 text-right text-muted-fg whitespace-nowrap">{money(Number(l.previous_completed) || 0)}</td>
                    <td className="px-2 py-1.5 text-right">
                      <input type="number" disabled={locked} value={l.this_period ?? ''} onChange={e => setLine(l.id, 'this_period', e.target.value)}
                        className="w-24 rounded-md border border-line px-2 py-1 text-right text-sm disabled:opacity-60 disabled:bg-surface" placeholder="0" />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <input type="number" disabled={locked} value={l.materials_stored ?? ''} onChange={e => setLine(l.id, 'materials_stored', e.target.value)}
                        className="w-24 rounded-md border border-line px-2 py-1 text-right text-sm disabled:opacity-60 disabled:bg-surface" placeholder="0" />
                    </td>
                    <td className="px-3 py-2 text-right text-muted-fg whitespace-nowrap">{sv ? Math.round((completed / sv) * 100) : 0}%</td>
                    <td className="px-3 py-2 text-right text-muted-fg whitespace-nowrap">{money(sv - completed)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line bg-surface font-bold text-ink-soft text-sm">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right">{money(summary.scheduled)}</td>
                <td className="px-3 py-2 text-right">{money(summary.previous)}</td>
                <td className="px-3 py-2 text-right">{money(summary.this_period)}</td>
                <td className="px-3 py-2 text-right">{money(summary.stored)}</td>
                <td className="px-3 py-2 text-right">{summary.scheduled ? Math.round((summary.completed_to_date / summary.scheduled) * 100) : 0}%</td>
                <td className="px-3 py-2 text-right">{money(summary.balance_to_finish)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-fg">
          Earned less retainage <span className="font-semibold text-ink-soft">{money(summary.earned_less_retainage)}</span>
          <span className="mx-2 text-faint">·</span>
          Less previous certificates <span className="font-semibold text-ink-soft">{money(summary.less_previous)}</span>
        </div>
        <div className="flex items-center gap-2">
          {!locked && <Button variant={dirty ? 'default' : 'outline'} onClick={() => save()} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>}
          {next && <Button onClick={() => save({ status: next.to })} disabled={saving}>{next.label}</Button>}
        </div>
      </div>
    </div>
  )
}
