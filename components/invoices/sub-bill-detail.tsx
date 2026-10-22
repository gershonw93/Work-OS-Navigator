'use client'

import { useRef } from 'react'
import Link from 'next/link'
import {
  CheckCircle2, Send, Printer, Pencil, Trash2, Upload, FileText, ShieldCheck, Shield, Plus, DollarSign, Loader2,
} from 'lucide-react'
import { Button, buttonClasses } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/dates'
import { markUp } from '@/lib/markup'
import { reconcile, reconciliationNote, lineAmount, type InvoiceLine } from '@/lib/invoice-lines'
import type { BudgetDestination } from '@/lib/invoice-budget'
import type { QuoteCheck } from '@/lib/invoice-check'
import { dueCountdown, markupMode, subBillDocs, subBillSteps, type DocRow } from '@/lib/bill-view'
import { BudgetDestinationBox } from '@/components/projects/budget-destination'
import { InvoiceSplit, type SplitLineOption, type AllocationRow } from '@/components/projects/invoice-split'
import {
  BackLink, CountdownText, DetailRows, DetailSection, Pill, PhoneActionBar, StepTrack, SumTiles, type PillTone,
} from '@/components/bills/detail-parts'

const money = (n: unknown) => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
const money2 = (n: unknown) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** What this screen reads off a bill - the page's `Invoice` is wider. */
export interface SubBill {
  id: string
  invoice_number: string
  company_name: string
  amount: number
  description: string | null
  status: string
  client_paid?: number
  escrow_paid?: number
  approved_by_name: string | null
  approved_at: string | null
  sent_at: string | null
  due_date: string | null
  created_at: string
  subcontract_id: string | null
  subcontracts?: { trade: string; contract_amount: number | null }
  lien_waiver_url: string | null
  lien_waiver_type: string | null
  lien_waiver_uploaded_at: string | null
  document_url?: string | null
  document_name?: string | null
  budget_line?: BudgetDestination | null
  line_items?: InvoiceLine[] | null
  tax?: number | null
  retainage?: number | null
  quote_check?: (QuoteCheck & { summary?: string }) | null
  qbo_id?: string | null
  markup_pct?: number | null
  markup_excluded?: boolean | null
  client_billed?: boolean
}

export interface SubBillDetailProps {
  projectId: string
  invoice: SubBill
  status: { label: string; tone: PillTone }
  /** Whether markup applies on this job at all (cost-plus, or a rate in use). */
  showMarkup: boolean
  projectMarkup: number
  /** An approved bill on a job that bills by invoice - it can be passed on. */
  canBillClient: boolean
  /** A status change is in flight. The only reason the actions disable. */
  busy: boolean
  onStatus: (next: 'approved' | 'sent' | 'paid') => void
  savingMarkup: boolean
  onMarkup: (patch: { markup_pct?: number | null; markup_excluded?: boolean }) => void
  /** The one-click budget line for a contract that has none. */
  onCreateLine?: () => void
  creatingLine: boolean
  budgetLines: SplitLineOption[]
  split: AllocationRow[]
  onSplit: (rows: AllocationRow[]) => void
  onSaveSplit: () => void
  savingSplit: boolean
  uploadingDoc: boolean
  onUploadDoc: (file: File) => void
  uploadingWaiver: boolean
  onUploadWaiver: (type: 'conditional' | 'unconditional', file: File) => void
  onEdit: () => void
  onDelete: () => void
  onBack: () => void
}

/**
 * One sub's bill, as a screen of its own.
 *
 * It used to be a card that unfolded in the list, which put eight boxes of
 * equal weight under a row - and on a phone, the one control that mattered
 * (Mark paid) at the bottom of all of them. Now: who and how much at the top,
 * the steps it has been through under that, ONE primary action, and the
 * paperwork, the client's price and the budget each in a card of its own. On
 * a phone the primary action is pinned to the bottom of the screen.
 */
