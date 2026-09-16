// The "Vercel" in the search result, and the four signals that decide it.
//
// Google prints a SITE NAME above a result - the line reading "Vercel" next to
// the favicon. It is chosen for the whole domain, from the HOMEPAGE, and when
// nothing on the homepage names the site Google guesses from what it has
// crawled. What it had crawled was work-os-navigator.vercel.app, so it printed
// the host.
//
// #396 fixed that: a WebSite node naming the site, canonicals that cannot fall
// back to the deployment URL, robots that refuses every non-canonical host, and
// a 301 collapsing the production alias. Nothing pinned any of it, which is the
// reason for this file - `marketingMeta` is one edit away from dropping
// `siteName`, and the WebSite node is one refactor away from being a
// SoftwareApplication with a name field that Google does not read for this.
//
// THE FOUR SIGNALS, in the order Google weighs them:
//   1. WebSite structured data `name`  (on the homepage)
//   2. og:site_name
//   3. the homepage <title>
//   4. the homepage h1
//
// `<meta name="application-name">` is NOT one of them. It is a PWA and Windows
// tile hint, and it is set in this app because the app is installable - not
// because it does anything for this. Written down so the next person handed
// that advice does not re-do the whole file chasing it.

import { CANONICAL_ORIGIN, canonicalUrl, isIndexableHost, shouldRedirectToCanonical, isSiteVerificationPath } from '../canonical'
import { ok, done, code, read } from './_helpers'

// ── 1. the WebSite node, on the homepage ────────────────────────────────────
// `read()`, not `code()`: the node's URLs contain `//` and the comment above it
// quotes the bug, both of which the comment-stripper eats.
const layout = read('app/(marketing)/layout.tsx')
ok(/'@type': 'WebSite'/.test(layout),
  'THE SIGNAL: a WebSite node exists at all - without it Google guesses, and what it guessed was the host')
{
  const at = layout.indexOf("'@type': 'WebSite'")
  const node = layout.slice(at, at + 500)
  ok(/name: 'SyteNav'/.test(node), "...and it names the site 'SyteNav'")
  ok(/url: `\$\{CANONICAL_ORIGIN\}\/`/.test(node),
    '...at the canonical origin, not a hardcoded spelling that can drift from the canonical tags')
}
// It has to be on the page Google reads the site name FROM. The marketing
// layout wraps '/', which is the homepage on the marketing host.
ok(/export default function MarketingLayout/.test(layout),
  'the node ships from the layout that wraps the marketing homepage')

// ── 2. og:site_name, on every marketing page ────────────────────────────────
const meta = code('components/marketing/meta.ts')
ok(/siteName: 'SyteNav'/.test(meta),
  'og:site_name is set by the one helper every marketing page uses')

// ── 3. the homepage title LEADS with the name ───────────────────────────────
const home = code('app/(marketing)/page.tsx')
{
  const m = /title: '([^']+)'/.exec(home)
  ok(!!m, 'the homepage sets a title')
  ok(!!m && m[1].startsWith('SyteNav'),
    `...and it leads with SyteNav, which is the third signal (${m?.[1]})`)
  ok(!!m && !/vercel/i.test(m[1]), '...and says nothing about the host it happens to run on')
}

// ── nothing shipped says "Vercel" ───────────────────────────────────────────
// Comments explaining the bug are not the bug - hence code(), which strips
// them. The manifest is checked separately because it is not a .tsx file and
// a starter template leaves the platform's name in `name`.
for (const f of [
  'app/(marketing)/page.tsx',
  'app/layout.tsx',
  'app/manifest.ts',
  'components/marketing/meta.ts',
]) {
  ok(!/vercel/i.test(code(f)), `${f} ships no "Vercel" string`)
}
ok(/name: 'SyteNav'/.test(code('app/manifest.ts')), 'the web manifest names the app SyteNav')

