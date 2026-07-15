'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plug, Check, Loader2, RefreshCw, Users, Building2, AlertTriangle, FileText, Banknote } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Connection {
  realm_id: string
  qbo_company_name: string | null
  environment: string
  status: string
  connected_at: string
}
interface LogRow {
  entity_type: string; action: string | null; status: string
  qbo_id: string | null; message: string | null; created_at: string
}
interface Status {
  configured: boolean
  environment: string
  canManage: boolean
  connection: Connection | null
  log: LogRow[]
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await createClient().auth.getSession()
  const token = data?.session?.access_token
  return token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { 'Content-Type': 'application/json' }
}

export function QuickBooksCard() {
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string>('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/quickbooks/status', { headers: await authHeaders() })
    if (res.ok) setStatus(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    // Surface the OAuth callback result (redirect adds ?qbo=...).
    const p = new URLSearchParams(window.location.search)
    const qbo = p.get('qbo')
    if (qbo === 'connected') setMsg({ ok: true, text: 'QuickBooks connected.' })
    else if (qbo === 'denied') setMsg({ ok: false, text: 'Connection cancelled.' })
    else if (qbo === 'error') setMsg({ ok: false, text: 'Could not complete the QuickBooks connection.' })
    if (qbo) {
      const url = new URL(window.location.href); url.searchParams.delete('qbo')
      window.history.replaceState({}, '', url.toString())
    }
  }, [load])

  async function connect() {
    setBusy('connect'); setMsg(null)
    try {
      const res = await fetch('/api/quickbooks/connect', { headers: await authHeaders() })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not start the connection')
      window.location.href = data.url
    } catch (e: any) { setMsg({ ok: false, text: e.message }); setBusy('') }
  }

  async function disconnect() {
    if (!confirm('Disconnect QuickBooks? Synced records keep their links, so reconnecting the same file will still recognize them.')) return
    setBusy('disconnect'); setMsg(null)
    try {
      const res = await fetch('/api/quickbooks/disconnect', { method: 'POST', headers: await authHeaders() })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed')
      await load(); setMsg({ ok: true, text: 'Disconnected.' })
    } catch (e: any) { setMsg({ ok: false, text: e.message }) } finally { setBusy('') }
  }

  async function sync(entity: 'customers' | 'vendors' | 'bills' | 'payments') {
    setBusy(entity); setMsg(null)
    try {
      const res = await fetch('/api/quickbooks/sync', {
        method: 'POST', headers: await authHeaders(), body: JSON.stringify({ entity }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sync failed')
      const s = data.summary
      setMsg({ ok: s.errors === 0, text: `${entity}: ${s.synced} synced, ${s.skipped} already there, ${s.errors} error${s.errors === 1 ? '' : 's'}.` })
      await load()
    } catch (e: any) { setMsg({ ok: false, text: e.message }) } finally { setBusy('') }
  }

  if (loading) return <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-fg" /></div>

  const connected = status?.connection?.status === 'connected'

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-line bg-panel p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-tint text-accent-fg">
            <Plug className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-ink">QuickBooks Online</h3>
              {status?.environment === 'sandbox' && (
                <span className="rounded-full bg-warn-tint px-2 py-0.5 text-xs font-semibold text-warn">Sandbox</span>
              )}
              {connected && (
                <span className="inline-flex items-center gap-1 rounded-full bg-success-tint px-2 py-0.5 text-xs font-semibold text-success">
                  <Check className="h-3 w-3" /> Connected
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-fg">
              Push your customers, subs (vendors), invoices and payments into QuickBooks so nothing gets double-entered.
            </p>

            {!status?.configured && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-warn-tint p-3 text-sm text-warn">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>QuickBooks is not set up on the server yet. An Intuit Developer app (client ID/secret) needs to be added before you can connect.</span>
              </div>
            )}

            {connected && (
              <p className="mt-2 text-sm text-muted-fg">
                Linked to <strong className="text-ink">{status?.connection?.qbo_company_name || `Realm ${status?.connection?.realm_id}`}</strong>
              </p>
            )}
          </div>
        </div>

        {msg && (
          <div className={cn('mt-4 rounded-lg px-3 py-2 text-sm', msg.ok ? 'bg-success-tint text-success' : 'bg-danger-tint text-danger')}>
            {msg.text}
          </div>
        )}

        {status?.canManage && (
          <div className="mt-5 flex flex-wrap gap-2">
            {!connected ? (
              <button
                onClick={connect}
                disabled={!status?.configured || busy === 'connect'}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50"
              >
                {busy === 'connect' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
                Connect QuickBooks
              </button>
            ) : (
              <>
                <button onClick={() => sync('customers')} disabled={!!busy}
                  className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">
                  {busy === 'customers' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                  Sync customers
                </button>
                <button onClick={() => sync('vendors')} disabled={!!busy}
                  className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">
                  {busy === 'vendors' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
                  Sync subs (vendors)
                </button>
                <button onClick={() => sync('bills')} disabled={!!busy}
                  className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">
                  {busy === 'bills' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  Sync bills
                </button>
                <button onClick={() => sync('payments')} disabled={!!busy}
                  className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">
                  {busy === 'payments' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                  Sync payments
                </button>
                <button onClick={disconnect} disabled={!!busy}
                  className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-danger disabled:opacity-50">
                  Disconnect
                </button>
              </>
            )}
          </div>
        )}

        <p className="mt-4 text-xs text-muted-fg">
          Pushes one way into QuickBooks: customers, subs (vendors), sub bills (approved/paid invoices), and client payments (as sales receipts). Bills and payments auto-create their vendor/customer if needed. Re-running skips anything already synced.
        </p>
      </div>

      {connected && (status?.log?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-line bg-panel p-6">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <RefreshCw className="h-4 w-4" /> Recent sync activity
          </h4>
          <div className="space-y-1.5">
            {status!.log.map((l, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 text-ink">
                  <span className={cn('inline-flex h-2 w-2 rounded-full', l.status === 'success' ? 'bg-success' : 'bg-danger')} />
                  <span className="capitalize">{l.entity_type}</span>
                  {l.qbo_id && <span className="inline-flex items-center gap-0.5 text-xs text-muted-fg">QBO #{l.qbo_id}</span>}
                </span>
                <span className="truncate text-right text-xs text-muted-fg">
                  {l.status === 'error' ? l.message : new Date(l.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
