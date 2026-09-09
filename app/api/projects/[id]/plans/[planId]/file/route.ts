import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient as cookieClient } from '@/lib/supabase/server'

// ─────────────────────────────────────────────────────────────────────────────
// The bytes of one plan, from OUR origin.
//
// THE BUG. Every plan on the demo projects opened as an error. Their rows carry
// no `storage_path` and a `file_url` pointing at a PDF on w3.org, and pdf.js
// reads the bytes from the BROWSER - so the read is a cross-origin one, w3.org
// sends no CORS headers, and it is refused. Not sometimes: every plan whose
// file lives anywhere that does not opt us in, on every device, always.
//
// Whether a drawing opens should not depend on which server its file sits on.
// It is fetched through here now, which is same-origin by construction.
//
// The other half is `storage_path`. A plan's `file_url` is a signed Supabase
// URL minted ONCE at upload with a ten-year life, so it is only as good as the
// key that signed it: rotate that key and an entire library of drawings dies at
// the same instant, with the rows still sitting there looking fine. Signing
// fresh on each request costs nothing and cannot go stale.
//
// The URL is never taken from the request - only from the row - so this cannot
// be pointed at anything the caller chooses.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(
  _request: Request,
  { params }: { params: { id: string; planId: string } },
) {
  // Cookies, not a Bearer token: this is loaded by `<img src>` and by pdf.js,
  // and neither of those can be given an Authorization header.
  const { data: { user } } = await cookieClient().auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const db = admin()
  const { data: plan } = await db
    .from('project_plans')
    .select('storage_path, file_url, name')
    .eq('id', params.planId)
    .eq('project_id', params.id)
    .maybeSingle()

  if (!plan) return new NextResponse('Not found', { status: 404 })

  // Ours: sign it now, and let the client fetch it straight from storage so a
  // 40MB drawing never travels through a serverless function.
  if (plan.storage_path) {
    const { data } = await db.storage.from('plans').createSignedUrl(plan.storage_path, 60 * 10)
    if (data?.signedUrl) return NextResponse.redirect(data.signedUrl)
  }

  // Somebody else's: fetch it here and hand it back from our own origin, which
  // is the whole point - a redirect would leave the browser making the same
  // cross-origin request that was refused in the first place.
  if (!plan.file_url) return new NextResponse('This plan has no file on it.', { status: 404 })

  let upstream: Response
  try {
    upstream = await fetch(plan.file_url, { redirect: 'follow' })
  } catch {
    return new NextResponse('Could not reach the file.', { status: 502 })
  }
  if (!upstream.ok || !upstream.body) {
    return new NextResponse(`The file could not be read (${upstream.status}).`, { status: 502 })
  }

  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      // Private: it is signed-in content, and one person's browser caching it
      // is fine while a shared cache holding it is not.
      'Cache-Control': 'private, max-age=300',
    },
  })
}