// ── 4. the deployment URL cannot compete ────────────────────────────────────
// A second indexed copy of the site is what made Google guess in the first
// place: it had crawled the vercel.app host and took the name from there.
ok(CANONICAL_ORIGIN === 'https://www.sytenav.com' || !!process.env.NEXT_PUBLIC_SITE_URL,
  `the canonical origin is the real domain, not a deployment URL (${CANONICAL_ORIGIN})`)
ok(!/vercel/i.test(CANONICAL_ORIGIN), '...and cannot itself be a vercel.app host')

ok(isIndexableHost('www.sytenav.com'), 'the real host is indexable')
ok(isIndexableHost('sytenav.com'), '...and so is the apex, so dropping the www is not served noindex')
for (const host of [
  'work-os-navigator.vercel.app',
  'sytenav-git-claude-admiring-2f4b70-gershon-weisblum-s-projects.vercel.app',
  'sytenav-1saxqptc8-gershon-weisblum-s-projects.vercel.app',
]) {
  ok(!isIndexableHost(host), `a deployment alias is not indexable (${host.slice(0, 32)}…)`)
}

ok(shouldRedirectToCanonical('work-os-navigator.vercel.app'),
  'THE DUPLICATE: the permanent production alias 301s to the real domain rather than only being noindexed')
ok(!shouldRedirectToCanonical('sytenav-git-claude-admiring-2f4b70-gershon-weisblum-s-projects.vercel.app'),
  '...but a preview alias does NOT, or testing a branch before it ships would bounce to production')

// A 301 on the verification file would make it impossible to prove the
// duplicate is yours, which is what lets you ask for its removal.
ok(isSiteVerificationPath('/google1a2b3c4d5e6f.html'),
  "Google's ownership check is exempt from that redirect")
ok(!isSiteVerificationPath('/features'), '...and nothing else is')

// ── the wiring, because a rule nothing calls is decoration ──────────────────
const middleware = code('middleware.ts')
ok(/shouldRedirectToCanonical\(request\.headers\.get\('host'\)\)/.test(middleware),
  'middleware really performs the redirect')
ok(/isSiteVerificationPath\(pathname\)/.test(middleware), '...with the verification exemption applied')
ok(/isIndexableHost\(request\.headers\.get\('host'\)\)/.test(middleware),
  '...and noindexes everything else')

const robots = code('app/robots.ts')
ok(/if \(!isIndexableHost\(host\)\)/.test(robots),
  'robots.txt refuses the whole tree on a non-canonical host')
ok(/host: CANONICAL_ORIGIN/.test(robots), '...and names the canonical host')

// ── canonicals point at one place ───────────────────────────────────────────
ok(canonicalUrl('/') === 'https://www.sytenav.com' || canonicalUrl('/').startsWith(CANONICAL_ORIGIN),
  'the homepage canonical is the canonical origin')
ok(/alternates: \{ canonical: canonicalUrl\(path\) \}/.test(meta),
  'every marketing page canonicalises through the one helper')
ok(/ABSOLUTE/.test(read('components/marketing/meta.ts')),
  '...absolutely, because metadataBase falls back to the deployment URL when the env var is missing')

// ── the sitemap does not lie about when things changed ──────────────────────
// `lastmod` is content data. Every URL used to carry `new Date()`, so a deploy
// that changed one dependency told Google the privacy policy and all ten guides
// had just been rewritten - and Google says plainly that it ignores `lastmod`
// once it stops matching reality, which costs the honest dates too. Exactly the
// rule the guide pages already follow for `dateModified`; the sitemap was the
// one place still stamping the clock, on everything at once.
{
  const sitemap = code('app/sitemap.ts')
  ok(!/lastModified: new Date\(\)/.test(sitemap),
    'THE BUILD CLOCK: no URL is stamped with the time the build happened to run')
  ok(/lastModified: g\.updated \?\? g\.published/.test(sitemap),
    'a guide sends its real content date, the same pair its own dateModified reads')
  ok(/\.\.\.\(p\.lastModified \? \{ lastModified/.test(sitemap),
    '...and a page with no real date sends NO lastmod, rather than an invented one')
}

done()
