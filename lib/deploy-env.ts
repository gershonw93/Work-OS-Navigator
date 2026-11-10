// ─────────────────────────────────────────────────────────────────────────────
// Which Vercel environment this build is - production, or a preview (which is
// what staging.sytenav.com is: the preview of `main`).
//
// WHY IT EXISTS. Staging shares PRODUCTION'S DATABASE (the owner's decision),
// so the one thing it must never do is hand somebody to the real site without
// them noticing. The host split (lib/hosts.ts) and the help subdomain
// (lib/help-host.ts) are both switched on by env vars that a preview build may
// well carry, and both REDIRECT: staging.sytenav.com/dashboard would bounce to
// app.sytenav.com and every "test" after that would be on production, in the
// real app, with nothing on the screen to say so. A preview keeps everything
// on its own host instead, and says what it is (`StagingBadge`).
//
// Edge-safe and import-free: middleware reads it.
//
// NEXT_PUBLIC_VERCEL_ENV is the framework copy Vercel exposes to the browser
// bundle; VERCEL_ENV is the server/edge one. Neither is set locally, which
// reads as "not a preview" - a local dev server behaves as it always has.
// ─────────────────────────────────────────────────────────────────────────────

export const VERCEL_ENV = process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV || ''

/** True on a Vercel preview build - staging included. */
export const isPreviewBuild = VERCEL_ENV === 'preview'

/** What the badge calls this host: STAGING on staging.*, PREVIEW on any other preview. */
export function previewLabel(hostname: string | null | undefined): 'STAGING' | 'PREVIEW' {
  return String(hostname ?? '').toLowerCase().startsWith('staging.') ? 'STAGING' : 'PREVIEW'
}
