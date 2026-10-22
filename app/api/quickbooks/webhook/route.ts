import { NextResponse } from 'next/server'
import { admin } from '@/lib/quickbooks'
import { parseWebhook, signatureValid } from '@/lib/qbo-pull'
import { processPending, recordEvents } from '@/lib/quickbooks-pull'

export const runtime = 'nodejs'
export const maxDuration = 30

// ─────────────────────────────────────────────────────────────────────────────
// Intuit's webhook: "these records changed in this QuickBooks company".
//
// SIGNED OR REFUSED. No signed-in user can be asked here - Intuit is calling -
// so the only proof is the HMAC Intuit puts in `intuit-signature`, made with
// the verifier token from the Intuit developer portal (QBO_WEBHOOK_VERIFIER).
// With no token configured the route refuses everything: an unsigned call that
// could flag or create money records is the thing this guards against.
//
// WRITE FIRST, ANSWER FAST. Intuit wants a quick 200 and retries otherwise, so
// the changes are stored (de-duplicated) before anything else, and only then
// applied - within a short budget. Whatever is left is applied by the daily
// read or the next webhook; a change written down is never lost.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const raw = await request.text()
  const verifier = process.env.QBO_WEBHOOK_VERIFIER
  if (!verifier) return NextResponse.json({ error: 'Webhooks are not configured.' }, { status: 503 })
  if (!signatureValid(raw, request.headers.get('intuit-signature'), verifier)) {
    return NextResponse.json({ error: 'Bad signature.' }, { status: 401 })
  }
  let body: unknown
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ error: 'Not JSON.' }, { status: 400 }) }

  const db = admin()
  const recorded = await recordEvents(db, parseWebhook(body), 'webhook')
  if (recorded) await processPending(db, { budgetMs: 2_000, limit: 10 })
  return NextResponse.json({ ok: true, recorded })
}
