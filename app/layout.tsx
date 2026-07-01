import type { Metadata } from 'next'
import { Archivo, Saira_Condensed, Space_Mono } from 'next/font/google'
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

// Prefer the stable production domain over the per-deployment VERCEL_URL so
// og:image and canonical URLs stay valid when link previews are cached.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000')

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
