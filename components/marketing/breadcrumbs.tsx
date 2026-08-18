import { CANONICAL_ORIGIN } from '@/lib/canonical'

/**
 * The trail Google prints under the title instead of a bare URL.
 *
 * Without it the result reads "sytenav.com › homepage › about", because Google
 * falls back to chopping up the path - and /homepage is a routing detail no
 * visitor should ever have been shown. With a BreadcrumbList it prints the
 * names given here.
 */
export function Breadcrumbs({ trail }: { trail: { name: string; path: string }[] }) {
  const json = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.name,
      item: `${CANONICAL_ORIGIN}${t.path}`,
    })),
  }
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />
}
