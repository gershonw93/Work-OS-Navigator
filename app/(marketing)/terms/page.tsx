import type { Metadata } from 'next'
import { LegalDoc } from '@/components/marketing/legal-doc'
import { marketingMeta } from '@/components/marketing/meta'
import { TERMS_INTRO, TERMS_SECTIONS, TERMS_UPDATED } from '@/lib/legal/terms'

export const metadata: Metadata = marketingMeta({
  title: 'Terms of Service · SyteNav',
  description:
    'The terms that govern your use of SyteNav, including accounts, billing, your data, and acceptable use.',
  path: '/terms',
})

// The text lives in lib/legal/terms.ts, shared with /auth/legal/terms.
export default function TermsPage() {
  return <LegalDoc title="Terms of Service" updated={TERMS_UPDATED} intro={TERMS_INTRO} sections={TERMS_SECTIONS} />
}
