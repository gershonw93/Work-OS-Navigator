import type { Metadata } from 'next'
import { LegalDoc } from '@/components/marketing/legal-doc'

export const metadata: Metadata = { title: 'Cookie Policy, SyteNav' }

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
          'Preferences: remember choices such as light or dark theme.',
          'Analytics: help us understand usage so we can improve the Service (aggregated where possible).',
        ] },
        { h: 'Managing cookies', body: ['You can control or delete cookies through your browser settings. Blocking essential cookies may prevent parts of the Service from working.'] },
        { h: 'Changes', body: ['We may update this Cookie Policy from time to time. Changes will be posted here with an updated date.'] },
        { h: 'Contact', body: ['Questions about cookies? Contact legal@sytenav.com.'] },
      ]}
    />
  )
}