export function SubBillDetail(p: SubBillDetailProps) {
  const { invoice } = p
  const trade = invoice.subcontracts?.trade ?? invoice.budget_line?.category ?? null
  const paid = invoice.status === 'paid'
  const countdown = paid ? null : dueCountdown(invoice.due_date)
  const steps = subBillSteps(invoice)

  // The ONE action this bill is waiting on. Approve comes first; after that
  // the money - and paying straight from Approved is normal, so Queue is the
  // secondary, optional step beside it.
  const primary = invoice.status === 'pending_approval'
    ? { label: 'Approve', icon: CheckCircle2, next: 'approved' as const }
    : invoice.status === 'approved' || invoice.status === 'sent'
      ? { label: 'Mark paid', icon: DollarSign, next: 'paid' as const }
      : null
  const canQueue = invoice.status === 'approved'

  const sections = (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-5">
      <div className="contents lg:flex lg:flex-col lg:gap-5">
        {p.showMarkup && <BillToClient {...p} />}
        <BudgetCard {...p} />
        <LinesCard invoice={invoice} onEdit={p.onEdit} />
      </div>
      <div className="contents lg:flex lg:flex-col lg:gap-5">
        <DocumentsCard {...p} />
        <DetailSection title="Details" className="order-5 lg:order-none">
          <DetailRows rows={[
            { label: 'Invoice #', value: invoice.invoice_number, mono: true },
            ...(trade ? [{ label: 'Trade', value: trade }] : []),
            ...(invoice.description ? [{ label: 'Notes', value: invoice.description }] : []),
            { label: 'Created', value: formatDate(invoice.created_at) },
            ...(invoice.approved_at ? [{ label: 'Approved', value: formatDate(invoice.approved_at) }] : []),
            ...(invoice.approved_by_name ? [{ label: 'Approved by', value: invoice.approved_by_name }] : []),
            ...(invoice.sent_at ? [{ label: 'Queued for payment', value: formatDate(invoice.sent_at) }] : []),
            { label: 'Due', value: invoice.due_date ? formatDate(invoice.due_date) : 'No due date' },
            ...(Number(invoice.escrow_paid) > 0 ? [{ label: 'Paid from escrow', value: money(invoice.escrow_paid) }] : []),
            ...(Number(invoice.client_paid) > 0 ? [{ label: 'Client paid vendor', value: money(invoice.client_paid) }] : []),
            ...(invoice.qbo_id ? [{ label: 'QuickBooks', value: 'In QuickBooks as a Bill' }] : []),
          ]} />
        </DetailSection>
        {/* Phone: the secondary actions, as words, under everything. */}
        <div className="order-6 flex justify-center gap-2 lg:hidden">
          <Link href={`/projects/${p.projectId}/invoices/${invoice.id}/print`} target="_blank"
            className="inline-flex min-h-11 items-center px-3.5 text-sm font-medium text-ink-soft">View / Print</Link>
          <button type="button" onClick={p.onEdit} className="min-h-11 px-3.5 text-sm font-medium text-ink-soft">Edit</button>
          <button type="button" onClick={p.onDelete} className="min-h-11 px-3.5 text-sm font-medium text-danger">Delete</button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-4 lg:gap-5">
      <BackLink label="Bills from subs" onClick={p.onBack} />

      <section className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-5 lg:gap-6 lg:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-start lg:justify-between lg:gap-6">
          <div className="flex min-w-0 flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={p.status.tone} icon={paid || invoice.status === 'approved' ? <CheckCircle2 className="h-3.5 w-3.5" /> : undefined}>
                {p.status.label}
              </Pill>
              <span className="hidden text-[13px] tabular-nums text-muted-fg lg:inline">{invoice.invoice_number}</span>
              {trade && <><span className="hidden text-faint lg:inline" aria-hidden="true">·</span><span className="text-[13px] text-muted-fg">{trade}</span></>}
            </div>
            <h1 className="break-words text-2xl font-bold tracking-tight text-ink lg:text-[30px] lg:leading-tight">{invoice.company_name}</h1>
            <div className="text-[13px] tabular-nums text-muted-fg lg:hidden">{invoice.invoice_number}</div>
          </div>
          <div className="flex items-end justify-between gap-3 border-t border-line-soft pt-3.5 lg:flex-col lg:items-end lg:gap-1 lg:border-0 lg:pt-0">
            <div className="lg:text-right">
              <div className="text-xs font-medium text-muted-fg lg:text-[13px]">{paid ? 'Paid' : 'Amount due'}</div>
              <div className="text-[32px] font-bold leading-tight tracking-tight tabular-nums text-ink lg:text-4xl lg:leading-none">{money2(invoice.amount)}</div>
            </div>
            <div className="text-right text-xs text-muted-fg lg:text-sm">
              {invoice.due_date
                ? <>Due {formatDate(invoice.due_date)}{countdown && <><span className="hidden lg:inline"> · </span><br className="lg:hidden" /><CountdownText countdown={countdown} /></>}</>
                : 'No due date'}
            </div>
          </div>
        </div>

        {/* Desktop: the actions live in the header. The phone has the same
            primary pinned to the bottom of the screen instead. */}
        <div className="hidden flex-wrap items-center gap-2.5 lg:flex">
          {primary && (
            <Button size="lg" disabled={p.busy} onClick={() => p.onStatus(primary.next)} className="h-11 rounded-[10px] px-5">
              {p.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <primary.icon className="h-4 w-4" />} {primary.label}
            </Button>
          )}
          {canQueue && (
            <Button size="lg" variant="outline" disabled={p.busy} onClick={() => p.onStatus('sent')} className="h-11 rounded-[10px] px-4">
              <Send className="h-4 w-4" /> Queue for payment
            </Button>
          )}
          {/* Said once, in the open. The first question anyone asked about
              this step was "sent to who?". */}
          {canQueue && (
            <span className="min-w-[220px] flex-1 text-[13px] text-muted-fg">
              Optional - logs that it went to bookkeeping. Nothing is sent to the sub.
            </span>
          )}
          <div className="ml-auto flex gap-1">
            <Link href={`/projects/${p.projectId}/invoices/${invoice.id}/print`} target="_blank"
              aria-label="View or print" title="View or print"
              className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] text-ink-soft hover:bg-surface">
              <Printer className="h-[19px] w-[19px]" />
            </Link>
            <button type="button" onClick={p.onEdit} aria-label="Edit bill" title="Edit bill"
              className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] text-ink-soft hover:bg-surface">
              <Pencil className="h-[19px] w-[19px]" />
            </button>
            {/* Deletable at every status - a duplicate already marked paid is
                exactly the one that needs removing. The confirm says what it
                does to the budget and to QuickBooks. */}
            <button type="button" onClick={p.onDelete} aria-label="Delete bill" title="Delete bill"
              className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] text-danger hover:bg-danger-tint">
              <Trash2 className="h-[19px] w-[19px]" />
            </button>
          </div>
        </div>

        <div className="lg:border-t lg:border-line-soft lg:pt-4">
          <StepTrack steps={steps} />
        </div>
      </section>

      {sections}

      {primary && (
        <PhoneActionBar>
          {canQueue && (
            <button type="button" onClick={() => p.onStatus('sent')} disabled={p.busy}
              aria-label="Queue for payment" title="Queue for payment - nothing is sent to the sub"
              className="inline-flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl border border-muted2 bg-panel text-ink disabled:opacity-50">
              <Send className="h-5 w-5" />
            </button>
          )}
          <button type="button" onClick={() => p.onStatus(primary.next)} disabled={p.busy}
            className="inline-flex h-[52px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-accent text-base font-semibold text-accent-ink disabled:opacity-50">
            {p.busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <primary.icon className="h-5 w-5" />}
            {primary.next === 'paid' ? `Mark paid · ${money(invoice.amount)}` : primary.label}
          </button>
        </PhoneActionBar>
      )}
    </div>
  )
}

