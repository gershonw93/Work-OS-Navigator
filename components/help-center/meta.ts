import type { Metadata } from 'next'
import { helpCanonical } from '@/lib/help-host'

// Every Help Center page's metadata. Same reasoning as marketingMeta: the
// canonical is ABSOLUTE and built from a fixed origin, never resolved against
// metadataBase, which can fall back to the deployment URL.
export function helpMeta({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  const url = helpCanonical(path)
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      siteName: 'SyteNav Help Center',
      title,
      description,
      url,
      images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'SyteNav Help Center' }],
    },
    twitter: { card: 'summary_large_image', title, description, images: ['/twitter-image'] },
  }
}
