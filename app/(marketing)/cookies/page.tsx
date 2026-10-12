import { SUPPORT_EMAIL } from '@/lib/support-email'
import type { Metadata } from 'next'
import { LegalDoc } from '@/components/marketing/legal-doc'
import { marketingMeta } from '@/components/marketing/meta'
import { AnalyticsOptOut } from '@/components/marketing/analytics-opt-out'

export const metadata: Metadata = marketingMeta({
  title: 'Cookie Policy · SyteNav',
  description:
    'How SyteNav uses cookies: sign-in, preferences, and Google Analytics to see how the site is used. No advertising cookies, and you can turn analytics off.',
  path: '/cookies',
})

export default function CookiesPage() {
  return (
    <LegalDoc
      title="Cookie Policy"
      updated="October 12, 2026"
      intro="This Cookie Policy explains how SyteNav uses cookies and similar technologies on our website and Service."
      sections={[
        { h: 'What cookies are', body: ['Cookies are small text files stored on your device that help a site function, remember your preferences, and understand how it is used.'] },
        { h: 'Types of cookies we use', list: [
          'Essential: required to sign in, keep you logged in, and secure the Service.',
          'Preferences: remember choices such as light or dark theme and how you like a list laid out. Stored in your own browser.',
          'Analytics: Google Analytics, loaded through Google Tag Manager, sets first-party cookies (named _ga and _ga_<id>) on sytenav.com and the SyteNav web app so we can count visits, see which pages are used, and tell which campaigns bring people to the site.',
        ] },
        { h: 'What analytics collects', body: [
          'Page views, scrolling and engagement time, the general location and device type Google derives from a visit, the site that referred you, whether a new account or trial was created, and which features are used - signing in, creating a project, sending a quote request, inviting a subcontractor, searching (how many results came back, never what was typed) and downloading a timesheet or daily log. Each is described only by fixed categories such as "email" or "commercial". Page addresses are reduced to a template before they are sent - a project page is reported as /projects/[id], never with its id, and query strings are dropped - and we never send names, email addresses, project, customer or document details.',
          'Analytics does not run in the SyteNav iOS or Android app, on client portal, bid, bill, RFI or shared-file links, or on pages we use internally. Google signals and advertising features are turned off, and nothing collected is used for advertising or shared with advertisers.',
        ] },
        { h: 'What we do NOT use', body: [
          'No advertising cookies and no cross-site or cross-app advertising tracking. We do not sell or share your data with data brokers.',
        ] },
        { h: 'Turning analytics off', body: [
          'Analytics is on by default. You can turn it off for this browser with the switch at the end of this page, which covers both sytenav.com and the SyteNav web app. If your browser sends a Global Privacy Control signal we treat it as the same choice and do not load analytics at all. Blocking cookies in your browser, or using Google\'s opt-out add-on (tools.google.com/dlpage/gaoptout), also works.',
        ] },
        { h: 'Managing cookies', body: ['You can control or delete cookies through your browser settings. Blocking essential cookies may prevent parts of the Service from working.'] },
        { h: 'Changes', body: ['We may update this Cookie Policy from time to time. Changes will be posted here with an updated date.'] },
        { h: 'Contact', body: [`Questions about cookies? Contact ${SUPPORT_EMAIL}.`] },
      ]}
    >
      <AnalyticsOptOut />
    </LegalDoc>
  )
}
