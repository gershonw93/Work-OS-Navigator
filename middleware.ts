import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { APP_URL, SITE_URL, splitHosts, isAppPath, isMarketingPath } from '@/lib/hosts'
import { CANONICAL_ORIGIN, isIndexableHost, isSiteVerificationPath, shouldRedirectToCanonical } from '@/lib/canonical'

export async function middleware(request: NextRequest) {
  // Before anything else: the Vercel production alias is a duplicate of the
  // whole site. A 301 to the real domain beats a noindex - it collapses the
  // copy, passes on anything linking to it, and gets the old URLs dropped
  // rather than waiting for a re-crawl to notice a meta tag.
  if (shouldRedirectToCanonical(request.headers.get('host'))
      && !isSiteVerificationPath(request.nextUrl.pathname)) {
    const target = new URL(request.nextUrl.pathname + request.nextUrl.search, CANONICAL_ORIGIN)
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

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

    if (onAppHost && isMarketingPath(pathname)) {
      const marketing = SITE_URL || `https://${host.replace(/^app\./, '')}`
      return NextResponse.redirect(new URL(pathname + request.nextUrl.search, marketing))
    }

    // The app host has no marketing homepage to fall back to.
    if (onAppHost && pathname === '/') {
      const url = request.nextUrl.clone()
      url.pathname = user ? '/dashboard' : '/login'
      return NextResponse.redirect(url)
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

  // Logged-out visitors landing on the root see the marketing homepage.
  if (!user && isRoot) {
    const url = request.nextUrl.clone()
    url.pathname = '/homepage'
    return NextResponse.redirect(url)
  }

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
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
