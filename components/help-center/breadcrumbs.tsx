import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { helpCanonical, helpHref } from '@/lib/help-host'

// The trail on a Help Center page, and the BreadcrumbList Google prints from.
// Built from the same list, so the visible trail and the markup cannot differ.
export function HelpBreadcrumbs({ trail }: { trail: { label: string; path: string }[] }) {
  const full = [{ label: 'Help Center', path: '/' }, ...trail]
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: full.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.label, item: helpCanonical(c.path) })),
  }
  return (
    <nav aria-label="Breadcrumb">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-fg">
        {full.map((c, i) => (
          <li key={c.path} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden />}
            {i < full.length - 1
              ? <Link href={helpHref(c.path)} className="hover:text-ink">{c.label}</Link>
              : <span className="truncate text-ink-soft" aria-current="page">{c.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  )
}
