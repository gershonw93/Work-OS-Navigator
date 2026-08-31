import type { Metadata, Viewport } from 'next'
import { Archivo, Saira_Condensed, Space_Mono } from 'next/font/google'
import { CANONICAL_ORIGIN } from '@/lib/canonical'
import './globals.css'

const archivo = Archivo({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-archivo',
})

const saira = Saira_Condensed({
  subsets: ['latin'],
  display: 'swap',
  weight: ['500', '600', '700'],
  variable: '--font-saira',
})

const spaceMono = Space_Mono({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '700'],
  variable: '--font-space-mono',
})

// metadataBase is the base every RELATIVE metadata URL in the app resolves
// against - og:image, twitter:image, and any canonical given as a path.
//
// It used to fall back through VERCEL_PROJECT_PRODUCTION_URL and VERCEL_URL
// when NEXT_PUBLIC_SITE_URL was unset. That variable is not set, so the base
// silently became https://work-os-navigator.vercel.app and every page in the
// site handed Google an og:url and og:image on the deployment domain. The
// pages were telling Google they lived on vercel.app while their canonical
// tags said otherwise, which is exactly the contradiction that got the
// deployment URL indexed as a second copy of the site - and left "Vercel" as
// the name Google prints above the result.
//
// CANONICAL_ORIGIN cannot fall back to whatever host served the build: env var
// if set, the real domain otherwise. See lib/canonical.ts.
const siteUrl = CANONICAL_ORIGIN

const description =
  'Construction management built for the field. AI quote scanning, budgets, payments and escrow, invoices, scheduling, daily logs, and compliance for GCs and subs.'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'SyteNav',
  description,
  openGraph: {
    type: 'website',
    siteName: 'SyteNav',
    title: 'SyteNav',
    description,
    url: siteUrl,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SyteNav',
    description,
  },
}

/**
 * viewportFit: 'cover' is what makes env(safe-area-inset-*) return real
 * numbers instead of zero. Without it the phone app has no way to know where
 * the notch and the home indicator are, and the CSS that avoids them is inert.
 * It changes nothing in a desktop browser, where those insets are always zero.
 *
 * Pinch-zoom is deliberately left ON. Disabling it is the usual reflex for an
 * app-like feel and it is an accessibility failure - somebody reading a line
 * item in the sun needs to be able to zoom.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F4F1' },
    { media: '(prefers-color-scheme: dark)', color: '#0F1113' },
  ],
}

// Set the theme class before paint to avoid a flash of the wrong mode.
const themeScript = `(function(){try{var t=localStorage.getItem('sytenav-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){document.documentElement.classList.add('dark');}})();`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${archivo.variable} ${saira.variable} ${spaceMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-surface font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
