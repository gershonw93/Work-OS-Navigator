import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { tokenLinkEmail } from '@/lib/email'
import { deliverLink, readSendBody } from '@/lib/send-link'
import { notify } from '@/lib/notify'
import { appOrigin } from '@/lib/app-url'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Email a sub their private link to quote a scope of work.
 *
 * Sending to somebody who has ALREADY been sent this link, and has not
 * submitted, is a reminder - that is what a nudge is, there is no separate
 * button for it. So the copy changes and `bid_reminder` fires, which is the
 * only thing that switch in Notification Preferences has ever had to read: its
 * previous emitter was a route retired along with the old Bids tab.
 */
export async function POST(request: Request, { params }: { params: { id: string; reqId: string; inviteId: string } }) {
  const auth = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(auth)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { to, note } = await readSendBody(request)

  const [{ data: invite }, { data: req }, { data: me }] = await Promise.all([
    db.from('bid_invites').select('token, vendor_name, status, vendor_company_id').eq('id', params.inviteId).maybeSingle(),
    db.from('bid_requests').select('title, trade, due_date').eq('id', params.reqId).maybeSingle(),
    db.from('profiles').select('full_name, company_id').eq('id', user.id).maybeSingle(),
  ])
  if (!invite?.token) return NextResponse.json({ error: 'That invite no longer exists.' }, { status: 404 })

  const { data: company } = (me as any)?.company_id
    ? await db.from('companies').select('name').eq('id', (me as any).company_id).maybeSingle()
    : { data: null }

  // Told before, still nothing back. 'submitted' and 'declined' are answers,
  // so re-sending to those is a fresh ask, not a chase.
  const isReminder = invite.status === 'invited' || invite.status === 'viewed'

  const scope = [(req as any)?.title, (req as any)?.trade].filter(Boolean).join(' - ') || 'a scope of work'
  const due = (req as any)?.due_date
    ? `Please get it back by ${new Date((req as any).due_date + 'T00:00:00').toLocaleDateString()}.`
    : null

  const email = tokenLinkEmail({
    recipientName: invite.vendor_name,
    eyebrow: isReminder ? 'Quote reminder' : 'Request for quote',
    heading: isReminder ? `Still need your price: ${scope}` : `Quote request: ${scope}`,
    lines: isReminder
      ? [
          `Just a nudge - ${(company as any)?.name ?? 'a contractor'} is still waiting on your price for ${scope}.`,
          'Your link is below; the scope and any plans are on it, and you can submit straight from there.',
          ...(due ? [due] : []),
        ]
      : [
          `${(company as any)?.name ?? 'A contractor'} would like your price for ${scope}.`,
          'The link has the scope and any plans attached, and you can submit your quote straight from it.',
          ...(due ? [due] : []),
        ],
    ctaLabel: 'View scope and quote',
    url: `${appOrigin(request.headers.get('origin'))}/bid/${invite.token}`,
    fromName: (me as any)?.full_name ?? null,
    companyName: (company as any)?.name ?? null,
    note,
  })

  return deliverLink({
    to,
    email,
    onSent: async () => {
      // A chase must not knock 'viewed' back to 'invited' - that would lose the
      // one signal telling the GC whether the sub has even opened it.
      if (!isReminder) {
        // 'invited' is this table's sent state; it starts null until somebody
        // is actually told, and moves to viewed/submitted from the sub's side.
        await db.from('bid_invites').update({ status: 'invited' }).eq('id', params.inviteId)
      }

      // The in-app half of the nudge, for a sub who has an account. Sending
      // this to somebody who only ever gets the email costs nothing: notify()
      // finds no profiles and does nothing.
      if (isReminder && invite.vendor_company_id) {
        const { data: profiles } = await db.from('profiles').select('id').eq('company_id', invite.vendor_company_id)
        if (profiles?.length) {
          await notify({
            db,
            userIds: profiles.map((p: any) => p.id),
            type: 'bid_reminder',
            title: 'Quote still needed',
            message: `${(company as any)?.name ?? 'A contractor'} is still waiting on your price for ${scope}.`,
            link: '/my-bids',
          })
        }
      }
    },
  })
}
