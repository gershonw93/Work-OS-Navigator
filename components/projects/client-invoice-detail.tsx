'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { AlertTriangle, Ban, Check, Copy, Loader2, Mail, MessageSquare, Printer, Send, Trash2, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/dates'
import { clientInvoiceSteps, dueCountdown } from '@/lib/bill-view'
import type { QbChip } from '@/lib/invoice-qb-state'
import {
  BackLink, CountdownText, DetailRows, DetailSection, Pill, PhoneActionBar, StepTrack, SumTiles, type PillTone,
} from '@/components/bills/detail-parts'

const money = (n: unknown) => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
const money2 = (n: unknown) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** What this screen reads off a client invoice - the list's `Bill` is wider. */
export interface ClientBill {
  id: string
  invoice_number: string
  status: string
  issue_date: string
  due_date: string | null
  show_markup: boolean
  sent_at?: string | null
  paid_at?: string | null
  notes?: string | null
  viewed_at: string | null
  last_viewed_at: string | null
  view_count: number | null
  settlement: { state?: string; paid?: number; total?: number; amount?: number; balance?: number } | null
  client_invoice_lines: { id: string; description: string; cost: number; markup_pct: number; markup: number; amount: number }[]
}

/** One word per state, shared with the list so a row and its screen agree. */
export const CLIENT_STATUS_TONE: Record<string, PillTone> = {
  draft: 'muted', sent: 'info', 'partly paid': 'warn', paid: 'success', void: 'danger',
}
export const CLIENT_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', sent: 'Issued', 'partly paid': 'Part paid', paid: 'Paid', void: 'Void',
}

export interface ClientInvoiceDetailProps {
  projectId: string
  bill: ClientBill
  /** Who it is to, when the job has a client on it. */
  clientName: string | null
  total: number
  owed: number
  /** 'sent' | 'partly paid' | 'draft' | 'paid' | 'void' - partly paid is the sums' word, not a stored status. */
  shownStatus: string
  /** The QuickBooks fact for this invoice, already worked out by the list. */
  qb: QbChip
  busy: boolean
  onIssue: () => void
  /** Absent when the page has no payment box to open. */
  onRecordPayment?: () => void
  onRetryVoid: () => void
  shareable: boolean
  clientEmail: string | null
  copied: boolean
  onCopy: () => void
  onEmail: () => void
  onEmailOther: () => void
  mailto: string
  credit: number | null
  applying: boolean
  onApplyCredit: () => void
  questions: number
  waitingOnGc: boolean
  onThread: () => void
  onVoid: () => void
  onDelete: () => void
  onBack: () => void
  /** The send box and its answer, owned by the list - rendered under the sharing card. */
  sendArea?: ReactNode
}

/**
 * One invoice to the client, as a screen of its own - the same shape as a
 * sub's bill (`components/invoices/sub-bill-detail.tsx`), from the other side
 * of the money: who it is to and what they still owe at the top, the steps it
 * has been through, ONE primary action, then the lines, the money in, and how
 * it reached them.
 */
