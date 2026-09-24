import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isSuperAdmin } from '@/lib/super-admin'
import { resolveAll } from '@/lib/email-copy-read'
import { COPY_SLUGS, MERGE_TAGS, copySlug, copyProblem, withSamples, paragraphs } from '@/lib/email-copy'
import { welcomeEmail, notificationEmail } from '@/lib/email'
import { TRIAL_DAYS } from '@/lib/plans'
import { appOrigin } from '@/lib/app-url'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ─────────────────────────────────────────────────────────────────────────────
// The marketing console's one endpoint: read every email we send, change the
// words, put them back.
//
// SUPER ADMIN ONLY, gated BEFORE the body is read - no field in a request is a
// permission. These words go to every customer.
//
// THE REFUSALS ARE THE POINT. `copyProblem` is asked here as well as on the
// form, and it is the only thing standing between a console and the rules the
// test suite keeps: the trial-length pin reads SOURCE FILES, so it cannot see
// a sentence somebody typed into a browser. Without this check, a stored "your
// first 30 days are free" sails past every suite and lands in an inbox.
// ─────────────────────────────────────────────────────────────────────────────

async function gate(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return { denied: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return { denied: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!isSuperAdmin(user.email)) return { denied: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { db, user }
}

/** Render one, exactly as the product would send it, with sample values in. */
function render(slug: string, fields: { subject: string; body: string; cta?: string | null }) {
  const shown = withSamples(fields)
  const app = appOrigin(null)
  if (slug === 'welcome') {
    return welcomeEmail({
      name: 'Dana Whitfield', appUrl: app, trialDays: TRIAL_DAYS, trialEndWords: 'Fri Oct 9',
      copy: { subject: shown.subject, paragraphs: paragraphs(shown.body), cta: shown.cta },
    })
  }
  // Everything else is a notification, and goes in the notification envelope -
  // the same one `notify()` uses, so the preview is not a prettier lie.
  return notificationEmail({
    name: 'Dana Whitfield',
    eyebrow: 'Money',
    heading: shown.subject,
    message: shown.body,
    url: `${app}/settings?tab=billing`,
    settingsUrl: `${app}/settings`,
  })
}

export async function GET(request: Request) {
  const g = await gate(request)
  if ('denied' in g) return g.denied

  const resolved = await resolveAll(g.db)
  return NextResponse.json({
    tags: MERGE_TAGS,
    trialDays: TRIAL_DAYS,
    emails: COPY_SLUGS.map(spec => {
      const current = resolved[spec.slug]
      return {
        slug: spec.slug,
        label: spec.label,
        group: spec.group,
        when: spec.when,
        hasCta: spec.hasCta,
        tags: spec.tags,
        // BOTH, always. The console can only show what an override changed if
        // it can see what it replaced, and "reset" is meaningless without it.
        fallback: spec.fallback,
        current,
        html: render(spec.slug, current).html,
      }
    }),
  })
}

export async function PUT(request: Request) {
  const g = await gate(request)
  if ('denied' in g) return g.denied
  const { db, user } = g

  const body = await request.json().catch(() => ({} as any))
  const slug = String(body?.slug ?? '')
  const fields = {
    subject: String(body?.subject ?? ''),
    body: String(body?.body ?? ''),
    cta: body?.cta == null ? null : String(body.cta),
  }
  if (!copySlug(slug)) return NextResponse.json({ error: 'That is not an email we send.' }, { status: 400 })

  const problem = copyProblem(slug, fields)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const { data: me } = await db.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
  const { error } = await db.from('email_copy').upsert({
    slug,
    subject: fields.subject.trim(),
    body: fields.body.trim(),
    cta: fields.cta?.trim() || null,
    updated_by: user.id,
    updated_by_name: (me as { full_name?: string } | null)?.full_name ?? user.email ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'slug' })
  if (error) {
    console.error('[email-copy] could not save', error.message)
    return NextResponse.json({ error: 'That did not save.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, html: render(slug, fields).html })
}

/**
 * Back to the code copy.
 *
 * DELETING THE ROW, not writing the default into it. A row holding what the
 * code already says is indistinguishable from a deliberate edit that happens to
 * match - and the next time somebody improves the default in code, that row
 * silently keeps sending the old one.
 */
export async function DELETE(request: Request) {
  const g = await gate(request)
  if ('denied' in g) return g.denied

  const slug = new URL(request.url).searchParams.get('slug') ?? ''
  if (!copySlug(slug)) return NextResponse.json({ error: 'That is not an email we send.' }, { status: 400 })

  const { error } = await g.db.from('email_copy').delete().eq('slug', slug)
  if (error) {
    console.error('[email-copy] could not reset', error.message)
    return NextResponse.json({ error: 'That did not reset.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
