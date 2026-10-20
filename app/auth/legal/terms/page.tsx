import type { Metadata } from 'next'
import { LegalDoc } from '@/components/marketing/legal-doc'
import { canonicalUrl } from '@/lib/canonical'
import { TERMS_INTRO, TERMS_SECTIONS, TERMS_UPDATED } from '@/lib/legal/terms'

// The bare copy the signup and login screens link to: the same text as
// /terms (lib/legal/terms.ts), without the marketing header and its Pricing link,
// which the iOS app may not show. Not indexed - /terms is the one search sees.
export const metadata: Metadata = {
  title: 'Terms of Service · SyteNav',
  robots: { index: false, follow: false },
  alternates: { canonical: canonicalUrl('/terms') },
}

export default function BareTERMS() {
  return (
    <main className="min-h-dvh bg-surface">
      <LegalDoc bare title="Terms of Service" updated={TERMS_UPDATED} intro={TERMS_INTRO} sections={TERMS_SECTIONS} />
    </main>
  )
}
