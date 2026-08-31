import { NextResponse } from 'next/server'

// ─────────────────────────────────────────────────────────────────────────────
// The file Apple fetches to decide whether a link may open the SyteNav app.
//
// WHY THIS AND NOT sytenav://. A password-reset or invite email has to work
// everywhere - a desktop, an Android phone, a colleague's laptop - so the link
// in it must be an ordinary https:// URL. A custom scheme in an email is a
// dead link for everybody who does not have the app.
//
// Universal Links solve exactly that: the link stays a normal web address, and
// iOS quietly opens the app instead of Safari for anybody who has it installed.
// The price is that Apple verifies the claim by fetching this file from the
// domain itself, which is why it has to be served rather than shipped.
//
// INERT UNTIL CONFIGURED, on purpose. It needs the Apple Team ID, which does
// not exist until the Developer Program enrolment finishes. Without it this
// answers 404 - the honest answer, and the one that keeps iOS from caching a
// broken association. Set APPLE_TEAM_ID and it starts working with no deploy.
//
// The app side is a second step and is NOT done yet: the Associated Domains
// entitlement, which needs that capability enabled on the App ID. Deliberately
// left until after the first TestFlight build, because an entitlement the App
// ID does not carry fails code signing - and that would break the build that
// matters most. See MOBILE.md.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs'
// Apple re-fetches this rarely and caches hard; there is nothing per-request
// about it, but it must reflect an env var change without a redeploy.
export const dynamic = 'force-dynamic'

export async function GET() {
  const teamId = process.env.APPLE_TEAM_ID?.trim()
  const bundleId = process.env.APNS_BUNDLE_ID?.trim() || 'com.sytenav.app'
  if (!teamId) {
    return new NextResponse('Not configured', { status: 404 })
  }

  return NextResponse.json({
    applinks: {
      details: [{
        appIDs: [`${teamId}.${bundleId}`],
        components: [
          // The links worth opening in the app: finishing a sign-in, setting a
          // password, accepting an invite. Everything else - the marketing
          // site, a shared portal link somebody sent a client - stays in the
          // browser, where the person without the app also needs it to work.
          { '/': '/auth/callback', comment: 'Finishing a sign-in' },
          { '/': '/reset-password*', comment: 'Setting a new password' },
          { '/': '/signup*', comment: 'Accepting an invite' },
        ],
      }],
    },
  }, {
    // Apple requires application/json and will not follow a redirect to get
    // it. NextResponse.json sets this; it is spelled out because a change here
    // silently unhooks every universal link.
    headers: { 'content-type': 'application/json' },
  })
}
