import { ReactNode } from 'react'
import { headers } from 'next/headers'
import { Breadcrumbs } from '@/components/marketing/breadcrumbs'
import { crumbsFor } from '@/lib/breadcrumbs'
import { MarketingNav } from '@/components/marketing/marketing-nav'
import { MarketingFooter } from '@/components/marketing/marketing-footer'
import { CANONICAL_ORIGIN } from '@/lib/canonical'

// Structured data for the whole marketing site.
//
// Two things were wrong here and both showed up in the search results.
//
// The origin was its own fallback chain ending at the APEX, so every @id and
// url in this graph said https://sytenav.com while every canonical tag said
// https://www.sytenav.com. To Google those are two different sites, so the
// graph never attached to the pages it was describing. It now uses the same
// CANONICAL_ORIGIN as the canonicals, because there is only one right answer
// to "where does this site live" and it should be stated once.
//
// And there was no WebSite node at all. WebSite.name is the FIRST thing Google
// reads to decide the site name printed above a result; with it missing it
// fell back to guessing, and what it had crawled was the vercel.app copy - so
// it printed "Vercel". Naming the site explicitly is the only direct signal
// there is.
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${CANONICAL_ORIGIN}/#website`,
      name: 'SyteNav',
      alternateName: 'SyteNav Construction Management',
      // The site root, not /homepage. Google reads the site name against the
      // domain, and /homepage is a routing detail.
      url: `${CANONICAL_ORIGIN}/`,
      publisher: { '@id': `${CANONICAL_ORIGIN}/#organization` },
      inLanguage: 'en-US',
    },
    {
      '@type': 'Organization',
      '@id': `${CANONICAL_ORIGIN}/#organization`,
      name: 'SyteNav',
      url: `${CANONICAL_ORIGIN}/`,
      description: 'Construction management software built for the field, for general contractors, subcontractors, and remodelers.',
      email: 'hello@sytenav.com',
      address: { '@type': 'PostalAddress', addressRegion: 'NJ', addressCountry: 'US' },
    },
    {
      '@type': 'SoftwareApplication',
      name: 'SyteNav',
      url: `${CANONICAL_ORIGIN}/homepage`,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description:
        'AI-powered construction management: quote scanning, budgets, client payments and escrow, invoices, scheduling, daily logs, time clock, permits, inspections, compliance, and RFIs.',
      // Structured data has to match the page. We don't publish a list price,
      // so this states availability rather than inventing a number.
      offers: { '@type': 'Offer', priceCurrency: 'USD', availability: 'https://schema.org/LimitedAvailability', description: 'Invite-only beta, free while in beta' },
      publisher: { '@id': `${CANONICAL_ORIGIN}/#organization` },
    },
  ],
}

export default function MarketingLayout({ children }: { children: ReactNode }) {
  // Middleware hands the path down, because a layout is not told which page it
  // is wrapping. Without it every result shows Google's own guess at a trail,
  // which is where "> homepage >" came from.
  const crumbs = crumbsFor(headers().get('x-pathname'))

  return (
    <div className="min-h-screen bg-surface text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {crumbs && <Breadcrumbs trail={crumbs} />}
      <MarketingNav />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  )
}
