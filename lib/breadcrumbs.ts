// The names Google prints under a result instead of chopping up the URL.
//
// This began as damage control: results read "sytenav.com > homepage > about"
// because /homepage was a routing detail that had leaked into the listing. The
// site has since moved to the root, so the path is honest on its own - but a
// named trail still beats a slug, and "For general contractors" reads better
// than "contractors".

export interface Crumb { name: string; path: string }

const ROOT: Crumb = { name: 'SyteNav', path: '/' }

const NAMES: Record<string, string> = {
  '/features': 'Features',
  '/money': 'Money',
  '/flows': 'Flows',
  '/workflow': 'How it works',
  '/ai': 'AI',
  '/mobile': 'On the jobsite',
  '/contractors': 'For general contractors',
  '/subcontractors': 'For subcontractors',
  '/why': 'Why SyteNav',
  '/pricing': 'Pricing',
  '/security': 'Security',
  '/about': 'About',
  '/contact': 'Contact',
  '/privacy': 'Privacy',
  '/terms': 'Terms',
  '/cookies': 'Cookies',
  '/acceptable-use': 'Acceptable use',
}

/** The trail for a path, or null where there is nothing worth marking up. */
export function crumbsFor(pathname: string | null | undefined): Crumb[] | null {
  if (!pathname) return null
  const clean = pathname.replace(/\/+$/, '') || '/'
  // No trail on the homepage. A breadcrumb whose only entry is the page you
  // are already on tells a reader nothing.
  if (clean === '/') return null
  const name = NAMES[clean]
  if (!name) return null
  return [ROOT, { name, path: clean }]
}
