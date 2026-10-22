'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plug, Check, Loader2, RefreshCw, Users, Building2, AlertTriangle, FileText, Banknote, Ban } from 'lucide-react'
import { cn } from '@/lib/utils'

import { formatDate } from '@/lib/dates'
import { useDeleteGuard } from '@/components/ui/delete-guard'
import { fetchProblem } from '@/lib/fetch-error'
import { QuickBooksAccounts } from '@/components/settings/quickbooks-accounts'
import { QuickBooksPull } from '@/components/settings/quickbooks-pull'
interface Connection {
  realm_id: string
  qbo_company_name: string | null
  environment: string
  status: string
  connected_at: string
  last_refreshed_at?: string | null
  last_refresh_error?: string | null
}
type Retry = { kind: 'sync'; entity: string; ids: string[] } | { kind: 'hint'; text: string }
interface LogRow {
  entity_type: string; entity_id?: string | null; record_label?: string | null; action: string | null; status: string
  qbo_id: string | null; message: string | null; created_at: string
  /** 'pull' when the change came BACK from QuickBooks (lib/quickbooks-pull.ts). */
  direction?: string | null
  /** A later success for the same record put this failure right. */
  resolved?: boolean
  /** How to retry a failure that still stands (lib/qbo-log-retry.ts). */
  retry?: Retry | null
}

/** One sync-log row in words: what happened to which record. */
const ACTION_WORD: Record<string, string> = { create: 'Pushed', update: 'Updated', void: 'Voided' }
/** "Push failed", never "Pushed failed" - the pilot's first red row read that way. */
const FAIL_WORD: Record<string, string> = { create: 'Push', update: 'Update', void: 'Void' }
const ENTITY_WORD: Record<string, string> = {
  client_invoice: 'client invoice', payment: 'client payment', client_payment: 'client payment',
  bill: 'sub bill', bill_payment: 'bill payment', customer: 'customer', vendor: 'sub (vendor)', connection: 'QuickBooks connection',
}
function logLine(l: LogRow): string {
  if (l.direction === 'pull') {
    const what = ENTITY_WORD[l.entity_type] ?? l.entity_type.replace(/_/g, ' ')
    return `${l.status === 'error' ? 'Could not bring back' : 'From QuickBooks'}: ${what}${l.record_label ? ` ${l.record_label}` : ''}`
  }
  const verb = l.status === 'error'
    ? `${FAIL_WORD[l.action ?? 'create'] ?? 'Push'} failed`
    : ACTION_WORD[l.action ?? 'create'] ?? 'Pushed'
  const what = ENTITY_WORD[l.entity_type] ?? l.entity_type.replace(/_/g, ' ')
  return `${verb}: ${what}${l.record_label ? ` ${l.record_label}` : ''}`
}
interface Status {
  configured: boolean
  configProblem?: string | null
  redirectUri?: string
  /** The QuickBooks file this account's ids belong to. */
  boundFile?: { realm_id: string; environment: string } | null
  /** Those ids are in the OTHER environment's file - connect is refused until Start fresh. */
  boundElsewhere?: boolean
  syncFrom?: string | null
  environment: string
  envSetting?: { qboEnvRaw: string | null; resolvesTo: string; productionClientId: boolean; productionClientSecret: boolean; tokenKey: boolean; vercelEnv: string | null }
  canManage: boolean
  connection: Connection | null
  unsyncedPayments: number
  unsyncedBills: number
  unsyncedClientInvoices: number
  unsentVoids?: number
  lastSyncAt: string | null
  log: LogRow[]
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await createClient().auth.getSession()
  const token = data?.session?.access_token
  return token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { 'Content-Type': 'application/json' }
}

