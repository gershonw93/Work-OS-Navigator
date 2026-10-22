'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Landmark, Loader2 } from 'lucide-react'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { fetchProblem } from '@/lib/fetch-error'

// ─────────────────────────────────────────────────────────────────────────────
// "Where things go in QuickBooks": one dropdown per push kind, listed live from
// the connected QuickBooks company (app/api/quickbooks/accounts). The first
// option is Automatic and SAYS what Automatic does, so leaving it alone is an
// informed choice rather than a blank. Each dropdown saves on change and says
// so; a list that could not be read says that instead of showing nothing.
// ─────────────────────────────────────────────────────────────────────────────

interface Option { id: string; name: string; type: string | null }
interface KindRow {
  kind: string; label: string; help: string; automatic: string
  options: Option[] | null; error: string | null
  chosen: { id: string; name: string | null } | null
  chosenMissing: boolean
}

export function QuickBooksAccounts({ headers, onSaved }: {
  headers: () => Promise<Record<string, string>>
  /** The card reloads its log, where the change is recorded. */
  onSaved: () => void
}) {
  const [rows, setRows] = useState<KindRow[] | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [saving, setSaving] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const alive = useRef(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/quickbooks/accounts', { headers: await headers() })
      const body = await res.json().catch(() => ({}))
      if (!alive.current) return
      if (!res.ok) { setState('failed'); return }
      setRows(body.kinds ?? [])
      setState('ready')
    } catch {
      if (alive.current) setState('failed')
    }
  }, [headers])

  useEffect(() => {
    alive.current = true
    load()
    return () => { alive.current = false }
  }, [load])

  async function choose(row: KindRow, qboId: string) {
    setSaving(row.kind); setMsg(null)
    try {
      const res = await fetch('/api/quickbooks/accounts', {
        method: 'POST', headers: await headers(), body: JSON.stringify({ kind: row.kind, qboId: qboId || null }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg({ ok: false, text: body.error ?? 'Could not save.' }); return }
      const name = body.chosen?.name
      setMsg({ ok: true, text: `${row.label} ${name ? name : `Automatic (${row.automatic})`}. Applies to what is pushed from now on.` })
      await load()
      onSaved()
    } catch (e) {
      setMsg({ ok: false, text: fetchProblem(e, 'saving that choice') })
      await load()
    } finally {
      setSaving('')
    }
  }

  return (
    <div className="rounded-xl border border-line bg-panel p-6">
      <h4 className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
        <Landmark className="h-4 w-4" /> Where things go in QuickBooks
      </h4>
      <p className="mb-4 text-sm text-muted-fg">
        Choose the accounts your pushes land in. Automatic is fine for most companies; pick one when you have more than one bank account or a specific expense account for subs. A change applies to what is pushed from then on - records already in QuickBooks are not moved.
      </p>

      {state === 'loading' && (
        <p className="flex items-center gap-2 text-sm text-muted-fg"><Loader2 className="h-4 w-4 animate-spin" /> Reading your QuickBooks accounts…</p>
      )}
      {state === 'failed' && (
        <p className="text-sm text-danger">Could not read your QuickBooks accounts. Pushes still use Automatic. Reload to try again.</p>
      )}
      {state === 'ready' && rows && (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map(row => (
            <div key={row.kind} className="min-w-0">
              <Label htmlFor={`qbo-${row.kind}`}>{row.label} (optional)</Label>
              {row.options ? (
                <div className="mt-1.5 flex items-center gap-2">
                  <Select id={`qbo-${row.kind}`} className="w-full" value={row.chosen?.id ?? ''}
                    disabled={saving === row.kind}
                    onChange={(e: any) => choose(row, e.target.value)}>
                    <option value="">{`Automatic - ${row.automatic}`}</option>
                    {row.chosenMissing && row.chosen && (
                      <option value={row.chosen.id}>{`${row.chosen.name ?? row.chosen.id} (no longer active in QuickBooks)`}</option>
                    )}
                    {row.options.map(o => <option key={o.id} value={o.id}>{o.type ? `${o.name} (${o.type})` : o.name}</option>)}
                  </Select>
                  {saving === row.kind && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-fg" />}
                </div>
              ) : (
                <p className="mt-1.5 text-sm text-danger">{row.error ?? 'Could not read this list from QuickBooks.'}</p>
              )}
              {row.chosenMissing && (
                <p className="mt-1 text-xs text-warn">The account chosen here is no longer active in QuickBooks, so pushes that use it will fail. Pick another or set it back to Automatic.</p>
              )}
              <p className="mt-1 text-xs text-muted-fg">{row.help}</p>
            </div>
          ))}
        </div>
      )}

      {msg && (
        <div className={`mt-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-success-tint text-success' : 'bg-danger-tint text-danger'}`}>
          {msg.text}
        </div>
      )}
    </div>
  )
}
