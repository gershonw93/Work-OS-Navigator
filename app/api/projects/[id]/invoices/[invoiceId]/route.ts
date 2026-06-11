import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'
import { createNotification } from '@/lib/notify'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; invoiceId: string } },
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { status, due_date, description } = body

  // Fetch existing invoice
  const { data: invoice, error: fetchError } = await db
    .from('invoices')
    .select('*')
    .eq('id', params.invoiceId)
    .single()

  if (fetchError || !invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  // Build update payload from allowed fields
  const updates: Record<string, unknown> = {}
  if (status !== undefined) updates.status = status
  if (due_date !== undefined) updates.due_date = due_date
  if (description !== undefined) updates.description = description

  if (status === 'approved') {
    const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).single()
    updates.approved_at = new Date().toISOString()
    updates.approved_by_name = (profile as any)?.full_name ?? null

    await logActivity(db, params.id, (profile as any)?.full_name ?? 'GC', 'invoice_approved', `Invoice ${invoice.invoice_number} approved — $${Number(invoice.amount).toLocaleString()}`)

    // Notify sub company
    if (invoice.company_id) {
      const { data: subProfiles } = await db
        .from('profiles')
        .select('id')
        .eq('company_id', invoice.company_id)
      if (subProfiles?.length) {
        await Promise.all(
          subProfiles.map(p =>
            createNotification(
              db,
              p.id,
              `Invoice Approved`,
              `Invoice ${invoice.invoice_number} has been approved — $${Number(invoice.amount).toLocaleString()}`,
              `/projects/${params.id}/invoices`,
              'invoice_approved',
            )
          )
        )
      }
    }
  } else if (status === 'sent') {
    updates.sent_at = new Date().toISOString()

    const { data: gcProfile } = await db.from('profiles').select('full_name').eq('id', user.id).single()
    await logActivity(db, params.id, (gcProfile as any)?.full_name ?? 'GC', 'invoice_sent', `Invoice ${invoice.invoice_number} sent to sub — $${Number(invoice.amount).toLocaleString()}`)

    // Notify sub company
    if (invoice.company_id) {
      const { data: subProfiles } = await db
        .from('profiles')
        .select('id')
        .eq('company_id', invoice.company_id)
      if (subProfiles?.length) {
        await Promise.all(
          subProfiles.map(p =>
            createNotification(
              db,
              p.id,
              `Invoice Sent`,
              `Invoice ${invoice.invoice_number} — $${Number(invoice.amount).toLocaleString()}. Please review.`,
              `/projects/${params.id}/invoices`,
              'invoice_sent',
            )
          )
        )
      }
    }
  } else if (status === 'paid') {
    const { data: paidProfile } = await db.from('profiles').select('full_name').eq('id', user.id).single()
    await logActivity(db, params.id, (paidProfile as any)?.full_name ?? 'GC', 'invoice_paid', `Invoice ${invoice.invoice_number} marked as paid — $${Number(invoice.amount).toLocaleString()}`)

    // Notify sub company
    if (invoice.company_id) {
      const { data: subProfiles } = await db
        .from('profiles')
        .select('id')
        .eq('company_id', invoice.company_id)
      if (subProfiles?.length) {
        await Promise.all(
          subProfiles.map(p =>
            createNotification(
              db,
              p.id,
              `Invoice Paid`,
              `Invoice ${invoice.invoice_number} has been marked as paid — $${Number(invoice.amount).toLocaleString()}`,
              `/projects/${params.id}/invoices`,
              'invoice_paid',
            )
          )
        )
      }
    }

    // Mark related payment schedule item as paid
    if (invoice.payment_schedule_item_id) {
      await db
        .from('payment_schedule_items')
        .update({ status: 'paid' })
        .eq('id', invoice.payment_schedule_item_id)
    }
  }

  const { data, error } = await db
    .from('invoices')
    .update(updates)
    .eq('id', params.invoiceId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ invoice: data })
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; invoiceId: string } },
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await db.from('invoices').delete().eq('id', params.invoiceId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