// ── Bill to client ──────────────────────────────────────────────────────────

/**
 * What to bill the client for this one. The electrician invoices $35,000,
 * your 15% goes on, the client owes $40,250. Three answers to "what markup",
 * as one control: at cost, follow the project's rate, or its own.
 */
function BillToClient(p: SubBillDetailProps) {
  const { invoice } = p
  const m = markUp(invoice.amount, invoice, p.projectMarkup)
  const mode = markupMode(invoice)
  const pick = (next: typeof mode) => {
    if (next === mode || p.savingMarkup) return
    if (next === 'cost') p.onMarkup({ markup_excluded: true })
    // Empty is not zero: null FOLLOWS the project rate, so changing that rate
    // still moves this bill.
    else if (next === 'project') p.onMarkup({ markup_excluded: false, markup_pct: null })
    else p.onMarkup({ markup_excluded: false, markup_pct: m.pct })
  }
  const OPTIONS = [['cost', 'At cost'], ['project', 'Project rate'], ['custom', 'Custom']] as const
  return (
    <DetailSection title="Bill to client" className="order-2 lg:order-none" aside={
      !p.canBillClient ? null : invoice.client_billed ? (
        <Pill tone="success" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>Already billed</Pill>
      ) : (
        // The step that kept getting dropped: a sub's bill is approved and
        // nobody passes it on. Offered here, where the price is.
        <a href={`/projects/${p.projectId}/payments?bill=${invoice.id}`} className={buttonClasses('default', 'sm')}>
          <DollarSign className="h-3.5 w-3.5" /> Bill the client {money(m.clientPrice)}
        </a>
      )
    }>
      <SumTiles tiles={[
        { label: 'Cost', value: money(m.cost) },
        { label: m.excluded ? 'Markup · none' : `Markup · ${m.pct}%`, value: `+ ${money(m.markup)}` },
        { label: 'Client pays', value: money(m.clientPrice), strong: true },
      ]} />
      <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:gap-3">
        <span className="text-[13px] font-medium text-ink lg:text-sm">Markup</span>
        <div role="group" aria-label="Markup type" className="grid grid-cols-3 gap-0.5 rounded-[10px] bg-surface p-[3px] lg:inline-flex">
          {OPTIONS.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={mode === key} onClick={() => pick(key)}
              className={cn('h-10 whitespace-nowrap rounded-lg px-3.5 text-sm lg:h-9',
                mode === key ? 'bg-panel font-semibold text-ink shadow-sm' : 'font-medium text-ink-soft hover:text-ink')}>
              {label}
            </button>
          ))}
        </div>
        {mode === 'custom' && (
          <label className="flex items-center gap-2 text-sm text-muted-fg">
            {/* Keyed on the saved value, so a save elsewhere re-seeds the box. */}
            <Input key={String(invoice.markup_pct)} inputMode="decimal" aria-label="Custom markup percent"
              defaultValue={invoice.markup_pct ?? ''} disabled={p.savingMarkup}
              onBlur={e => {
                const raw = e.target.value.trim()
                const next = raw === '' ? null : Number(raw)
                if (next !== null && !Number.isFinite(next)) return
                if (next !== (invoice.markup_pct ?? null)) p.onMarkup({ markup_pct: next })
              }}
              className="flex-1 tabular-nums lg:w-16 lg:flex-none" />
            %
          </label>
        )}
        {p.savingMarkup && <span className="text-xs text-faint">Saving…</span>}
      </div>
      <p className="text-xs text-muted-fg lg:text-[13px]">
        {mode === 'cost'
          ? 'Passed on at what it cost you - no markup on this one.'
          : mode === 'custom'
            ? `This bill has its own rate${p.projectMarkup > 0 ? `; the project's is ${p.projectMarkup}%` : ''}.`
            : p.projectMarkup > 0
              ? `Follows the project's ${p.projectMarkup}%, so changing that rate moves this bill too.`
              : <>No project rate is set yet, so this adds nothing. <Link href={`/projects/${p.projectId}/payments`} className="font-medium text-accent-fg hover:underline">Set a project rate</Link> or give this one its own.</>}
      </p>
    </DetailSection>
  )
}

