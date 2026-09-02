import type { Metadata } from 'next'
import { LegalDoc } from '@/components/marketing/legal-doc'
import { marketingMeta } from '@/components/marketing/meta'

export const metadata: Metadata = marketingMeta({
  title: 'Cookie Policy · SyteNav',
  description:
    'How SyteNav uses cookies: sign-in and preferences only. No analytics, no advertising, no cross-site tracking.',
  path: '/cookies',
})

export default function CookiesPage() {
  return (
    <LegalDoc
      title="Cookie Policy"
      updated="July 1, 2026"
      intro="This Cookie Policy explains how SyteNav uses cookies and similar technologies on our website and Service."
      sections={[
        { h: 'What cookies are', body: ['Cookies are small text files stored on your device that help a site function, remember your preferences, and understand how it is used.'] },
        { h: 'Types of cookies we use', list: [
          'Essential: required to sign in, keep you logged in, and secure the Service.',
          'Preferences: remember choices such as light or dark theme and how you like a list laid out. Stored in your own browser.',
        ] },
        { h: 'What we do NOT use', body: [
          'No analytics cookies, no advertising cookies, and no cross-site or cross-app tracking. We do not run Google Analytics, a tag manager, or any third-party tracking script, and we do not sell or share your data with data brokers.',
          'Because the cookies we set are strictly necessary or your own saved preferences, there is no consent banner to click through. If that ever changes, this page will be updated before the change ships and you will be asked first.',
        ] },
        { h: 'Managing cookies', body: ['You can control or delete cookies through your browser settings. Blocking essential cookies may prevent parts of the Service from working.'] },
        { h: 'Changes', body: ['We may update this Cookie Policy from time to time. Changes will be posted here with an updated date.'] },
        { h: 'Contact', body: ['Questions about cookies? Contact legal@sytenav.com.'] },
      ]}
    />
  )
}
