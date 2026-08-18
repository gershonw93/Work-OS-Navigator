import type { Metadata } from 'next'
import { canonicalUrl } from '@/lib/canonical'

// One helper so every marketing page ships consistent SEO: title, description,
// canonical, Open Graph, and Twitter cards. Relative URLs resolve against the
// metadataBase set in the root layout.
export function marketingMeta({
  title,
  description,
  path,
}: {
  title: string
  description: string
  path: string
}): Metadata {
  return {
    title,
    description,
    // ABSOLUTE, against the real domain - not a relative path resolved against
    // metadataBase. metadataBase falls back to the Vercel deployment URL when
    // NEXT_PUBLIC_SITE_URL is missing, which is how work-os-navigator.vercel.app
    // ended up canonicalising to itself and getting indexed as a second copy of
    // the whole site.
    alternates: { canonical: canonicalUrl(path) },
    openGraph: {
      type: 'website',
      siteName: 'SyteNav',
      title,
      description,
      url: canonicalUrl(path),
      // Setting openGraph here replaces the inherited object entirely, so the
      // root file-convention image must be re-attached explicitly or link
      // previews (WhatsApp, iMessage, Slack) lose their card image.
      images: [
        {
          url: '/opengraph-image',
          width: 1200,
          height: 630,
          alt: 'SyteNav, construction management built for the field',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/twitter-image'],
    },
  }
}
