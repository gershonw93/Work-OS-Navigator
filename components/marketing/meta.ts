import type { Metadata } from 'next'

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
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      siteName: 'SyteNav',
      title,
      description,
      url: path,
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
