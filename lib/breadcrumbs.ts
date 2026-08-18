// The names Google prints under a result instead of chopping up the URL.
//
// Without this a result reads "sytenav.com > homepage > about", because
// /homepage is a routing detail that leaked into the search listing. The
// trails below are what a person would call these pages.

export interface Crumb { name: string; path: string }

const ROOT: Crumb = { name: 'SyteNav', path: '/homepage' }

const NAMES: Record<string, string> = {
  '/homepage/features': 'Features',
  '/homepage/money': 'Money',
  '/homepage/flows': 'Flows',
  '/homepage/workflow': 'How it works',
  '/homepage/ai': 'AI',
  '/homepage/mobile': 'On the jobsite',
  '/homepage/contractors': 'For general contractors',
  '/homepage/subcontractors': 'For subcontractors',
  '/homepage/why': 'Why SyteNav',
  '/homepage/pricing': 'Pricing',
  '/homepage/security': 'Security',
  '/homepage/about': 'About',
  '/homepage/contact': 'Contact',
  '/homepage/privacy': 'Privacy',
  '/homepage/terms': 'Terms',
  '/homepage/cookies': 'Cookies',
  '/homepage/acceptable-use': 'Acceptable use',
}

/** The trail for a path, or null where there is nothing worth marking up. */
export function crumbsFor(pathname: string | null | undefined): Crumb[] | null {
  if (!pathname) return null
  const clean = pathname.replace(/\/+$/, '') || '/'
  if (clean === '/homepage') return [ROOT]
  const name = NAMES[clean]
  if (!name) return null
  return [ROOT, { name, path: clean }]
}
