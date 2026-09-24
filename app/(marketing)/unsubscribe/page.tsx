import type { Metadata } from 'next'
import { marketingMeta } from '@/components/marketing/meta'
import { verifyUnsubscribe } from '@/lib/unsubscribe-token'
import { normaliseEmail } from '@/lib/campaign-audience'
import { SUPPORT_EMAIL, supportMailto } from '@/lib/support-email'
import { UnsubscribeForm } from './unsubscribe-form'

// ─────────────────────────────────────────────────────────────────────────────
// Where the footer of a campaign lands you.
//
// IT SAYS WHAT IT DOES AND WHAT IT DOES NOT DO, because those are two different
// things and only one of them is obvious. Unsubscribing stops the mail we
// decided to send. It does not stop an invoice, a bid request, a schedule
// change or a password reset - those go because something happened on a job,
// and a person who stopped getting them would find out by missing one.
//
// The token is verified on the SERVER, before anything renders, so a tampered
// link never reaches a button.
// ─────────────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  ...marketingMeta({
    title: 'Unsubscribe · SyteNav',
    description: 'Stop receiving SyteNav announcements.',
    path: '/unsubscribe',
  }),
  // NOT INDEXED. The URL carries somebody's address and their token; a crawler
  // that follows one out of a leaked mailbox is a crawler that could
  // unsubscribe them. It is also not a page anybody should arrive at from a
  // search.
  robots: { index: false, follow: false },
}

export default function UnsubscribePage({
  searchParams,
}: {
  searchParams: { e?: string; t?: string }
}) {
  const email = normaliseEmail(searchParams?.e ?? '')
  const valid = !!email && verifyUnsubscribe(email, searchParams?.t ?? '')

  return (
    <main className="mx-auto max-w-2xl p-6 py-16">
      <h1 className="text-2xl font-bold text-ink">Unsubscribe</h1>

      {!valid ? (
        <div className="mt-4 space-y-3 text-sm text-ink-soft">
          <p>
            This link is not valid - it may have been changed on the way, or copied out of the
            email incompletely.
          </p>
          <p>
            Open the email again and press Unsubscribe in the footer, or write to{' '}
            <a className="text-accent-fg underline" href={supportMailto('Unsubscribe')}>{SUPPORT_EMAIL}</a>{' '}
            and we will take you off by hand.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          <p className="text-sm text-ink-soft">
            This stops the announcements - the occasional email about what is new in SyteNav.
          </p>
          <UnsubscribeForm email={email} token={searchParams?.t ?? ''} />
          <div className="rounded-xl border border-line bg-panel p-4">
            <p className="text-sm font-medium text-ink">What keeps coming</p>
            <p className="mt-1 text-sm text-muted-fg">
              Anything about your own account and your own jobs: invoices, bid requests, schedule
              changes, inspection reminders and anything to do with signing in. Those are not
              marketing, and turning them off would mean finding out by missing one.
            </p>
          </div>
        </div>
      )}
    </main>
  )
}
