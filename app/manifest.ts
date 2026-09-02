import type { MetadataRoute } from 'next'

// ─────────────────────────────────────────────────────────────────────────────
// The web app manifest - what makes "Add to Home Screen" produce an app rather
// than a bookmark.
//
// THE GAP THIS FILLS. There was no manifest at all. Adding SyteNav to a home
// screen gave you an icon that opened in a browser view, address bar and all -
// while the Help article told people to do exactly that and said "it behaves
// like an app". The doc was ahead of the product, which is the same shape of
// problem as the cookie policy claiming analytics we do not run.
//
// `display: standalone` is the line that removes the browser chrome. Everything
// else here is what the phone shows while it launches: the icon, and the colour
// behind it before the first paint.
//
// The icons come from `resources/icon.png` - the same 1024px source the iOS and
// Android launcher icons are generated from - so the home-screen icon, the App
// Store icon and the Play Store icon cannot drift apart.
//
// `start_url: '/dashboard'` rather than '/': the root is the marketing site, and
// somebody who installed the app wants the app. An unauthenticated visit still
// redirects to login, so nobody is stranded.
// ─────────────────────────────────────────────────────────────────────────────

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SyteNav',
    short_name: 'SyteNav',
    description: 'Construction management for the field and the office.',
    start_url: '/dashboard',
    display: 'standalone',
    orientation: 'any',
    // Matches the light theme's paper, so the splash does not flash white on a
    // dark phone and does not flash dark on a light one.
    background_color: '#F4F4F1',
    theme_color: '#F4F4F1',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // `maskable` lets Android crop to its own shape without clipping the mark.
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