// ── Budget ──────────────────────────────────────────────────────────────────

/** The budget line this bill moves, what is left on it, and the split. */
function BudgetCard(p: SubBillDetailProps) {
  const { invoice } = p
  const d = invoice.budget_line
  if (!invoice.subcontract_id && !d && p.budgetLines.length === 0) return null
  const label = d
    ? [[d.cost_code, d.category].filter(Boolean).join(' · '), d.description].filter(Boolean).join(' - ')
    : ''
  const used = d && d.budgeted_amount > 0 ? Math.min(Math.max(d.billed_amount / d.budgeted_amount, 0), 1) : 0
  return (
    <DetailSection title="Budget" className="order-3 lg:order-none">
      {d ? (
        <>
          <div className="flex flex-col gap-1">
            <div className="break-words text-sm font-semibold text-ink lg:text-[15px]">{label || 'Budget line'}</div>
            {d.cost_code && <div className="text-xs text-muted-fg lg:text-[13px]">Cost code: {d.cost_code}</div>}
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-surface lg:h-2.5" role="img"
            aria-label={`${Math.round(used * 100)}% of the line billed`}>
            <div className={cn(d.remaining < 0 ? 'bg-danger' : 'bg-accent-fg')} style={{ width: `${used * 100}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-2 lg:gap-3">
            <Figure label="Budgeted" value={money(d.budgeted_amount)} />
            <Figure label="Billed so far" value={money(d.billed_amount)} />
            <Figure label={d.remaining < 0 ? 'Over' : 'Left'} value={money(Math.abs(d.remaining))}
              cls={d.remaining < 0 ? 'text-danger' : 'text-accent-fg'} />
          </div>
          {d.change_orders_amount !== 0 && (
            <p className="text-xs text-muted-fg">Includes {money(d.change_orders_amount)} of approved changes.</p>
          )}
        </>
      ) : invoice.subcontract_id ? (
        <BudgetDestinationBox destination={null} subName={invoice.company_name}
          onCreateLine={p.onCreateLine} creating={p.creatingLine} />
      ) : (
        <p className="text-sm text-muted-fg">Not tied to a subcontract, so it lands on the budget only where you split it.</p>
      )}
      {/* Offered on every bill, not only contract-linked ones - a supplier
          bill covering two trades usually has no subcontract at all. */}
      {p.budgetLines.length > 0 && (
        <InvoiceSplit
          invoiceAmount={Number(invoice.amount) || 0}
          lines={p.budgetLines}
          value={p.split}
          onChange={p.onSplit}
          onSave={p.onSaveSplit}
          saving={p.savingSplit}
          hasContractRoute={!!d}
        />
      )}
    </DetailSection>
  )
}

function Figure({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-fg lg:text-[13px]">{label}</div>
      <div className={cn('truncate text-[15px] font-semibold tabular-nums text-ink lg:text-base', cls)}>{value}</div>
    </div>
  )
}

// ── Line items ──────────────────────────────────────────────────────────────

/** The breakdown, as rows - not a table, which is not a phone layout. */
function LinesCard({ invoice, onEdit }: { invoice: SubBill; onEdit: () => void }) {
  const lines = Array.isArray(invoice.line_items) ? invoice.line_items : []
  const rec = reconcile({ lines, tax: invoice.tax, retainage: invoice.retainage, amount: invoice.amount })
  const note = reconciliationNote(rec)
  if (rec.noBreakdown) {
    return (
      <DetailSection title="Line items" className="order-4 lg:order-none">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-4 lg:rounded-xl lg:border lg:border-dashed lg:border-muted2 lg:p-5">
          <p className="text-sm text-muted-fg lg:flex-1">
            Only a total on this bill. Add the lines to see what you are paying for - scanning the sub&apos;s PDF
            when you enter a bill reads them off it.
          </p>
          <Button variant="outline" onClick={onEdit} className="h-11 rounded-[10px] lg:h-10">
            <Plus className="h-4 w-4" /> Add lines
          </Button>
        </div>
      </DetailSection>
    )
  }
  return (
    <DetailSection title="Line items" className="order-4 lg:order-none" aside={
      <span className={cn('text-xs font-medium', rec.balanced ? 'text-success' : 'text-warn')}>
        {rec.balanced ? 'Adds up to the total' : 'Does not add up'}
      </span>
    }>
      <div className="divide-y divide-line-soft text-sm">
        {lines.map((li, i) => {
          const amt = lineAmount(li)
          // A line the quote check flagged, matched by its text.
          const flag = invoice.quote_check?.findings?.find(f => f.description === li.description)
          return (
            <div key={i} className={cn('flex items-start justify-between gap-3 py-2.5 first:pt-0', flag && '-mx-2 rounded-lg bg-warn-tint/40 px-2')}>
              <div className="min-w-0">
                <div className="break-words text-ink">{li.description || '-'}</div>
                {li.qty != null && li.unit_price != null && (
                  <div className="text-xs text-faint tabular-nums">
                    {li.qty}{li.unit ? ` ${li.unit}` : ''} × {money(li.unit_price)}
                  </div>
                )}
                {flag && (
                  <div className="text-xs text-warn">
                    {flag.kind === 'over_quoted_line'
                      ? `Quoted ${money(flag.quoted)} - ${money(Math.round(flag.over ?? 0))} more`
                      : 'Not on their quote'}
                  </div>
                )}
              </div>
              <div className="shrink-0 tabular-nums text-ink">{amt != null ? money(amt) : <span className="text-faint">-</span>}</div>
            </div>
          )
        })}
      </div>
      <div className="flex flex-col gap-1 border-t border-line pt-3 text-sm">
        <SumRow label="Lines" value={money(rec.linesTotal)} />
        {invoice.tax != null && Number(invoice.tax) !== 0 && <SumRow label="Tax" value={money(invoice.tax)} />}
        {invoice.retainage != null && Number(invoice.retainage) !== 0 && (
          <SumRow label="Retainage withheld" value={`−${money(invoice.retainage)}`} />
        )}
        <div className="flex justify-between pt-1 font-semibold">
          <span className="text-ink">Invoice total</span>
          <span className={cn('tabular-nums', rec.balanced ? 'text-ink' : 'text-warn')}>{money(invoice.amount)}</span>
        </div>
      </div>
      {note && <p className="text-xs text-warn">{note}</p>}
    </DetailSection>
  )
}

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-fg">
      <span>{label}</span><span className="tabular-nums text-ink-soft">{value}</span>
    </div>
  )
}

// ── Documents ───────────────────────────────────────────────────────────────

/** The invoice the sub sent and the two lien waivers - the sub has no account, so the GC attaches them. */
function DocumentsCard(p: SubBillDetailProps) {
  const { rows, onFile } = subBillDocs(p.invoice)
  const docRef = useRef<HTMLInputElement>(null)
  const condRef = useRef<HTMLInputElement>(null)
  const uncondRef = useRef<HTMLInputElement>(null)
  const refFor = (k: DocRow['key']) => (k === 'invoice' ? docRef : k === 'conditional' ? condRef : uncondRef)
  const uploading = (k: DocRow['key']) => (k === 'invoice' ? p.uploadingDoc : p.uploadingWaiver)
  const ICON = { invoice: FileText, conditional: Shield, unconditional: ShieldCheck } as const
  const accept = '.pdf,.doc,.docx,.png,.jpg,.jpeg'
  return (
    <DetailSection title="Documents" className="order-1 lg:order-none" aside={
      <Pill tone={onFile === rows.length ? 'success' : 'warn'}>{onFile} of {rows.length} on file</Pill>
    }>
      <input ref={docRef} type="file" accept={accept} className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) p.onUploadDoc(f); e.target.value = '' }} />
      <input ref={condRef} type="file" accept={accept} className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) p.onUploadWaiver('conditional', f); e.target.value = '' }} />
      <input ref={uncondRef} type="file" accept={accept} className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) p.onUploadWaiver('unconditional', f); e.target.value = '' }} />
      <div className="divide-y divide-line-soft">
        {rows.map(r => {
          const Icon = ICON[r.key]
          const busy = uploading(r.key)
          // A waiver on file is replaced only by the stronger one; the
          // vendor's invoice can always be swapped for the right file.
          const canUpload = !r.covered && (!r.url || r.key === 'invoice')
          const verb = r.url ? 'Replace' : 'Upload'
          return (
            <div key={r.key} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0 lg:py-3">
              <div className={cn('hidden h-9 w-9 shrink-0 items-center justify-center rounded-[9px] lg:flex',
                r.warn ? 'bg-warn-tint text-warn' : r.url || r.covered ? 'bg-success-tint text-success' : 'bg-surface text-muted-fg')}>
                <Icon className="h-[18px] w-[18px]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink">{r.label}</div>
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs font-medium text-accent-fg hover:underline">
                    {r.key === 'invoice' ? (p.invoice.document_name || 'View file') : 'View document'}
                    {r.key !== 'invoice' && p.invoice.lien_waiver_uploaded_at ? ` · ${formatDate(p.invoice.lien_waiver_uploaded_at)}` : ''}
                  </a>
                ) : (
                  <div className={cn('text-xs', r.warn ? 'text-warn' : 'text-muted-fg')}>{r.hint}</div>
                )}
              </div>
              {canUpload && (
                <>
                  <button type="button" disabled={busy} onClick={() => refFor(r.key).current?.click()}
                    aria-label={`${verb} ${r.label.toLowerCase()}`} title={`${verb} ${r.label.toLowerCase()}`}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border border-muted2 bg-panel text-ink disabled:opacity-50 lg:hidden">
                    {busy ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Upload className="h-[18px] w-[18px]" />}
                  </button>
                  <button type="button" disabled={busy} onClick={() => refFor(r.key).current?.click()}
                    className="hidden h-9 shrink-0 items-center rounded-lg border border-muted2 bg-panel px-3 text-[13px] font-medium text-ink hover:bg-surface disabled:opacity-50 lg:inline-flex">
                    {busy ? 'Uploading…' : verb}
                  </button>
                </>
              )}
            </div>
          )
        })}
      </div>
    </DetailSection>
  )
}
