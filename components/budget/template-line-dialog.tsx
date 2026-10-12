'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useDeleteGuard } from '@/components/ui/delete-guard'
import { autoFocusOnDesktop } from '@/lib/auto-focus'
import { fetchProblem } from '@/lib/fetch-error'
import { toAmount } from '@/lib/schedule-dependencies'
import { cleanTemplateLine, type CostType } from '@/lib/budget-template-line'
import { X } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Add, change or remove one budget template line - ONE dialog for both doors:
// the Budget Templates page, and a house model's own budget in the model editor.
//
// "Adding one expense line to every house on a model is a bit much and back and
// forth. Why can't we just have add and update". The first version made it
// three screens: the template page to add the line, back to the development,
// then Apply. From a model, `follow` puts the change on that model's houses in
// the SAME press - ticked by default, through the same apply route, so a figure
// somebody changed by hand on one house is still left alone and named.
// ─────────────────────────────────────────────────────────────────────────────

export interface TemplateLineItem {
  id?: string; description: string
  /** NUMERIC - a string off the wire. */
  default_amount: number | string | null
  category?: string | null; cost_code?: string | null; cost_type?: string | null
}

/** Put the saved line on houses too. `run` answers with what happened, in words. */
export interface FollowHouses { label: string; run: () => Promise<string> }

async function call(url: string, init: RequestInit = {}) {
  const { data: { session } } = await createClient().auth.getSession()
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}`, ...(init.headers ?? {}) },
  })
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as any }
}

export function SmallDialog({ title, onClose, busy, children, footer }: {
  title: string; onClose: () => void; busy?: boolean; children: React.ReactNode; footer: React.ReactNode
}) {
  return (
    <div className="overlay items-center justify-center bg-black/50" data-overlay onClick={() => !busy && onClose()}>
      <div className="flex w-full max-w-lg flex-col rounded-xl bg-panel shadow-xl" onClick={e => e.stopPropagation()}>
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

/** One dialog, one save. `onSaved` gets a sentence when houses were updated too. */
export function TemplateLineDialog({ templateId, item, follow, onClose, onSaved }: {
  templateId: string; item: TemplateLineItem | null; follow?: FollowHouses
  onClose: () => void; onSaved: (said?: string) => void
}) {
  const guardDelete = useDeleteGuard()
  const [description, setDescription] = useState(item?.description ?? '')
  const [category, setCategory] = useState(item?.category && item.category !== 'General' ? item.category : '')
  const [amount, setAmount] = useState(() => { const a = toAmount(item?.default_amount); return a == null ? '' : String(a) })
  const [costType, setCostType] = useState<CostType>(item?.cost_type === 'soft' ? 'soft' : 'hard')
  const [updateHouses, setUpdateHouses] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const base = `/api/budget-templates/${templateId}/items`

  async function save() {
    const body = { description, category, cost_code: item?.cost_code ?? null, default_amount: amount.replace(/[$,\s]/g, ''), cost_type: costType }
    const checked = cleanTemplateLine(body)
    if (!checked.ok) { setError(checked.error); return }
    setBusy(true); setError(null)
    try {
      const r = item?.id
        ? await call(`${base}/${item.id}`, { method: 'PATCH', body: JSON.stringify(body) })
        : await call(base, { method: 'POST', body: JSON.stringify(body) })
      if (!r.ok) { setError(r.data.error ?? 'Could not save the line.'); return }
      if (!follow || !updateHouses) { onSaved(); return }
      // The template is saved whatever happens next - say so if the houses are not.
      try {
        onSaved(await follow.run())
      } catch (e) {
        onSaved(`Saved to the template, but the houses were not updated: ${e instanceof Error ? e.message : 'try Apply on the model'}.`)
      }
    } catch (e) { setError(fetchProblem(e, 'saving the line')) } finally { setBusy(false) }
  }

  function removeLine() {
    if (!item?.id) return
    guardDelete(async () => {
      const r = await call(`${base}/${item.id}`, { method: 'DELETE' })
      if (!r.ok) { setError(r.data.error ?? 'Could not remove the line.'); return }
      onSaved()
    }, { label: `"${item.description}"`, body: 'Houses already given this line keep it.' })
  }

  return (
    <SmallDialog title={item ? 'Edit line' : 'Add line'} onClose={onClose} busy={busy}
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? 'Saving…' : item ? 'Save Changes' : 'Add Line'}</Button></>}>
      <div className="space-y-1.5">
        <Label htmlFor="line-desc">Description *</Label>
        <Input id="line-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Framing labor" autoFocus={autoFocusOnDesktop()} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="line-amount">Amount <span className="text-faint font-normal">(optional)</span></Label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-fg">$</span>
          <Input id="line-amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className="min-w-0 flex-1" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="line-cat">Category <span className="text-faint font-normal">(optional)</span></Label>
        <Input id="line-cat" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Framing" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="line-type">Cost type *</Label>
        <Select id="line-type" value={costType} onChange={e => setCostType(e.target.value === 'soft' ? 'soft' : 'hard')}>
          <option value="hard">Hard cost - the build itself</option>
          <option value="soft">Soft cost - permits, plans, fees, insurance</option>
        </Select>
      </div>
      {follow ? (
        <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-surface px-3 py-2.5">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#C9F24A]" checked={updateHouses} onChange={e => setUpdateHouses(e.target.checked)} />
          <span className="text-sm text-ink">
            Also put this on {follow.label}
            <span className="block text-xs text-muted-fg">A house where somebody changed this line by hand keeps its own figure.</span>
          </span>
        </label>
      ) : item && (
        <p className="text-xs text-faint">
          This changes the template. Houses on a model using it change when you edit the line from the model, or press Apply.
        </p>
      )}
      {item?.id && (
        <button type="button" onClick={removeLine} disabled={busy} className="text-sm font-semibold text-danger hover:underline">Remove this line</button>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </SmallDialog>
  )
}
