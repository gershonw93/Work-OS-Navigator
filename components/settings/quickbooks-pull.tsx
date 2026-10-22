'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeftRight, Loader2, RefreshCw } from 'lucide-react'
import { formatDate } from '@/lib/dates'
import { fetchProblem } from '@/lib/fetch-error'

// ─────────────────────────────────────────────────────────────────────────────
// "Bring changes back from QuickBooks" (lib/quickbooks-pull.ts). Off by
// default. Says exactly what comes back and what does not, because "two-way"
// read loosely promises a product that does not exist: records created only in
// QuickBooks stay there.
// ─────────────────────────────────────────────────────────────────────────────

interface PullStatus {
  enabled: boolean
  since: string | null
  webhookConfigured: boolean
  canManage: boolean
  recent: { entity: string; operation: string; status: string; message: string | null; received_at: string }[]
}

export function QuickBooksPull({ headers, onChanged }: {
  headers: () => Promise<Record<string, string>>
  /** The card reloads its log, where what came back is recorded. */
  onChanged: () => void
}) {
  const [st, setSt] = useState<PullStatus | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [busy, setBusy] = useState<'' | 'toggle' | 'check'>('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/quickbooks/pull', { headers: await headers() })
      if (!res.ok) { setState('failed'); return }
      setSt(await res.json()); setState('ready')
    } catch { setState('failed') }
  }, [headers])
  useEffect(() => { load() }, [load])

  async function toggle() {
    if (!st || busy) return
    setBusy('toggle'); setMsg(null)
    try {
      const res = await fetch('/api/quickbooks/pull', { method: 'PATCH', headers: await headers(), body: JSON.stringify({ enabled: !st.enabled }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) setMsg({ ok: false, text: d.error ?? 'Could not save.' })
      else setMsg({ ok: true, text: d.enabled ? 'On. Changes made in QuickBooks from now on come back.' : 'Off. Nothing comes back from QuickBooks.' })
    } catch (e) {
      setMsg({ ok: false, text: fetchProblem(e, 'saving that') })
    } finally {
      setBusy(''); await load(); onChanged()
    }
  }

  async function checkNow() {
    if (busy) return
    setBusy('check'); setMsg(null)
    try {
      const res = await fetch('/api/quickbooks/pull', { method: 'POST', headers: await headers() })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) setMsg({ ok: false, text: d.error ?? 'Could not read QuickBooks.' })
      else {
        const parts = [d.applied && `${d.applied} brought back`, d.errors && `${d.errors} could not be`].filter(Boolean)
        setMsg({ ok: !d.errors, text: parts.length ? `Checked: ${parts.join(', ')}. Details are under Recent sync activity.` : 'Checked. Nothing changed in QuickBooks that affects SyteNav.' })
      }
    } catch (e) {
      setMsg({ ok: false, text: fetchProblem(e, 'reading QuickBooks') })
    } finally {
      setBusy(''); await load(); onChanged()
    }
  }

  return (
    <div className="rounded-xl border border-line bg-panel p-6">
      <h4 className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
        <ArrowLeftRight className="h-4 w-4" /> Bring changes back from QuickBooks
      </h4>
      <p className="mb-3 text-sm text-muted-fg">
        When your bookkeeper works in QuickBooks, SyteNav can find out. A payment received there against a SyteNav invoice is added to the job, a sub&apos;s bill paid there reads paid, and a void, delete or amount change made there to something SyteNav sent is flagged on that record for you to check - never changed or deleted for you. Invoices, bills and payments created only in QuickBooks stay in QuickBooks.
      </p>

      {state === 'loading' && <p className="flex items-center gap-2 text-sm text-muted-fg"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
      {state === 'failed' && <p className="text-sm text-danger">Could not read this setting. Reload to try again.</p>}
      {state === 'ready' && st && (
        <>
          <label className="flex items-center gap-3 text-sm text-ink">
            <input type="checkbox" className="h-5 w-5 accent-[#C9F24A]" checked={st.enabled} disabled={busy === 'toggle' || !st.canManage} onChange={toggle} />
            <span className="font-medium">{st.enabled ? 'On' : 'Off'}</span>
            {busy === 'toggle' && <Loader2 className="h-4 w-4 animate-spin text-muted-fg" />}
          </label>
          {st.enabled && (
            <div className="mt-3 space-y-2 text-sm text-muted-fg">
              <p>
                {st.webhookConfigured
                  ? 'QuickBooks tells SyteNav about changes as they happen, and SyteNav checks again every morning.'
                  : 'SyteNav checks QuickBooks every morning. To see a change sooner, press Check QuickBooks now.'}
                {st.since && ` Last checked ${formatDate(st.since)}.`}
              </p>
              <button type="button" onClick={checkNow} disabled={!!busy}
                className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-muted disabled:opacity-50">
                {busy === 'check' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check QuickBooks now
              </button>
            </div>
          )}
        </>
      )}

      {msg && (
        <div className={`mt-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-success-tint text-success' : 'bg-danger-tint text-danger'}`}>
          {msg.text}
        </div>
      )}
    </div>
  )
}
