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
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}
