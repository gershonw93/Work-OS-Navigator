import type { Metadata } from 'next'
import { LegalDoc } from '@/components/marketing/legal-doc'
import { marketingMeta } from '@/components/marketing/meta'
import { PRIVACY_INTRO, PRIVACY_SECTIONS, PRIVACY_UPDATED } from '@/lib/legal/privacy'

export const metadata: Metadata = marketingMeta({
  title: 'Privacy Policy · SyteNav',
  description:
    'How SyteNav collects, uses, and protects your information, including project data and documents processed by AI.',
  path: '/privacy',
})

// The text lives in lib/legal/privacy.ts, shared with /auth/legal/privacy.
export default function PrivacyPage() {
  return <LegalDoc title="Privacy Policy" updated={PRIVACY_UPDATED} intro={PRIVACY_INTRO} sections={PRIVACY_SECTIONS} />
}
