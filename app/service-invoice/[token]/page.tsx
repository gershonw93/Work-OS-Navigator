import { createClient } from '@supabase/supabase-js'
import type { Metadata } from 'next'
import { billSettlement, usd, BILL_STATUS_LABEL, UNIT_LABEL, type BillStatus, type Unit } from '@/lib/service-billing'
import { dayWords } from '@/lib/dates'
import { PrintButton } from './print-button'

// ─────────────────────────────────────────────────────────────────────────────
// What a sub's customer opens from the invoice email. No account, no sign-up:
// the PATH IS THE SECRET (a 32-character token), the same deal as the client
// portal and the job bill link - so it is never indexed and never measured
// (lib/analytics.ts lists '/service-invoice' as untracked).
//
// A DRAFT IS NOT SHOWN, even to somebody holding the token: nobody has been
// asked for that money yet. The figures are the ones the office's screen
// shows, from the same `billSettlement`, and the total is QuickBooks' when it
// added sales tax - the amount the email asked for.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Invoice', robots: { index: false, follow: false } }

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function Gone({ text }: { text: string }) {
  return (
    <main className="min-h-screen bg-surface flex items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-line bg-panel p-8 text-center">
        <p className="text-base font-semibold text-ink">{text}</p>
        <p className="mt-2 text-sm text-muted-fg">If you were expecting an invoice here, reply to the email it came in.</p>
      </div>
    </main>
  )
}

export default async function ServiceInvoicePage({ params }: { params: { token: string } }) {
  const token = String(params.token ?? '')
  if (token.length < 20) return <Gone text="This invoice link is not valid." />
  const db = admin()
  const { data: inv, error } = await db.from('service_call_invoices')
    .select('id, company_id, customer_name, invoice_number, status, issue_date, due_date, notes, subtotal, tax_amount, total, viewed_at')
    .eq('token', token).maybeSingle()
  if (error) return <Gone text="This invoice could not be loaded just now. Try again in a minute." />
  if (!inv || inv.status === 'draft') return <Gone text="This invoice link is not valid." />

  const [{ data: lines }, { data: payments }, { data: company }] = await Promise.all([
    db.from('service_call_invoice_lines').select('description, quantity, unit, unit_price, amount, sort_order').eq('invoice_id', inv.id).order('sort_order'),
    db.from('service_call_payments').select('amount, paid_date').eq('invoice_id', inv.id).order('paid_date'),
    db.from('companies').select('name').eq('id', inv.company_id).maybeSingle(),
  ])
  // Seen once - the office's screen says "Viewed". A failed stamp costs a word.
  if (!inv.viewed_at) await db.from('service_call_invoices').update({ viewed_at: new Date().toISOString() }).eq('id', inv.id).is('viewed_at', null)

  const s = billSettlement(inv, (payments ?? []) as { amount: unknown }[])
  const status = inv.status as BillStatus
  const tax = inv.tax_amount !== null && Number(inv.tax_amount) > 0 ? Number(inv.tax_amount) : null
  const from = (company as any)?.name ?? 'Your service company'

  return (
    <main className="min-h-screen bg-surface px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-muted-fg">{from}</p>
            <h1 className="mt-1 text-2xl font-bold text-ink">Invoice {inv.invoice_number}</h1>
            <p className="mt-1 text-sm text-muted-fg">To {inv.customer_name}</p>
          </div>
          <PrintButton />
        </div>

        {status === 'void' && (
          <p className="rounded-xl border border-line bg-panel px-4 py-3 text-sm font-medium text-ink">
            This invoice was cancelled. You do not owe anything on it.
          </p>
        )}

        <div className="rounded-2xl border border-line bg-panel">
          <div className="grid grid-cols-2 gap-4 border-b border-line-soft p-5 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-fg">Invoice date</p>
              <p className="font-medium text-ink">{dayWords(inv.issue_date, { weekday: true }) ?? inv.issue_date}</p>
            </div>
            <div>
              <p className="text-xs text-muted-fg">Due</p>
              <p className="font-medium text-ink">{inv.due_date ? (dayWords(inv.due_date, { weekday: true }) ?? inv.due_date) : 'On receipt'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-fg">Status</p>
              <p className="font-medium text-ink">{status === 'sent' && s.state === 'partly_paid' ? 'Partly paid' : BILL_STATUS_LABEL[status]}</p>
            </div>
          </div>

          <ul className="divide-y divide-line-soft">
            {((lines ?? []) as any[]).map((l, i) => (
              <li key={i} className="flex items-start justify-between gap-4 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="text-ink break-words">{l.description}</p>
                  <p className="text-xs text-muted-fg">{Number(l.quantity)} x {usd(l.unit_price)} {UNIT_LABEL[l.unit as Unit] ?? ''}</p>
                </div>
                <p className="shrink-0 font-medium text-ink">{usd(l.amount)}</p>
              </li>
            ))}
          </ul>

          <dl className="space-y-1.5 border-t border-line p-5 text-sm">
            <div className="flex justify-between"><dt className="text-muted-fg">Subtotal</dt><dd className="text-ink">{usd(inv.subtotal)}</dd></div>
            {tax !== null && <div className="flex justify-between"><dt className="text-muted-fg">Sales tax</dt><dd className="text-ink">{usd(tax)}</dd></div>}
            <div className="flex justify-between text-base font-semibold"><dt className="text-ink">Total</dt><dd className="text-ink">{usd(s.total)}</dd></div>
            {s.paid > 0 && <div className="flex justify-between"><dt className="text-muted-fg">Paid</dt><dd className="text-ink">-{usd(s.paid)}</dd></div>}
            {status !== 'void' && (
              <div className="flex justify-between border-t border-line-soft pt-2 text-base font-bold">
                <dt className="text-ink">Amount due</dt><dd className="text-ink">{usd(s.balance)}</dd>
              </div>
            )}
          </dl>
        </div>

        {inv.notes && (
          <div className="rounded-2xl border border-line bg-panel p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-faint">Notes</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink break-words">{inv.notes}</p>
          </div>
        )}

        <p className="text-center text-xs text-faint">
          To pay, or with any question about this invoice, reply to the email it came in - it goes to {from}.
        </p>
      </div>
    </main>
  )
}
