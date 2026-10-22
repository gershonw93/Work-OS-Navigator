import { NextResponse } from 'next/server'
import { admin, getValidConnection } from '@/lib/quickbooks'
import { ACCOUNT_KINDS, KIND_BY_NAME, isAccountKind, listOptions, readChoices, type AccountKind, type AccountOption } from '@/lib/qbo-accounts'
import { requirePermission, denied } from '@/lib/api-guard'
import { mayManageCompanySetting } from '@/lib/company-access'

export const runtime = 'nodejs'
export const maxDuration = 30

// ─────────────────────────────────────────────────────────────────────────────
// Where each push lands in QuickBooks - the four dropdowns on the card.
//
// GET lists what may be chosen, read LIVE from the connected QuickBooks
// company (active accounts and items only), plus what is chosen now. A list
// that could not be read is said, per kind - never an empty dropdown, which
// reads as "you have no bank accounts".
//
// POST saves one choice. The id is checked against a FRESH list from
// QuickBooks before it is stored: an id out of a request body is a claim, and
// a wrong one would send every bill to an account that is not on the screen.
// `qboId: null` is Automatic, which DELETES the row (lib/qbo-accounts.ts).
// Admin only, the same as connecting.
// ─────────────────────────────────────────────────────────────────────────────

async function gateFor(request: Request) {
  const db = admin()
  const gate = await requirePermission(db, request, 'settings_company', 'view')
  if (denied(gate)) return { res: gate.denied }
  const companyId = gate.actor.companyId
  if (!companyId) return { res: NextResponse.json({ error: 'No company' }, { status: 400 }) }
  return { db, gate, companyId }
}

export async function GET(request: Request) {
  const g = await gateFor(request)
  if ('res' in g) return g.res
  const conn = await getValidConnection(g.db, g.companyId)
  if (!conn) return NextResponse.json({ connected: false, kinds: [] })

  const choices = await readChoices(g.db, conn)
  const kinds = await Promise.all(ACCOUNT_KINDS.map(async spec => {
    let options: AccountOption[] | null = null
    let error: string | null = null
    try { options = await listOptions(conn, spec.kind) } catch (err: any) {
      console.error('[quickbooks/accounts] list', spec.kind, err?.message)
      error = 'Could not read this list from QuickBooks. Reload to try again.'
    }
    const chosen = choices[spec.kind] ?? null
    return {
      kind: spec.kind, label: spec.label, help: spec.help, automatic: spec.automatic,
      options, error,
      chosen,
      // A choice that has since been made inactive (or deleted) in QuickBooks
      // is not in the list. Say so, rather than showing Automatic over a push
      // that still sends the old id.
      chosenMissing: !!(chosen && options && !options.some(o => o.id === chosen.id)),
    }
  }))
  return NextResponse.json({ connected: true, canManage: mayManageCompanySetting(g.gate.actor), kinds })
}

export async function POST(request: Request) {
  const g = await gateFor(request)
  if ('res' in g) return g.res
  if (!mayManageCompanySetting(g.gate.actor)) {
    return NextResponse.json({ error: 'Only an admin can choose QuickBooks accounts.' }, { status: 403 })
  }
  const body = await request.json().catch(() => ({}))
  if (!isAccountKind(body.kind)) return NextResponse.json({ error: 'Which setting?' }, { status: 400 })
  const kind: AccountKind = body.kind
  const spec = KIND_BY_NAME[kind]
  const qboId = body.qboId == null || body.qboId === '' ? null : String(body.qboId)

  const conn = await getValidConnection(g.db, g.companyId)
  if (!conn) return NextResponse.json({ error: 'QuickBooks is not connected.' }, { status: 409 })
  const key = { company_id: g.companyId, realm_id: conn.realm_id, environment: conn.environment ?? 'sandbox', kind }

  if (qboId === null) {
    const { error } = await g.db.from('quickbooks_account_choices').delete()
      .eq('company_id', key.company_id).eq('realm_id', key.realm_id).eq('environment', key.environment).eq('kind', kind)
    if (error) {
      console.error('[quickbooks/accounts] delete', error.message)
      return NextResponse.json({ error: 'Could not save. Nothing was changed.' }, { status: 500 })
    }
    await g.db.from('quickbooks_sync_log').insert({
      company_id: g.companyId, entity_type: 'connection', action: 'update', status: 'success',
      message: `${spec.label}: set to Automatic (${spec.automatic}).`,
    })
    return NextResponse.json({ ok: true, chosen: null })
  }

  let options: AccountOption[]
  try { options = await listOptions(conn, kind) } catch (err: any) {
    console.error('[quickbooks/accounts] list', kind, err?.message)
    return NextResponse.json({ error: 'Could not check that account with QuickBooks. Nothing was changed.' }, { status: 502 })
  }
  const pick = options.find(o => o.id === qboId)
  if (!pick) return NextResponse.json({ error: 'That account is not an active choice in your QuickBooks company. Reload the list.' }, { status: 400 })

  const { error } = await g.db.from('quickbooks_account_choices').upsert({
    ...key, qbo_id: pick.id, qbo_name: pick.name, updated_by: g.gate.actor.userId, updated_at: new Date().toISOString(),
  }, { onConflict: 'company_id,realm_id,environment,kind' })
  if (error) {
    console.error('[quickbooks/accounts] save', error.message)
    return NextResponse.json({ error: 'Could not save. Nothing was changed.' }, { status: 500 })
  }
  await g.db.from('quickbooks_sync_log').insert({
    company_id: g.companyId, entity_type: 'connection', action: 'update', status: 'success', qbo_id: pick.id,
    message: `${spec.label}: ${pick.name}. Applies to what is pushed from now on; records already in QuickBooks are not moved.`,
  })
  return NextResponse.json({ ok: true, chosen: { id: pick.id, name: pick.name } })
}
