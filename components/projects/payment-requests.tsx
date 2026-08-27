'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SendLinkBox } from '@/components/ui/send-link-box'
import { useDeleteGuard } from '@/components/ui/delete-guard'
import { Plus, Check, Mail, AlertCircle, Loader2, X, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { blockedReason, isRequestable, percentOfTotal, type ResolvedStage } from '@/lib/payment-stages'
import { useClientEmail } from '@/lib/use-client-email'

interface Req {
  id: string
  label: string
  amount: number
  due_hint: string | null
  stage_index: number | null
  status: 'pending' | 'paid' | 'cancelled'
  sent_at: string | null
  sent_to: string | null
}

const money = (n: number) => `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

/**
 * Asking the client for money that has no costs behind it yet.
 *
 * The app could record a deposit once it arrived and bill for work already
 * done, but had no way to ASK for a deposit - which by definition has nothing
 * to build an invoice from. The go-live checklist demanded one anyway.
 *
 * The amounts come from the payment stages already read off your estimate, so
 * what the client is asked for is what they agreed, worded the way the quote
 * worded it. A stage the estimate left vague is shown and says why it cannot be
 * requested, rather than being hidden or guessed at.
 *
 * Works the same on AIA jobs. Pay applications bill work in place; a deposit is
 * not work in place, so it belongs here on both kinds of job.
 */
export function PaymentRequests({
  projectId, onSettle, reloadKey = 0,
}: {
  projectId: string
  /**
   * "Mark paid" hands the request up to the page, which opens the same Record
   * a client payment dialog as everything else and settles the request with
   * whatever it creates.
   *
   * It used to just flip a status. That put a green "Paid" on screen with no
   * date, no method and no cheque number, and nothing in the ledger - so the
   * request looked settled while the money existed nowhere. A payment received
   * is a payment received, however it was asked for.
   */
  onSettle?: (request: { id: string; label: string; amount: number }) => void
  /** Bumped by the page after it records a payment, to pull fresh state. */
  reloadKey?: number
}) {
  const supabase = createClient()
  const guardDelete = useDeleteGuard()

  const [stages, setStages] = useState<ResolvedStage[]>([])
  const [requests, setRequests] = useState<Req[]>([])
  const [quoteTotal, setQuoteTotal] = useState<number | null>(null)
  const [portalToken, setPortalToken] = useState<string | null>(null)
  const clientEmail = useClientEmail(projectId)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)
  // A one-off ask, as dollars or as a percentage of the estimate. Both exist
  // because both are how people actually quote: "$5,000 to start" and "30% up
  // front" are the same sentence in two trades.
  const [manual, setManual] = useState<{ label: string; mode: 'amount' | 'percent'; value: string } | null>(null)
  // What the percentage works out to, shown before they press Request. The
  // server recomputes it from the estimate - this is a preview, not the source.
  const manualPreview = manual?.mode === 'percent' ? percentOfTotal(manual.value, quoteTotal) : null

  const token = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }, [supabase])

  const load = useCallback(async () => {
    const t = await token()
    const res = await fetch(`/api/projects/${projectId}/payment-requests`, { headers: { Authorization: `Bearer ${t}` } })
    if (res.ok) {
      const d = await res.json()
      setStages(d.stages ?? [])
      setRequests(d.requests ?? [])
      setQuoteTotal(d.quoteTotal ?? null)
      setPortalToken(d.portalToken ?? null)
    }
    setLoading(false)
  }, [projectId, token])

  useEffect(() => { load() }, [load, reloadKey])

  async function post(url: string, init: RequestInit) {
    setError(null)
    const t = await token()
    const res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}`, ...(init.headers ?? {}) },
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({} as any))
      setError(d?.error ?? `That did not work (${res.status}).`)
      return false
    }
    return true
  }

  async function raise(stage: ResolvedStage) {
    setBusy(`stage-${stage.index}`)
    if (await post(`/api/projects/${projectId}/payment-requests`, {
      method: 'POST', body: JSON.stringify({ stage_index: stage.index }),
    })) await load()
    setBusy(null)
  }

  async function raiseManual() {
    if (!manual?.value.trim()) return
    setBusy('manual')
    const payload = manual.mode === 'percent'
      ? { label: manual.label, percent: manual.value }
      : { label: manual.label, amount: manual.value }
    if (await post(`/api/projects/${projectId}/payment-requests`, {
      method: 'POST', body: JSON.stringify(payload),
    })) { setManual(null); await load() }
    setBusy(null)
  }

  async function setStatus(r: Req, status: Req['status']) {
    setBusy(r.id)
    if (await post(`/api/projects/${projectId}/payment-requests/${r.id}`, {
      method: 'PATCH', body: JSON.stringify({ status }),
    })) await load()
    setBusy(null)
  }

  function remove(r: Req) {
    guardDelete(async () => {
      setBusy(r.id)
      if (await post(`/api/projects/${projectId}/payment-requests/${r.id}`, { method: 'DELETE' })) await load()
      setBusy(null)
    }, { label: `the ${money(r.amount)} request for ${r.label}` })
  }

  // A stage that already has an open or settled request must not be offered
  // again - that is how a client gets asked for the same deposit twice.
  const claimed = new Set(
    requests.filter(r => r.status !== 'cancelled' && r.stage_index != null).map(r => r.stage_index),
  )
  const open = requests.filter(r => r.status === 'pending')
  const settled = requests.filter(r => r.status !== 'pending')
  const outstanding = open.reduce((s, r) => s + Number(r.amount), 0)

  if (loading) return null

  return (
    <div className="bg-panel rounded-xl border border-line p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-ink">Deposits &amp; stage payments</p>
          <p className="text-sm text-muted-fg">
            Money you ask the client for up front, before there are costs to bill against.
          </p>
        </div>
        {outstanding > 0 && (
          <span className="rounded-full bg-warn-tint px-2.5 py-1 text-xs font-semibold text-warn">
            {money(outstanding)} outstanding
          </span>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-tint px-3 py-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <p className="text-sm text-ink-soft">{error}</p>
        </div>
      )}

      {/* What the estimate says they owe and when */}
      {stages.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">From your estimate</p>
          {stages.map(stage => {
            const already = claimed.has(stage.index)
            const why = blockedReason(stage, quoteTotal)
            return (
              <div key={stage.index} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">
                    {stage.label}
                    {stage.percent != null && <span className="ml-1.5 text-xs font-normal text-faint">{stage.percent}%</span>}
                  </p>
                  {stage.dueHint && <p className="text-xs text-faint">Due {stage.dueHint}</p>}
                  {why && <p className="text-xs text-warn">{why}</p>}
                </div>
                <span className={cn('text-sm font-semibold', isRequestable(stage) ? 'text-ink' : 'text-faint')}>
                  {isRequestable(stage) ? money(stage.amount!) : '—'}
                </span>
                {already ? (
                  <span className="text-xs font-medium text-success">Requested</span>
                ) : (
                  <Button size="sm" variant="secondary" className="h-8"
                    disabled={!isRequestable(stage) || busy === `stage-${stage.index}`}
                    onClick={() => raise(stage)}>
                    {busy === `stage-${stage.index}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    Request
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {stages.length === 0 && (
        <p className="text-sm text-faint">
          No payment stages on this job&apos;s estimate yet. Add them on the Estimate tab and they show up
          here ready to request - or ask for a one-off amount below.
        </p>
      )}

      {/* Live asks */}
      {open.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">Asked for, not yet paid</p>
          {open.map(r => (
            <div key={r.id} className="rounded-lg border border-warn/30 bg-warn-tint/40 px-3 py-2 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{r.label}</p>
                  <p className="text-xs text-muted-fg">
                    {r.sent_at
                      ? `Sent to ${r.sent_to ?? 'the client'} on ${new Date(r.sent_at).toLocaleDateString()}`
                      : 'Not sent to the client yet'}
                  </p>
                </div>
                <span className="text-sm font-bold text-ink">{money(r.amount)}</span>
                <Button size="sm" variant="secondary" className="h-8"
                  onClick={() => setSendingId(sendingId === r.id ? null : r.id)}>
                  <Mail className="h-3.5 w-3.5" /> {r.sent_at ? 'Send again' : 'Send'}
                </Button>
                <Button size="sm" className="h-8" disabled={busy === r.id}
                  onClick={() => onSettle
                    ? onSettle({ id: r.id, label: r.label, amount: Number(r.amount) })
                    : setStatus(r, 'paid')}>
                  {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Mark paid
                </Button>
                <button type="button" title="Withdraw this request"
                  onClick={() => setStatus(r, 'cancelled')}
                  className="rounded p-1 text-faint hover:bg-danger-tint hover:text-danger">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {sendingId === r.id && (
                <div className="border-t border-warn/20 pt-2">
                  {portalToken ? (
                    <SendLinkBox
                      endpoint={`/api/projects/${projectId}/payment-requests/${r.id}/send`}
                      url={`${window.location.origin}/portal/${portalToken}`}
                      defaultTo={clientEmail}
                      label={`Email this ${money(r.amount)} request to your client`}
                      placeholder="client@example.com"
                      onSent={() => load()}
                    />
                  ) : (
                    <p className="text-sm text-warn">
                      This job has no client portal link yet. Use Share with Client once at the top of the
                      page to create one, then send this.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
          <p className="text-xs text-faint">
            Mark paid opens the same payment record as everything else - date, method, cheque number - so
            the money lands in your ledger and the request is settled in one go.
          </p>
        </div>
      )}

      {/* Settled */}
      {settled.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">Settled</p>
          {settled.map(r => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 px-1 py-1 text-sm">
              <span className={cn('flex-1 min-w-0 truncate', r.status === 'cancelled' ? 'text-faint line-through' : 'text-muted-fg')}>
                {r.label}
              </span>
              <span className={cn('font-medium', r.status === 'cancelled' ? 'text-faint' : 'text-success')}>
                {money(r.amount)}
              </span>
              <span className={cn('text-xs font-medium', r.status === 'cancelled' ? 'text-faint' : 'text-success')}>
                {r.status === 'cancelled' ? 'Withdrawn' : 'Paid'}
              </span>
              <button type="button" title="Put this back to outstanding"
                onClick={() => setStatus(r, 'pending')}
                className="rounded p-1 text-faint hover:bg-surface hover:text-muted-fg">
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button type="button" title="Delete this request"
                onClick={() => remove(r)}
                className="rounded p-1 text-faint hover:bg-danger-tint hover:text-danger">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* One-off */}
      {manual ? (
        <div className="space-y-2 rounded-lg border border-line bg-surface px-3 py-2.5">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[140px]">
              <label className="mb-1 block text-xs font-medium text-muted-fg">What for</label>
              <Input className="h-9" placeholder="e.g. Deposit" value={manual.label}
                onChange={e => setManual({ ...manual, label: e.target.value })} />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-fg">How much</label>
              <div className="flex items-stretch">
                {/* Dollars or a share of the job - the two ways a deposit gets
                    quoted. The toggle sits on the field it changes. */}
                <div className="flex overflow-hidden rounded-l-md border border-r-0 border-muted2">
                  {(['amount', 'percent'] as const).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setManual({ ...manual, mode: m, value: '' })}
                      className={cn(
                        'px-2.5 text-sm font-semibold transition-colors',
                        manual.mode === m ? 'bg-accent text-accent-ink' : 'bg-panel text-muted-fg hover:bg-surface',
                      )}
                    >
                      {m === 'amount' ? '$' : '%'}
                    </button>
                  ))}
                </div>
                <Input
                  className="h-9 w-28 rounded-l-none"
                  placeholder={manual.mode === 'percent' ? '30' : '5000'}
                  value={manual.value}
                  onChange={e => setManual({ ...manual, value: e.target.value })}
                />
              </div>
            </div>

            <Button className="h-9" disabled={busy === 'manual' || !manual.value.trim()} onClick={raiseManual}>
              {busy === 'manual' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Request
            </Button>
            <Button className="h-9" variant="secondary" onClick={() => { setManual(null); setError(null) }}>Cancel</Button>
          </div>

          {/* What a percentage actually comes to, before it is asked for. */}
          {manual.mode === 'percent' && manual.value.trim() && (
            manualPreview != null ? (
              <p className="text-xs text-muted-fg">
                {manual.value}% of the {money(quoteTotal!)} estimate ={' '}
                <span className="font-semibold text-ink">{money(manualPreview)}</span>
              </p>
            ) : (
              <p className="text-xs text-warn">
                This job&apos;s estimate has no total yet, so a percentage has nothing to work from.
                Set one on the Estimate tab, or ask for a dollar amount.
              </p>
            )
          )}
        </div>
      ) : (
        <button type="button" onClick={() => setManual({ label: 'Deposit', mode: 'amount', value: '' })}
          className="inline-flex items-center gap-1 text-sm font-medium text-accent-fg hover:underline">
          <Plus className="h-3.5 w-3.5" /> Request a one-off amount
        </button>
      )}
    </div>
  )
}
