import { ReactNode } from 'react'
import { MarketingNav } from '@/components/marketing/marketing-nav'
import { MarketingFooter } from '@/components/marketing/marketing-footer'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://sytenav.com'

// Structured data for the whole marketing site.
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'SyteNav',
      url: `${SITE_URL}/homepage`,
      description: 'Construction management software built for the field, for general contractors, subcontractors, and remodelers.',
      email: 'hello@sytenav.com',
      address: { '@type': 'PostalAddress', addressRegion: 'NJ', addressCountry: 'US' },
    },
    {
      '@type': 'SoftwareApplication',
      name: 'SyteNav',
      url: `${SITE_URL}/homepage`,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description:
        'AI-powered construction management: quote scanning, budgets, client payments and escrow, invoices, scheduling, daily logs, time clock, permits, inspections, compliance, and RFIs.',
      // Structured data has to match the page. We don't publish a list price,
      // so this states availability rather than inventing a number.
      offers: { '@type': 'Offer', priceCurrency: 'USD', availability: 'https://schema.org/LimitedAvailability', description: 'Invite-only beta, free while in beta' },
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
  ],
}

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <MarketingNav />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  )
}
