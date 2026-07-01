import type { Metadata } from 'next'
import { LegalDoc } from '@/components/marketing/legal-doc'

export const metadata: Metadata = { title: 'Acceptable Use Policy, SyteNav' }

export default function AcceptableUsePage() {
  return (
    <LegalDoc
      title="Acceptable Use Policy"
      updated="July 1, 2026"
      intro="This Acceptable Use Policy describes activities that are prohibited when using SyteNav. It is part of our Terms of Service."
      sections={[
        { h: 'Prohibited activities', body: ['You agree not to:'], list: [
          'Break the law or infringe the rights of others',
          'Upload malware or attempt to disrupt, overload, or gain unauthorized access to the Service',
          'Reverse engineer, resell, or misuse the Service beyond what your plan permits',
          'Upload content you do not have the right to share, or others’ personal data without a lawful basis',
          'Use the Service to send spam or harass, threaten, or defraud anyone',
          'Interfere with other customers’ use of the Service',
        ] },
        { h: 'Enforcement', body: ['We may investigate suspected violations and may suspend or terminate access to protect the Service and our users. Serious violations may be reported to authorities.'] },
        { h: 'Reporting abuse', body: ['To report misuse of the Service, contact legal@sytenav.com.'] },
      ]}
    />
  )
}
