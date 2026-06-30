'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDeleteGuard } from '@/components/ui/delete-guard'
import { Plus, X, Wallet, TrendingDown, Banknote, Percent, Trash2, Pencil, Check, Landmark } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Payment {
  id: string; paid_date: string | null; amount: number; method: string | null
  memo: string | null; retainer: boolean; qb_entered: boolean
}
interface Summary {
  received: number; feeEarned: number; availableAfterFee: number
  vendorBilled: number; vendorPaid: number; outstandingToVendors: number; escrowBalance: number
}
const money = (n: number) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
const blank = { paid_date: '', amount: '', method: 'Check', memo: '', retainer: false, qb_entered: false }
const METHODS = ['Check', 'QuickPay', 'Wire', 'ACH', 'Cash', 'CC', 'Other']

export default function PaymentsPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const guardDelete = useDeleteGuard()
  const [payments, setPayments] = useState<Payment[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [feePct, setFeePct] = useState(0)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ ...blank })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ ...blank })
  const [feeEditing, setFeeEditing] = useState(false)
  const [feeInput, setFeeInput] = useState('')

  async function token() { const { data: { session } } = await supabase.auth.getSession(); return session?.access_token ?? '' }

  async function load() {
    const t = await token()
    const res = await fetch(`/api/projects/${params.id}/payments`, { headers: { Authorization: `Bearer ${t}` } })
    if (res.ok) {
      const d = await res.json()
      setPayments(d.payments ?? []); setSummary(d.summary ?? null); setFeePct(d.fee_pct ?? 0)
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [params.id])

  async function addPayment() {
    if (!form.amount) return
    setSaving(true)
    const t = await token()
    const res = await fetch(`/api/projects/${params.id}/payments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ ...form, amount: Number(form.amount) }),
    })
    setSaving(false)
    if (res.ok) { setForm({ ...blank }); setAdding(false); load() }
    else alert((await res.json().catch(() => ({}))).error ?? 'Could not add')
  }

  async function saveEdit(id: string) {
    const t = await token()
    await fetch(`/api/projects/${params.id}/payments/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ ...editForm, amount: Number(editForm.amount) }),
    })
    setEditingId(null); load()
  }

  function remove(p: Payment) {
    guardDelete(async () => {
      const t = await token()
      await fetch(`/api/projects/${params.id}/payments/${p.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } })
      load()
    }, { label: `the ${money(p.amount)} client payment`, protected: true })
  }

  async function saveFee() {
    const pct = Math.max(0, Math.min(Number(feeInput) || 0, 100)) / 100
    const t = await token()
    await fetch(`/api/projects/${params.id}/payments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ fee_pct: pct }),
    })
    setFeeEditing(false); load()
  }

  if (loading) return <div className="text-sm text-faint py-12 text-center">Loading…</div>
  const s = summary

  const cards = [
    { label: 'Funds Received', value: s?.received ?? 0, icon: Banknote, color: 'text-success', bg: 'bg-success-tint' },
    { label: `Contractor Fee (${(feePct * 100).toFixed(feePct * 100 % 1 ? 1 : 0)}%)`, value: s?.feeEarned ?? 0, icon: Percent, color: 'text-info', bg: 'bg-info-tint' },
    { label: 'Paid to Vendors', value: s?.vendorPaid ?? 0, icon: TrendingDown, color: 'text-ink', bg: 'bg-panel' },
    {
      label: 'Escrow Balance', value: s?.escrowBalance ?? 0, icon: Landmark,
      color: (s?.escrowBalance ?? 0) < 0 ? 'text-danger' : 'text-accent-fg',
      bg: (s?.escrowBalance ?? 0) < 0 ? 'bg-danger-tint' : 'bg-accent-tint/50',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Payments &amp; Escrow</h1>
          <p className="text-sm text-muted-fg mt-0.5">Client funds in, your fee, and what's left to pay vendors — the cash side of the job.</p>
        </div>
        <Button onClick={() => setAdding(v => !v)} className="gap-1.5"><Plus className="h-4 w-4" /> Record Payment</Button>
      </div>

      {/* Escrow summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(c => { const Icon = c.icon; return (
          <div key={c.label} className={cn('rounded-xl border border-line p-4', c.bg)}>
            <div className="flex items-center gap-2 mb-2"><Icon className={cn('h-4 w-4', c.color)} /><p className="text-xs font-medium text-muted-fg">{c.label}</p></div>
            <p className={cn('text-2xl font-bold', c.color)}>{money(c.value)}</p>
          </div>
        )})}
      </div>

      {/* Secondary stats + fee setting */}
      <div className="bg-panel rounded-xl border border-line p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <Stat label="Available after fee" value={money(s?.availableAfterFee ?? 0)} />
        <Stat label="Vendor billed" value={money(s?.vendorBilled ?? 0)} />
        <Stat label="Outstanding to vendors" value={money(s?.outstandingToVendors ?? 0)} cls={(s?.outstandingToVendors ?? 0) > 0 ? 'text-warn' : ''} />
        <div>
          <p className="text-xs text-faint mb-0.5">Contractor fee rate</p>
          {feeEditing ? (
            <div className="flex items-center gap-1">
              <Input className="w-20 h-8" value={feeInput} onChange={e => setFeeInput(e.target.value)} placeholder="15" />
              <span className="text-sm text-muted-fg">%</span>
              <button onClick={saveFee} className="p-1 text-success"><Check className="h-4 w-4" /></button>
              <button onClick={() => setFeeEditing(false)} className="p-1 text-faint"><X className="h-4 w-4" /></button>
            </div>
          ) : (
            <button onClick={() => { setFeeInput(String(feePct * 100)); setFeeEditing(true) }} className="inline-flex items-center gap-1.5 font-semibold text-ink-soft hover:text-accent-fg">
              {(feePct * 100).toFixed(feePct * 100 % 1 ? 1 : 0)}% <Pencil className="h-3 w-3 text-faint" />
            </button>
          )}
        </div>
      </div>

      {/* Add form */}
      {adding && (
        <div className="bg-panel rounded-xl border border-accent/40 p-4 sm:p-5 space-y-3">
          <p className="text-sm font-semibold text-ink-soft">Record a client payment</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1"><Label>Date</Label><Input type="date" value={form.paid_date} onChange={e => setForm({ ...form, paid_date: e.target.value })} /></div>
            <div className="space-y-1"><Label>Amount</Label><Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0" /></div>
            <div className="space-y-1"><Label>Method</Label>
              <select value={form.method} onChange={e => setForm({ ...form, method: e.target.value })} className="w-full rounded-md border border-muted2 bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none">
                {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="space-y-1"><Label>Memo / check #</Label><Input value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} placeholder="e.g. 1043" /></div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-ink-soft"><input type="checkbox" className="accent-[#C9F24A]" checked={form.retainer} onChange={e => setForm({ ...form, retainer: e.target.checked })} /> Retainer / deposit</label>
            <label className="flex items-center gap-2 text-sm text-ink-soft"><input type="checkbox" className="accent-[#C9F24A]" checked={form.qb_entered} onChange={e => setForm({ ...form, qb_entered: e.target.checked })} /> Entered in QuickBooks</label>
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" onClick={() => { setAdding(false); setForm({ ...blank }) }}>Cancel</Button>
              <Button onClick={addPayment} disabled={saving || !form.amount}>{saving ? 'Saving…' : 'Add'}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Ledger */}
      {payments.length === 0 ? (
        <div className="bg-panel rounded-xl border border-line p-10 text-center"><Wallet className="h-8 w-8 text-faint mx-auto mb-3" /><p className="text-sm text-muted-fg">No client payments recorded yet.</p></div>
      ) : (
        <div className="bg-panel rounded-xl border border-line overflow-hidden">
          <div className="hidden md:grid grid-cols-[7rem_1fr_8rem_1fr_5rem_3rem] gap-2 px-4 py-2.5 border-b border-line-soft text-xs font-semibold text-faint uppercase tracking-wide">
            <span>Date</span><span>Memo</span><span>Method</span><span className="text-right">Amount</span><span>QB</span><span />
          </div>
          <div className="divide-y divide-line-soft">
            {payments.map(p => editingId === p.id ? (
              <div key={p.id} className="px-4 py-3 grid grid-cols-2 sm:grid-cols-5 gap-2 bg-accent-tint/30 items-center">
                <Input type="date" value={editForm.paid_date} onChange={e => setEditForm({ ...editForm, paid_date: e.target.value })} />
                <Input value={editForm.memo} onChange={e => setEditForm({ ...editForm, memo: e.target.value })} placeholder="Memo" />
                <select value={editForm.method} onChange={e => setEditForm({ ...editForm, method: e.target.value })} className="rounded-md border border-line bg-panel px-2 py-2 text-sm">
                  {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <Input type="number" value={editForm.amount} onChange={e => setEditForm({ ...editForm, amount: e.target.value })} />
                <div className="flex gap-1 justify-end">
                  <button onClick={() => saveEdit(p.id)} className="p-1.5 rounded-lg text-accent-ink bg-accent"><Check className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg text-faint hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ) : (
              <div key={p.id} className="group md:grid md:grid-cols-[7rem_1fr_8rem_1fr_5rem_3rem] md:gap-2 md:items-center px-4 py-3 hover:bg-surface">
                <span className="text-sm text-ink-soft">{p.paid_date ? new Date(p.paid_date + 'T00:00:00').toLocaleDateString() : '—'}</span>
                <span className="text-sm text-ink-soft truncate">{p.memo || '—'}{p.retainer && <span className="ml-2 text-[10px] rounded-full bg-info-tint text-info px-1.5 py-0.5">retainer</span>}</span>
                <span className="text-sm text-muted-fg">{p.method || '—'}</span>
                <span className="text-sm font-semibold text-success md:text-right block">{money(p.amount)}</span>
                <span className="text-xs">{p.qb_entered ? <span className="text-success">✓ QB</span> : <span className="text-faint">—</span>}</span>
                <div className="flex justify-end gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setEditingId(p.id); setEditForm({ paid_date: p.paid_date ?? '', amount: String(p.amount), method: p.method ?? 'Check', memo: p.memo ?? '', retainer: p.retainer, qb_entered: p.qb_entered }) }} className="p-1.5 rounded-lg text-faint hover:bg-muted"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => remove(p)} className="p-1.5 rounded-lg text-faint hover:bg-danger-tint hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:grid grid-cols-[7rem_1fr_8rem_1fr_5rem_3rem] gap-2 px-4 py-3 border-t-2 border-line bg-surface text-sm font-bold text-ink-soft">
            <span>Total</span><span /><span /><span className="text-right text-success">{money(s?.received ?? 0)}</span><span /><span />
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return <div><p className="text-xs text-faint mb-0.5">{label}</p><p className={cn('font-semibold text-ink-soft', cls)}>{value}</p></div>
}
