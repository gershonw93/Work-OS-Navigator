import type { Metadata } from 'next'
import { LegalDoc } from '@/components/marketing/legal-doc'
import { canonicalUrl } from '@/lib/canonical'
import { PRIVACY_INTRO, PRIVACY_SECTIONS, PRIVACY_UPDATED } from '@/lib/legal/privacy'

// The bare copy the signup and login screens link to: the same text as
// /privacy (lib/legal/privacy.ts), without the marketing header and its Pricing link,
// which the iOS app may not show. Not indexed - /privacy is the one search sees.
export const metadata: Metadata = {
  title: 'Privacy Policy · SyteNav',
  robots: { index: false, follow: false },
  alternates: { canonical: canonicalUrl('/privacy') },
}

export default function BarePRIVACY() {
  return (
    <main className="min-h-dvh bg-surface">
      <LegalDoc bare title="Privacy Policy" updated={PRIVACY_UPDATED} intro={PRIVACY_INTRO} sections={PRIVACY_SECTIONS} />
    </main>
  )
}