export function QuickBooksCard() {
  const guardDelete = useDeleteGuard()
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
    // The two refusals from the callback, in words that say what to do.
    else if (qbo === 'other_file') setMsg({ ok: false, text: 'That is a different QuickBooks company from the one your records were sent to, so it was not connected. Reconnect the same company, or use Start fresh below to move to this one.' })
    else if (qbo === 'file_taken') setMsg({ ok: false, text: 'That QuickBooks company is already connected to another SyteNav account. One company file can be connected to one account.' })
    if (qbo) {
      const url = new URL(window.location.href); url.searchParams.delete('qbo')
      window.history.replaceState({}, '', url.toString())
    }
  }, [load])

  async function connect() {
    setBusy('connect'); setMsg(null)
    try {
      // Inside the phone app this handshake has to leave the app entirely.
      // Intuit refuses to render its consent screen in an embedded webview,
      // and Apple treats an embedded one as still being inside the app - so
      // Safari, properly, and `native=1` so the callback knows to send the
      // person back here rather than stranding them in the browser.
      const native = (window as any).Capacitor?.isNativePlatform?.() === true
      const res = await fetch(`/api/quickbooks/connect${native ? '?native=1' : ''}`, { headers: await authHeaders() })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not start the connection')
      if (native) {
        const { Browser } = await import('@capacitor/browser')
        await Browser.open({ url: data.url })
        // Busy stays on: the person is in Safari now. The deep link back
        // reloads this page with ?qbo=..., which is what clears it.
        return
      }
      window.location.href = data.url
    } catch (e: any) { setMsg({ ok: false, text: fetchProblem(e, 'connecting to QuickBooks') }); setBusy('') }
  }

  function disconnect() {
    guardDelete(async () => {
    setBusy('disconnect'); setMsg(null)
    try {
      const res = await fetch('/api/quickbooks/disconnect', { method: 'POST', headers: await authHeaders() })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed')
      await load(); setMsg({ ok: true, text: 'Disconnected.' })
    } catch (e: any) { setMsg({ ok: false, text: fetchProblem(e, 'talking to QuickBooks') }) } finally { setBusy('') }
    }, {
      label: 'this QuickBooks connection',
      title: 'Disconnect QuickBooks?',
      body: 'SyteNav is removed from your QuickBooks Connected Apps and stops sending. Nothing already in QuickBooks is changed. Synced records keep their links, so reconnecting the same company later recognises them.',
      confirmLabel: 'Disconnect',
    })
  }

  /**
   * Rewrite memo + SN reference on everything already in QuickBooks.
   *
   * Updates records IN PLACE - re-pushing would duplicate them. The server
   * does 25 per call (each costs two QuickBooks round trips inside a 60s
   * route ceiling) and reports what remains, so this loops until done with a
   * live count rather than timing out on a big backlog.
   */
  async function refreshFormatting() {
    setBusy('refresh'); setMsg(null)
    try {
      let done = 0
      let errors = 0
      for (;;) {
        const res = await fetch('/api/quickbooks/sync', {
          method: 'POST', headers: await authHeaders(), body: JSON.stringify({ entity: 'refresh' }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Refresh failed')
        done += data.summary.synced
        errors += data.summary.errors
        if (!data.remaining) break
        setMsg({ ok: true, text: `Updating formatting… ${done} done, ${data.remaining} to go.` })
      }
      setMsg({ ok: errors === 0, text: `Formatting updated on ${done} record${done === 1 ? '' : 's'} in QuickBooks${errors ? `, ${errors} error${errors === 1 ? '' : 's'} (see the log)` : ''}.` })
      await load()
    } catch (e: any) { setMsg({ ok: false, text: fetchProblem(e, 'talking to QuickBooks') }) } finally { setBusy('') }
  }

  async function sync(entity: 'customers' | 'vendors' | 'bills' | 'bill-payments' | 'payments' | 'client-invoices' | 'voids') {
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
    } catch (e: any) { setMsg({ ok: false, text: fetchProblem(e, 'talking to QuickBooks') }) } finally { setBusy('') }
  }

  /** Retry one failed record from the log - the same Sync branch, for that record alone. */
  async function retryRow(l: LogRow) {
    if (l.retry?.kind !== 'sync') return
    setBusy(`retry:${l.entity_id}`); setMsg(null)
    try {
      const res = await fetch('/api/quickbooks/sync', {
        method: 'POST', headers: await authHeaders(), body: JSON.stringify({ entity: l.retry.entity, ids: l.retry.ids }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Retry failed')
      const r = data.results?.[0]
      // No result is not a success: the record was not waiting to be sent
      // (already there, or no longer pushable), and saying "Sent" would claim
      // a push that never happened.
      setMsg(!r
        ? { ok: false, text: 'Nothing was resent for that record - it is not waiting to be sent. Check it in SyteNav.' }
        : r.status === 'error'
          ? { ok: false, text: `Still failing: ${r.message ?? 'no reason given'}` }
          : { ok: true, text: r.status === 'skipped' ? 'Already in QuickBooks.' : 'Sent to QuickBooks.' })
      await load()
    } catch (e: any) { setMsg({ ok: false, text: fetchProblem(e, 'talking to QuickBooks') }) } finally { setBusy('') }
  }

  /**
   * Move this account to a different QuickBooks file. Its ids belong to the
   * old one; they are archived and cleared, and only money recorded from now
   * on is pushed by Sync, so the new file is not filled with history.
   */
  function startFresh() {
    guardDelete(async () => {
      setBusy('fresh'); setMsg(null)
      try {
        const res = await fetch('/api/quickbooks/start-fresh', {
          method: 'POST', headers: await authHeaders(), body: JSON.stringify({ confirm: true }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not start fresh')
        await load()
        setMsg({ ok: true, text: `Done - ${data.archived} record${data.archived === 1 ? '' : 's'} unlinked from the old QuickBooks company. Connect the new one now.` })
      } catch (e: any) { setMsg({ ok: false, text: fetchProblem(e, 'starting fresh') }) } finally { setBusy('') }
    }, {
      label: 'the links to the old QuickBooks company',
      title: 'Start fresh with a different QuickBooks company?',
      body: 'Every record here forgets which QuickBooks record it was in the old company (a copy is kept). Nothing in either QuickBooks company is changed or deleted. After you connect the new company, only invoices, bills and payments recorded from now on are sent across by Sync - older ones are left for your bookkeeper.',
      confirmLabel: 'Start fresh',
    })
  }

  if (loading) return <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-fg" /></div>

  const connected = status?.connection?.status === 'connected'
  // Connected once, and the push can no longer use it: Intuit refused the
  // sign-in, or it was made against the other environment.
  const needsReconnect = !!status?.connection && !connected
  const elsewhere = !!status?.boundElsewhere

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
                <span className="whitespace-nowrap rounded-full bg-warn-tint px-2 py-0.5 text-xs font-semibold text-warn">Sandbox</span>
              )}
              {connected && (
                <span className="whitespace-nowrap inline-flex items-center gap-1 rounded-full bg-success-tint px-2 py-0.5 text-xs font-semibold text-success">
                  <Check className="h-3 w-3" /> Connected
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-fg">
              QuickBooks Online, one-way push. Four kinds of record go across: the invoices you send your client, the payments your client makes against them, the bills your subs send you, and the payments you make on those bills. Customers and subs are added as they are needed, so nothing gets double-entered.
            </p>

            {!status?.configured && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-warn-tint p-3 text-sm text-warn">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  QuickBooks is not set up on the server yet{status?.configProblem ? `: ${status.configProblem}` : ''}.
                  {status?.canManage && status?.redirectUri && <> The redirect URI to register with Intuit is <code className="break-all">{status.redirectUri}</code>.</>}
                </span>
              </div>
            )}

            {connected && (
              <p className="mt-2 text-sm text-muted-fg">
                Linked to <strong className="text-ink">{status?.connection?.qbo_company_name || `Realm ${status?.connection?.realm_id}`}</strong>
                {status?.connection?.last_refreshed_at && <> · sign-in renewed {formatDate(status.connection.last_refreshed_at)}</>}
              </p>
            )}

            {/* WHAT THE SERVER READS, for an admin. "It still says Sandbox"
                was unanswerable from the screen: the variable was set
                somewhere, and the deploy read something else. */}
            {status?.canManage && status?.envSetting && (
              <p className="mt-2 text-xs text-muted-fg break-words">
                Server setting ({status.envSetting.vercelEnv ?? 'unknown'} deploy): QBO_ENV = {status.envSetting.qboEnvRaw ?? 'not set'} (reads as {status.envSetting.resolvesTo})
                {' · '}production client ID {status.envSetting.productionClientId ? 'set' : 'missing'}
                {' · '}production secret {status.envSetting.productionClientSecret ? 'set' : 'missing'}
                {' · '}token key {status.envSetting.tokenKey ? 'set' : 'missing'}
              </p>
            )}

            {/* A SIGN-IN THAT STOPPED WORKING SAYS SO, LOUDLY. It used to read
                as "not connected" - a normal state - so pushes stopped and
                nothing on screen changed. */}
            {needsReconnect && !elsewhere && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-danger-tint p-3 text-sm text-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {status?.connection?.status === 'wrong_environment'
                    ? 'This connection was made to a QuickBooks test company, and SyteNav now sends to real QuickBooks companies.'
                    : `QuickBooks no longer accepts SyteNav's sign-in for ${status?.connection?.qbo_company_name ?? 'your company'}${status?.connection?.last_refresh_error ? ` (${status.connection.last_refresh_error})` : ''}.`}
                  {' '}Nothing is being sent to QuickBooks until you reconnect. Records you add meanwhile are sent by Sync once you do.
                </span>
              </div>
            )}

            {/* THE IDS BELONG TO ANOTHER FILE. Connect would be refused by the
                callback, so the card says why and offers the deliberate way. */}
            {elsewhere && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-warn-tint p-3 text-sm text-warn">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Your records were sent to a QuickBooks {status?.boundFile?.environment === 'sandbox' ? 'test (sandbox) ' : ''}company that this server no longer connects to.
                  To use a different QuickBooks company, start fresh: the links to the old one are put aside and only money recorded from then on is sent across.
                </span>
              </div>
            )}
            {status?.syncFrom && (
              <p className="mt-2 text-xs text-muted-fg">
                Started fresh {formatDate(status.syncFrom)} - Sync sends invoices, bills and payments recorded since then.
              </p>
            )}

            {/* The state of the books, in one line. New payments and approved
                bills push themselves; a number here is either backlog from
                before that, or pushes failing - both worth seeing without
                digging through the log. */}
            {connected && status && (
              (status.unsyncedPayments > 0 || status.unsyncedBills > 0 || status.unsyncedClientInvoices > 0 || (status.unsentVoids ?? 0) > 0) ? (
                <p className="mt-2 text-sm">
                  <span className="font-semibold text-warn">
                    {[
                      status.unsyncedPayments > 0 && `${status.unsyncedPayments} payment${status.unsyncedPayments === 1 ? '' : 's'}`,
                      status.unsyncedBills > 0 && `${status.unsyncedBills} bill${status.unsyncedBills === 1 ? '' : 's'}`,
                      status.unsyncedClientInvoices > 0 && `${status.unsyncedClientInvoices} client invoice${status.unsyncedClientInvoices === 1 ? '' : 's'}`,
                    ].filter(Boolean).join(', ')}{(status.unsyncedPayments || status.unsyncedBills || status.unsyncedClientInvoices) ? ' not in QuickBooks yet' : ''}
                    {/* A void that did not reach QuickBooks is a DIFFERENT
                        problem from a record that never got there: the invoice
                        exists over there and is still counting as owed. */}
                    {(status.unsentVoids ?? 0) > 0 && (
                      <>
                        {(status.unsyncedPayments || status.unsyncedBills || status.unsyncedClientInvoices) ? '; ' : ''}
                        {status.unsentVoids} void{status.unsentVoids === 1 ? '' : 's'} QuickBooks has not confirmed, so those records still count there - use Retry voids
                      </>
                    )}
                  </span>
                  <span className="text-muted-fg">
                    {' '}- use Sync below to push the backlog.
                    {status.lastSyncAt && ` Last activity ${formatDate(status.lastSyncAt)}.`}
                  </span>
                </p>
              ) : (
                <p className="mt-2 text-sm text-success">
                  Everything is in QuickBooks. New payments and approved bills push themselves.
                </p>
              )
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
            {elsewhere ? (
              <button onClick={startFresh} disabled={busy === 'fresh'}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50">
                {busy === 'fresh' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Start fresh with a new QuickBooks company
              </button>
            ) : !connected ? (
              <>
                <button
                  onClick={connect}
                  disabled={!status?.configured || busy === 'connect'}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50"
                >
                  {busy === 'connect' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
                  {needsReconnect ? 'Reconnect QuickBooks' : 'Connect to QuickBooks'}
                </button>
                {needsReconnect && (
                  <button onClick={disconnect} disabled={!!busy}
                    className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-danger disabled:opacity-50">
                    Disconnect
                  </button>
                )}
              </>
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
                <button onClick={() => sync('bill-payments')} disabled={!!busy}
                  title="Settle the bills you have already paid - without this the payable stays open in QuickBooks after the money has gone out"
                  className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">
                  {busy === 'bill-payments' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                  Sync bill payments
                </button>
                <button onClick={() => sync('client-invoices')} disabled={!!busy}
                  title="Push sent client invoices as QuickBooks Invoices (money owed to you)"
                  className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">
                  {busy === 'client-invoices' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  Sync client invoices
                </button>
                <button onClick={() => sync('voids')} disabled={!!busy}
                  title="Retry voids that did not reach QuickBooks. Safe to re-run - an invoice already voided over there is recognised, not voided twice."
                  className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">
                  {busy === 'voids' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                  Retry voids
                </button>
                <button onClick={() => sync('payments')} disabled={!!busy}
                  className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">
                  {busy === 'payments' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                  Sync payments
                </button>
                <button onClick={refreshFormatting} disabled={!!busy}
                  title="Rewrite the memo and SN reference on records already in QuickBooks - updates them in place, no duplicates"
                  className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">
                  {busy === 'refresh' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Update formatting
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
          Pushes one way into QuickBooks: customers, subs (vendors), the bills they send you and the payments settling them, the invoices you send your client, and the money that comes in - applied against the invoice it settles, or as a sales receipt when it settles nothing. Bills, invoices and payments auto-create their vendor/customer if needed. Voids and amount corrections follow through too. Re-running skips anything already synced. Nothing comes back from QuickBooks unless you turn on Bring changes back below.
        </p>
      </div>

      {connected && status?.canManage && <QuickBooksAccounts headers={authHeaders} onSaved={load} />}
      {connected && status?.canManage && <QuickBooksPull headers={authHeaders} onChanged={load} />}

      {(status?.log?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-line bg-panel p-6">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <RefreshCw className="h-4 w-4" /> Recent sync activity
          </h4>
          <div className="space-y-1.5">
            {/* Every push, void and failure, newest first. An error shows
                QuickBooks' own reason in full - truncating it to one line hid
                the half that said which reference it refused. */}
            {status!.log.map((l, i) => (
              <div key={i} className="flex items-start justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-start gap-2 text-ink">
                  <span className={cn('mt-1.5 inline-flex h-2 w-2 shrink-0 rounded-full', l.status === 'success' || l.resolved ? 'bg-success' : 'bg-danger')} />
                  <span className="min-w-0">
                    <span className="block">
                      {logLine(l)}
                      {l.qbo_id && <span className="ml-1.5 text-xs text-muted-fg">QBO #{l.qbo_id}</span>}
                    </span>
                    {l.message && (
                      <span className={cn('block break-words text-xs', l.status === 'error' && !l.resolved ? 'text-danger' : 'text-muted-fg')}>{l.message}</span>
                    )}
                    {/* A failure carries its way out; one already put right says so. */}
                    {l.resolved && <span className="block text-xs text-success">Sent on a later try</span>}
                    {l.retry?.kind === 'sync' && status?.canManage && connected && (
                      <button type="button" onClick={() => retryRow(l)} disabled={busy === `retry:${l.entity_id}`}
                        className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-accent-fg hover:underline">
                        {busy === `retry:${l.entity_id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        Retry
                      </button>
                    )}
                    {l.retry?.kind === 'hint' && <span className="block text-xs text-muted-fg">{l.retry.text}</span>}
                  </span>
                </span>
                <span className="shrink-0 whitespace-nowrap text-right text-xs text-muted-fg">
                  {new Date(l.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
