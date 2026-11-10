// staging.sytenav.com is the preview of `main` and SHARES THE LIVE DATABASE.
// The danger is not that staging is wrong - it is that it hands you to the
// real site without you noticing: the app/www split and the help subdomain
// both redirect, and a preview build may carry the env vars that switch them
// on. This pins that a preview keeps everything on its own host, and that
// every page says which one you are on.

import { ok, done, code } from './_helpers'

async function main() {
  // Set BEFORE the modules load: they read the env once, at import.
  process.env.NEXT_PUBLIC_VERCEL_ENV = 'preview'
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.sytenav.com'
  process.env.NEXT_PUBLIC_SITE_URL = 'https://www.sytenav.com'
  process.env.NEXT_PUBLIC_HELP_URL = 'https://help.sytenav.com'

  const env = await import('../deploy-env')
  const hosts = await import('../hosts')
  const help = await import('../help-host')

  ok(env.isPreviewBuild, 'a preview build knows it is one')
  ok(!hosts.splitHosts, 'a preview does NOT split app and marketing across hosts, even with APP_URL set')
  ok(hosts.appHref('/login') === '/login', '...so a link into the app stays on staging')
  ok(hosts.siteHref('/pricing') === '/pricing', '...and so does a link to a marketing page')
  ok(!help.helpHostLive, 'the help pages are served on staging, not sent to help.sytenav.com')

  ok(env.previewLabel('staging.sytenav.com') === 'STAGING', 'staging is labelled STAGING')
  ok(env.previewLabel('sytenav-abc123.vercel.app') === 'PREVIEW', 'any other preview is labelled PREVIEW')

  const layout = code('app/layout.tsx')
  ok(layout.includes('<StagingBadge />'), 'the badge is on every page (root layout)')
  const badge = code('components/layout/staging-badge.tsx')
  ok(badge.includes('pointer-events-none') && !badge.includes('data-overlay'),
    'the badge never takes a tap or freezes the page')
  ok(/live data/.test(badge), 'it says WHY it matters - the data is live')

  const mw = code('middleware.ts')
  ok(mw.includes('splitHosts') && mw.includes('helpHostLive'),
    'middleware redirects only through the two switches a preview turns off')

  done()
}
main()
