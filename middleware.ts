import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { APP_URL, SITE_URL, splitHosts, isAppPath, isMarketingPath } from '@/lib/hosts'
import { CANONICAL_ORIGIN, isIndexableHost, isSiteVerificationPath, shouldRedirectToCanonical } from '@/lib/canonical'

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // ── API ROUTES LEAVE IMMEDIATELY ──────────────────────────────────────────
  //
  // This is the most important line in the file, and its absence was causing
  // 504 MIDDLEWARE_INVOCATION_TIMEOUT in production.
  //
  // `supabase.auth.getUser()` below is not a cookie read - it is a NETWORK
  // ROUND TRIP to Supabase's auth server to validate the JWT. It ran on every
  // request this matcher caught, which included every /api call the app makes.
  // So each API call paid for two auth verifications: this one, plus the
  // `db.auth.getUser(token)` the route itself does from the Authorization
  // header.
  //
  // And this one's result was never used. Trace it: the host split explicitly
  // skips /api; none of the isProtectedRoute prefixes are /api; isAuthRoute
  // and isRoot cannot be /api. Pure latency, on the hot path, inside Vercel's
  // hard middleware timeout - so whenever Supabase auth was slow, saving
  // anything hung and eventually 504'd.
  //
  // API routes authenticate themselves from the Authorization header, which is
  // the real security boundary. Middleware has nothing to add to them.
  //
  // Leaving before the canonical redirect is deliberate too: a 301 across
  // origins DROPS the Authorization header, which would turn an API call on
  // the vercel.app alias into a silent 401 rather than a slow success.
  // `/api/` with the slash, not `/api` - a bare prefix test also swallows a
  // future page at /apidocs, which would then silently lose its auth redirect.
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // Before anything else: the Vercel production alias is a duplicate of the
  // whole site. A 301 to the real domain beats a noindex - it collapses the
  // copy, passes on anything linking to it, and gets the old URLs dropped
  // rather than waiting for a re-crawl to notice a meta tag.
  if (shouldRedirectToCanonical(request.headers.get('host'))
      && !isSiteVerificationPath(pathname)) {
    const target = new URL(pathname + request.nextUrl.search, CANONICAL_ORIGIN)
    return NextResponse.redirect(target, 301)
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2])
          )
        },
      },
    }
  )

  // Bounded, so a slow auth server degrades instead of timing out the whole
  // request. On timeout `user` is null and the only consequence is that the
  // convenience redirects below do not fire - the page still renders and its
  // own checks still apply. Middleware routing is UX, not the security
  // boundary; API routes and server queries verify independently.
  const AUTH_TIMEOUT_MS = 3000
  const { data: { user } } = await Promise.race([
    supabase.auth.getUser(),
    new Promise<{ data: { user: null } }>(resolve =>
      setTimeout(() => resolve({ data: { user: null } }), AUTH_TIMEOUT_MS)),
  ])

  // ── Host split ────────────────────────────────────────────────────────────
  // sytenav.com is the marketing site and nothing else; the product lives on
  // app.sytenav.com. Sending someone to the wrong host for a page is a
  // redirect, not a 404, so old bookmarks and emailed token links keep working.
  //
  // Inert until NEXT_PUBLIC_APP_URL is set, so this ships safely before the
  // DNS record exists. API routes are never redirected - a cross-origin bounce
  // would drop the Authorization header and turn every call into a 401.
  if (splitHosts && !pathname.startsWith('/api')) {
    const host = request.headers.get('host') ?? ''
    const appHost = new URL(APP_URL).host
    const onAppHost = host === appHost

    if (!onAppHost && (isAppPath(pathname) || (user && pathname === '/'))) {
      return NextResponse.redirect(new URL(pathname + request.nextUrl.search, APP_URL))
    }

    // THE ROOT IS HANDLED FIRST, and the order is load-bearing.
    //
    // '/' is now a marketing path - the marketing site moved there from
    // /homepage. So on the app host it also matches isMarketingPath, and if the
    // marketing redirect below ran first every signed-in user hitting
    // app.sytenav.com/ would be sent to www.sytenav.com/, where the rule above
    // sends a signed-in user on '/' straight back to the app host. An infinite
    // redirect loop, on the front door, for everybody who is logged in.
    //
    // The root simply means different things on the two hosts: the marketing
    // homepage on one, the dashboard on the other.
    if (onAppHost && pathname === '/') {
      const url = request.nextUrl.clone()
      url.pathname = user ? '/dashboard' : '/login'
      return NextResponse.redirect(url)
    }

    if (onAppHost && isMarketingPath(pathname)) {
      const marketing = SITE_URL || `https://${host.replace(/^app\./, '')}`
      return NextResponse.redirect(new URL(pathname + request.nextUrl.search, marketing))
    }

    // One site, one set of search results. The app is behind a login anyway,
    // but this stops the subdomain competing with the marketing pages.
    if (onAppHost) supabaseResponse.headers.set('X-Robots-Tag', 'noindex, nofollow')
  }

  const isProtectedRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/projects') ||
    pathname.startsWith('/directory') ||
    pathname.startsWith('/approvals') ||
    pathname.startsWith('/settings')

  const isAuthRoute = pathname === '/login' || pathname === '/signup'
  const isRoot = pathname === '/'

  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // A logged-out visitor on the root now RENDERS the marketing homepage rather
  // than being redirected to it. That redirect is why Google never saw a site
  // name: it reads the name from the homepage of the DOMAIN, the root returned
  // a 307 to /homepage, and every naming signal lived on the redirect target.

  if (user && (isAuthRoute || isRoot)) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Belt and braces with robots.txt. A crawler that already knows a
  // vercel.app URL - from a link, a redirect, or an old index entry - will
  // fetch it without re-reading robots.txt, and only this header will stop it
  // being listed. robots.txt asks; X-Robots-Tag tells.
  // The layout needs to know which page it is wrapping so it can emit the
  // right breadcrumb trail. A layout gets no pathname of its own, so it is
  // passed down as a header.
  supabaseResponse.headers.set('x-pathname', request.nextUrl.pathname)

  if (!isIndexableHost(request.headers.get('host'))) {
    supabaseResponse.headers.set('X-Robots-Tag', 'noindex, nofollow')
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // `api` is excluded here AND early-returned above. Belt and braces: the
    // matcher stops the function being invoked at all, and the guard keeps it
    // correct if this pattern is ever loosened.
    '/((?!api/|api$|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