export function ClientInvoiceDetail(p: ClientInvoiceDetailProps) {
  const { bill } = p
  const paid = p.shownStatus === 'paid'
  const isVoid = bill.status === 'void'
  const owing = bill.status === 'sent' && p.owed > 0
  const countdown = owing ? dueCountdown(bill.due_date) : null
  const steps = clientInvoiceSteps(bill, money)
  const paidSoFar = Number(bill.settlement?.paid ?? bill.settlement?.amount ?? 0)
  const lines = bill.client_invoice_lines ?? []

  const primary = bill.status === 'draft'
    ? { label: 'Issue & get link', icon: Send, run: p.onIssue }
    : owing && p.onRecordPayment
      ? { label: p.shownStatus === 'partly paid' ? 'Record another payment' : 'Record payment', icon: Check, run: p.onRecordPayment }
      : null
  const canCredit = owing && p.credit !== null && p.credit > 0

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-4 lg:gap-5">
      <BackLink label="Billing the client" onClick={p.onBack} />

      <section className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-5 lg:gap-6 lg:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-start lg:justify-between lg:gap-6">
          <div className="flex min-w-0 flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={CLIENT_STATUS_TONE[p.shownStatus] ?? 'muted'} icon={paid ? <Check className="h-3.5 w-3.5" /> : undefined}>
                {CLIENT_STATUS_LABEL[p.shownStatus] ?? p.shownStatus}
              </Pill>
              <span className="hidden text-[13px] tabular-nums text-muted-fg lg:inline">{bill.invoice_number}</span>
              {p.qb.show && (
                p.qb.retry === 'void' ? (
                  <button type="button" title={p.qb.title} onClick={p.onRetryVoid} disabled={p.busy}
                    className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-warn-tint px-2.5 py-1 text-xs font-semibold text-warn hover:underline">
                    {p.busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <AlertTriangle className="h-3 w-3" />} {p.qb.label}
                  </button>
                ) : (
                  <span title={p.qb.title}>
                    <Pill tone={p.qb.tone === 'ok' ? 'success' : 'warn'}
                      icon={p.qb.tone === 'ok' ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}>
                      {p.qb.label}
                    </Pill>
                  </span>
                )
              )}
            </div>
            <h1 className="break-words text-2xl font-bold tracking-tight text-ink lg:text-[30px] lg:leading-tight">
              {p.clientName || `Invoice ${bill.invoice_number}`}
            </h1>
            <div className="text-[13px] tabular-nums text-muted-fg lg:hidden">{bill.invoice_number}</div>
          </div>
          <div className="flex items-end justify-between gap-3 border-t border-line-soft pt-3.5 lg:flex-col lg:items-end lg:gap-1 lg:border-0 lg:pt-0">
            <div className="lg:text-right">
              <div className="text-xs font-medium text-muted-fg lg:text-[13px]">
                {isVoid ? 'Voided' : paid ? 'Paid in full' : bill.status === 'draft' ? 'Total' : 'Balance due'}
              </div>
              <div className={cn('text-[32px] font-bold leading-tight tracking-tight tabular-nums lg:text-4xl lg:leading-none',
                isVoid ? 'text-faint line-through' : 'text-ink')}>
                {money2(owing ? p.owed : p.total)}
              </div>
            </div>
            <div className="text-right text-xs text-muted-fg lg:text-sm">
              {bill.due_date
                ? <>Due {formatDate(bill.due_date)}{countdown && <><span className="hidden lg:inline"> · </span><br className="lg:hidden" /><CountdownText countdown={countdown} /></>}</>
                : 'No due date'}
            </div>
          </div>
        </div>

        <div className="hidden flex-wrap items-center gap-2.5 lg:flex">
          {primary && (
            <Button size="lg" disabled={p.busy} onClick={primary.run} className="h-11 rounded-[10px] px-5">
              {p.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <primary.icon className="h-4 w-4" />} {primary.label}
            </Button>
          )}
          {canCredit && (
            <Button size="lg" variant="outline" disabled={p.applying} onClick={p.onApplyCredit} className="h-11 rounded-[10px] px-4">
              <Wallet className="h-4 w-4" /> {p.applying ? 'Applying credit…' : `Apply ${money(Math.min(p.credit ?? 0, p.owed))} credit`}
            </Button>
          )}
          {bill.status === 'draft' && (
            <span className="min-w-[220px] flex-1 text-[13px] text-muted-fg">
              Issuing creates the client&apos;s link, and the QuickBooks invoice if you are connected. Nothing is emailed until you send it.
            </span>
          )}
          <div className="ml-auto flex gap-1">
            <Link href={`/projects/${p.projectId}/client-invoices/${bill.id}/print`} target="_blank"
              aria-label="View or print" title="View or print"
              className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] text-ink-soft hover:bg-surface">
              <Printer className="h-[19px] w-[19px]" />
            </Link>
            {bill.status !== 'draft' && (
              <button type="button" onClick={p.onThread} aria-label="Client questions" title="Client questions"
                className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] text-ink-soft hover:bg-surface">
                <MessageSquare className="h-[19px] w-[19px]" />
              </button>
            )}
            {(bill.status === 'sent' || bill.status === 'paid') && (
              <button type="button" onClick={p.onVoid} aria-label="Void this invoice" title="Void this invoice"
                className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] text-danger hover:bg-danger-tint">
                <Ban className="h-[19px] w-[19px]" />
              </button>
            )}
            {bill.status === 'draft' && (
              <button type="button" onClick={p.onDelete} aria-label="Delete this draft" title="Delete this draft"
                className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] text-danger hover:bg-danger-tint">
                <Trash2 className="h-[19px] w-[19px]" />
              </button>
            )}
          </div>
        </div>

        {p.waitingOnGc && (
          <button type="button" onClick={p.onThread}
            className="flex min-h-11 items-center gap-2 self-start rounded-lg bg-warn-tint px-3 text-sm font-semibold text-warn hover:underline">
            <MessageSquare className="h-4 w-4" /> The client asked a question - reply
          </button>
        )}

        <div className="lg:border-t lg:border-line-soft lg:pt-4">
          <StepTrack steps={steps} />
        </div>
      </section>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-5">
        <div className="contents lg:flex lg:flex-col lg:gap-5">
          <DetailSection title="Money in" className="order-2 lg:order-none">
            <SumTiles tiles={[
              { label: 'Invoice total', value: money(p.total) },
              { label: 'Paid so far', value: money(paidSoFar) },
              { label: 'Still owed', value: money(isVoid ? 0 : p.owed), strong: true },
            ]} />
            {canCredit && (
              <div className="flex flex-col gap-2 lg:hidden">
                <p className="text-xs text-muted-fg">{money(p.credit)} of the client&apos;s money is held on account.</p>
                <Button variant="outline" disabled={p.applying} onClick={p.onApplyCredit} className="h-11 rounded-[10px]">
                  <Wallet className="h-4 w-4" /> {p.applying ? 'Applying credit…' : `Apply ${money(Math.min(p.credit ?? 0, p.owed))} credit`}
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-fg lg:text-[13px]">
              Paid is what the payments recorded against it add up to - it reads Paid once they cover it.
            </p>
          </DetailSection>

          <DetailSection title="Line items" className="order-3 lg:order-none" aside={
            <span className="text-xs text-muted-fg">{bill.show_markup ? 'Client sees cost and markup' : 'Client sees one amount per line'}</span>
          }>
            {lines.length === 0 ? (
              <p className="text-sm text-muted-fg">No lines on this invoice.</p>
            ) : (
              <>
                <div className="divide-y divide-line-soft text-sm">
                  {lines.map(l => (
                    <div key={l.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0">
                      <div className="min-w-0">
                        <div className="break-words text-ink">{l.description}</div>
                        <div className="text-xs text-faint tabular-nums">
                          {money(l.cost)} cost{Number(l.markup) ? ` + ${Number(l.markup_pct)}% (${money(l.markup)})` : ' · at cost'}
                        </div>
                      </div>
                      <div className="shrink-0 tabular-nums text-ink">{money(l.amount)}</div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between border-t border-line pt-3 text-sm font-semibold">
                  <span className="text-ink">Invoice total</span>
                  <span className="tabular-nums text-ink">{money(p.total)}</span>
                </div>
              </>
            )}
          </DetailSection>
        </div>

        <div className="contents lg:flex lg:flex-col lg:gap-5">
          {bill.status !== 'draft' && (
            <DetailSection title="The client's link" className="order-1 lg:order-none" aside={
              <Pill tone={bill.last_viewed_at || bill.viewed_at ? 'success' : 'muted'}>
                {bill.last_viewed_at || bill.viewed_at ? 'Opened' : 'Not opened yet'}
              </Pill>
            }>
              {p.shareable ? (
                <div className="flex flex-col gap-2">
                  {/* A long address must not run out of the button: the label
                      truncates (with the whole address on hover) rather than
                      the button's no-wrap pushing it over the card edge. */}
                  <Button variant="outline" onClick={p.onEmail} title={p.clientEmail ? `Email it to ${p.clientEmail}` : undefined}
                    className="h-11 min-w-0 justify-start rounded-[10px]">
                    <Mail className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 truncate">{p.clientEmail ? `Email it to ${p.clientEmail}` : 'Email it to the client'}</span>
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={p.onCopy} className="h-11 rounded-[10px]">
                      <Copy className="h-4 w-4" /> {p.copied ? 'Copied' : 'Copy link'}
                    </Button>
                    {p.clientEmail ? (
                      <Button variant="outline" onClick={p.onEmailOther} className="h-11 rounded-[10px]">
                        <Mail className="h-4 w-4" /> Someone else
                      </Button>
                    ) : (
                      <a href={p.mailto} className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-muted2 bg-panel text-sm font-medium text-ink-soft hover:bg-surface">
                        <Mail className="h-4 w-4" /> Compose
                      </a>
                    )}
                  </div>
                  {p.clientEmail && (
                    <a href={p.mailto} className="inline-flex min-h-11 items-center text-xs font-medium text-accent-fg hover:underline lg:min-h-0">
                      Compose it yourself instead
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-fg">No link on this invoice.</p>
              )}
              {p.sendArea}
            </DetailSection>
          )}

          <DetailSection title="Details" className="order-4 lg:order-none">
            <DetailRows rows={[
              { label: 'Invoice #', value: bill.invoice_number, mono: true },
              ...(p.clientName ? [{ label: 'Client', value: p.clientName }] : []),
              { label: 'Dated', value: formatDate(bill.issue_date) },
              ...(bill.sent_at ? [{ label: 'Issued', value: formatDate(bill.sent_at) }] : []),
              { label: 'Due', value: bill.due_date ? formatDate(bill.due_date) : 'No due date' },
              ...(bill.last_viewed_at || bill.viewed_at
                ? [{ label: 'Last opened', value: `${formatDate(bill.last_viewed_at ?? bill.viewed_at)}${Number(bill.view_count) > 1 ? ` · ${bill.view_count} times` : ''}` }]
                : []),
              ...(bill.paid_at ? [{ label: 'Paid', value: formatDate(bill.paid_at) }] : []),
              { label: 'Markup', value: bill.show_markup ? 'Shown to the client' : 'Not shown' },
              ...(bill.notes ? [{ label: 'Notes', value: bill.notes }] : []),
            ]} />
          </DetailSection>

          <div className="order-5 flex justify-center gap-2 lg:hidden">
            <Link href={`/projects/${p.projectId}/client-invoices/${bill.id}/print`} target="_blank"
              className="inline-flex min-h-11 items-center px-3.5 text-sm font-medium text-ink-soft">View / Print</Link>
            {bill.status !== 'draft' && (
              <button type="button" onClick={p.onThread} className="min-h-11 px-3.5 text-sm font-medium text-ink-soft">
                Questions{p.questions ? ` (${p.questions})` : ''}
              </button>
            )}
            {(bill.status === 'sent' || bill.status === 'paid') && (
              <button type="button" onClick={p.onVoid} className="min-h-11 px-3.5 text-sm font-medium text-danger">Void</button>
            )}
            {bill.status === 'draft' && (
              <button type="button" onClick={p.onDelete} className="min-h-11 px-3.5 text-sm font-medium text-danger">Delete</button>
            )}
          </div>
        </div>
      </div>

      {primary && (
        <PhoneActionBar>
          <button type="button" onClick={primary.run} disabled={p.busy}
            className="inline-flex h-[52px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-accent text-base font-semibold text-accent-ink disabled:opacity-50">
            {p.busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <primary.icon className="h-5 w-5" />}
            {bill.status === 'draft' ? primary.label : `${primary.label} · ${money(p.owed)}`}
          </button>
        </PhoneActionBar>
      )}
    </div>
  )
}
