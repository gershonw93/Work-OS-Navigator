import type { Metadata } from 'next'
import Link from 'next/link'
import { SUPPORT_EMAIL, supportMailto } from '@/lib/support-email'
import { marketingMeta } from '@/components/marketing/meta'

// ─────────────────────────────────────────────────────────────────────────────
// How to delete a SyteNav account - the page Google Play links from the store
// listing ("Delete account URL" in the Data safety form).
//
// Google's three requirements for this page, each of which it checks: it names
// the app, it PROMINENTLY gives the steps to request deletion, and it says
// which data is deleted, which is kept, and for how long.
//
// A REQUEST, NOT A BUTTON, AND THE PAGE SAYS SO. Settings has a "Delete
// Company Account" control, but it calls a DELETE on /api/settings that has
// never existed, so it has never worked - pointing people at it from here
// would be sending them to a button that fails. Deletion is by email until a
// real one is built; see BACKLOG.md. Every sentence below is a promise, so
// none of them describes a mechanism that is not there.
// ─────────────────────────────────────────────────────────────────────────────

export const metadata: Metadata = marketingMeta({
  title: 'Delete your SyteNav account · SyteNav',
  description:
    'How to ask SyteNav to delete your account and your data, what is deleted, what is kept, and for how long.',
  path: '/delete-account',
})

const REQUEST_BODY = [
  'Please delete my SyteNav account.',
  '',
  'Account email: ',
  'Company name: ',
  'Delete: [ ] just my own login   [ ] our whole company account and all its projects',
].join('\n')

export default function DeleteAccountPage() {
  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent-fg mb-2">Your data</p>
      <h1 className="text-3xl sm:text-4xl font-extrabold text-ink leading-tight">Delete your SyteNav account</h1>
      <p className="mt-4 text-muted-fg leading-relaxed">
        This page explains how to have your SyteNav account and its data deleted. It applies to SyteNav
        on the web, on iPhone and on Android.
      </p>

      <section className="mt-8 rounded-2xl border border-line bg-panel p-6">
        <h2 className="text-lg font-bold text-ink">How to request deletion</h2>
        <ol className="mt-3 space-y-2 text-sm text-muted-fg leading-relaxed list-decimal pl-5">
          <li>
            Email <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent-fg hover:underline">{SUPPORT_EMAIL}</a>{' '}
            <strong className="text-ink">from the email address you sign in with</strong>, with the subject
            &quot;Delete my SyteNav account&quot;.
          </li>
          <li>Say whether you want your own login deleted, or your whole company account and everything in it.</li>
          <li>
            We reply to confirm. A company account can only be deleted at the request of its owner or an
            admin, because it holds everyone else&apos;s work too.
          </li>
          <li>We delete the data within 30 days of confirming, and email you when it is done.</li>
        </ol>
        <a
          href={supportMailto('Delete my SyteNav account', REQUEST_BODY)}
          className="mt-5 inline-flex items-center justify-center whitespace-nowrap rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-accent-fg"
        >
          Email a deletion request
        </a>
      </section>

      <div className="mt-10 space-y-8">
        <section>
          <h2 className="text-lg font-bold text-ink mb-2">What is deleted</h2>
          <ul className="space-y-1.5 text-sm text-muted-fg leading-relaxed list-disc pl-5">
            <li>
              <strong className="text-ink">Your login:</strong> your name, email address, password,
              notification settings and the phones registered for notifications.
            </li>
            <li>
              <strong className="text-ink">A whole company account:</strong> additionally every project and
              everything in it - budgets, invoices, payments, schedules, daily logs and photos, documents,
              plans, permits, inspections, time entries - and every team member&apos;s login.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-ink mb-2">What is kept, and for how long</h2>
          <ul className="space-y-1.5 text-sm text-muted-fg leading-relaxed list-disc pl-5">
            <li>
              <strong className="text-ink">If you delete only your own login</strong> and your company keeps
              using SyteNav, the work you recorded on its projects - daily logs, time entries, photos, notes -
              belongs to that company and stays in its account.
            </li>
            <li>
              <strong className="text-ink">Backups:</strong> copies in our database backups are not edited
              one by one. They are replaced as the backups roll over, within 30 days of the deletion.
            </li>
            <li>
              <strong className="text-ink">Anything already sent outside SyteNav</strong> stays where it was
              sent: invoices and payments already pushed to your QuickBooks, emails already delivered, and
              files you shared by link. Those are in your QuickBooks and in the recipients&apos; inboxes, not
              in SyteNav.
            </li>
            <li>
              <strong className="text-ink">Records we are required by law to keep</strong>, if any apply, are
              kept only for as long as that law requires and used for nothing else.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-ink mb-2">Deleting some data without closing the account</h2>
          <p className="text-sm text-muted-fg leading-relaxed">
            Most things can be deleted from inside the app - projects, documents, photos, contacts - by
            whoever has permission to edit them. For anything you cannot remove yourself, email the same
            address and say what you want deleted.
          </p>
        </section>
      </div>

      <div className="mt-10 rounded-xl border border-line bg-panel p-4 text-sm text-muted-fg">
        More about how SyteNav handles your data is in the{' '}
        <Link href="/privacy" className="text-accent-fg hover:underline">Privacy Policy</Link>.
      </div>
    </article>
  )
}
