import type { SupabaseClient } from '@supabase/supabase-js'
import {
  type Connection, qboQuery,
  defaultExpenseAccountId, defaultBankAccountId, defaultServiceItemId,
} from '@/lib/quickbooks'

// ─────────────────────────────────────────────────────────────────────────────
// Which QuickBooks account each push goes to - chosen by the company, or the
// automatic pick when nobody has chosen.
//
// Every push used to guess: the first Cost of Goods Sold account for a bill,
// the first Bank account to pay it from, the first Service item for an invoice
// line, and QuickBooks' own default (Undeposited Funds) for money in. Fine
// against a sandbox with one of each; wrong in a real company with a payroll
// account and an operating account, where "the first Bank account" is whichever
// QuickBooks happens to list first - and a bill payment out of the wrong one is
// a reconciliation problem for the bookkeeper every single month.
//
// A choice is stored PER QUICKBOOKS COMPANY (realm + environment), the same
// rule as `quickbooks_vendor_links`: account 35 in one company file is some
// other account, or nothing, in the next. After Start fresh the old company's
// choices simply stop matching, and the new one starts on Automatic.
//
// No choice is the normal state, and "Automatic" is a row that does not exist -
// the same shape as `email_copy`: storing the automatic pick would freeze
// today's guess into a decision nobody made.
// ─────────────────────────────────────────────────────────────────────────────

export type AccountKind = 'bill_expense' | 'bill_payment_bank' | 'invoice_item' | 'payment_deposit'

export interface KindSpec {
  kind: AccountKind
  /** The question as the card asks it. */
  label: string
  /** One line under the dropdown: what it changes, in the bookkeeper's words. */
  help: string
  /** What Automatic does today, so choosing nothing is still an informed choice. */
  automatic: string
  /** The QuickBooks query listing what may be chosen. Active only, always. */
  query: string
  entity: 'Account' | 'Item'
}

export const ACCOUNT_KINDS: KindSpec[] = [
  {
    kind: 'bill_expense',
    label: 'Sub bills are booked to',
    help: 'The expense or cost of goods sold account a bill from a sub lands on.',
    automatic: 'the first Cost of Goods Sold account, or the first Expense account',
    query: "select Id, Name, AccountType from Account where AccountType IN ('Cost of Goods Sold', 'Expense', 'Other Expense') and Active = true MAXRESULTS 1000",
    entity: 'Account',
  },
  {
    kind: 'bill_payment_bank',
    label: 'Bill payments come out of',
    help: 'The bank account a payment to a sub is recorded against.',
    automatic: 'the first Bank account',
    query: "select Id, Name, AccountType from Account where AccountType = 'Bank' and Active = true MAXRESULTS 1000",
    entity: 'Account',
  },
  {
    kind: 'invoice_item',
    label: 'Client invoices use the item',
    help: 'The product/service on each invoice line - its income account is where the sale is counted.',
    automatic: 'the first Service item',
    query: "select Id, Name, Type from Item where Type IN ('Service', 'NonInventory') and Active = true MAXRESULTS 1000",
    entity: 'Item',
  },
  {
    kind: 'payment_deposit',
    label: 'Client payments are deposited to',
    help: 'Where money from a client lands - Undeposited Funds if you group cheques into one bank deposit, or the bank account itself.',
    automatic: "QuickBooks' own default, normally Undeposited Funds",
    query: "select Id, Name, AccountType from Account where AccountType IN ('Bank', 'Other Current Asset') and Active = true MAXRESULTS 1000",
    entity: 'Account',
  },
]

export const KIND_BY_NAME: Record<AccountKind, KindSpec> =
  Object.fromEntries(ACCOUNT_KINDS.map(k => [k.kind, k])) as Record<AccountKind, KindSpec>

export function isAccountKind(v: unknown): v is AccountKind {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(KIND_BY_NAME, v)
}

export interface AccountOption { id: string; name: string; type: string | null }

/** Pure: QuickBooks' answer as the options a dropdown shows, sorted by name. */
export function toOptions(spec: KindSpec, response: any): AccountOption[] {
  const rows: any[] = response?.[spec.entity] ?? []
  return rows
    .filter(r => r?.Id)
    .map(r => ({ id: String(r.Id), name: String(r.Name ?? r.FullyQualifiedName ?? r.Id), type: (r.AccountType ?? r.Type ?? null) as string | null }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function listOptions(conn: Connection, kind: AccountKind): Promise<AccountOption[]> {
  const spec = KIND_BY_NAME[kind]
  return toOptions(spec, await qboQuery(conn, spec.query))
}

export type Choices = Partial<Record<AccountKind, { id: string; name: string | null }>>

/**
 * This company's choices for the connected QuickBooks company. A read that
 * fails answers "no choices" - every push still has its automatic pick, and a
 * bill must not stop reaching QuickBooks because a settings row could not be
 * read. It is said in the server log rather than swallowed.
 */
export async function readChoices(db: SupabaseClient, conn: Pick<Connection, 'company_id' | 'realm_id' | 'environment'>): Promise<Choices> {
  try {
    const { data, error } = await db.from('quickbooks_account_choices')
      .select('kind, qbo_id, qbo_name')
      .eq('company_id', conn.company_id).eq('realm_id', conn.realm_id).eq('environment', conn.environment ?? 'sandbox')
    if (error) { console.error('[qbo-accounts] read', error.message); return {} }
    const out: Choices = {}
    for (const r of (data ?? []) as any[]) if (isAccountKind(r.kind) && r.qbo_id) out[r.kind as AccountKind] = { id: String(r.qbo_id), name: r.qbo_name ?? null }
    return out
  } catch (err: any) {
    console.error('[qbo-accounts] read', err?.message)
    return {}
  }
}

const AUTOMATIC: Record<Exclude<AccountKind, 'payment_deposit'>, (conn: Connection) => Promise<string>> = {
  bill_expense: defaultExpenseAccountId,
  bill_payment_bank: defaultBankAccountId,
  invoice_item: defaultServiceItemId,
}

/**
 * The QuickBooks id a push should use for this kind: the company's choice, or
 * the automatic pick. Payment deposits have no automatic id - QuickBooks picks
 * its own default when none is sent - so that kind answers null when unchosen.
 * `cache` is the push context's, so a fifty-row sync reads the settings once.
 */
export async function accountFor(
  db: SupabaseClient, conn: Connection, kind: AccountKind,
  cache?: { choices?: Choices },
): Promise<string | null> {
  if (cache && !cache.choices) cache.choices = await readChoices(db, conn)
  const choices = cache?.choices ?? await readChoices(db, conn)
  const chosen = choices[kind]?.id
  if (chosen) return chosen
  if (kind === 'payment_deposit') return null
  return AUTOMATIC[kind](conn)
}

/** Pure: the deposit field a payment or sales receipt carries, or nothing. */
export function depositField(accountId: string | null | undefined): { DepositToAccountRef?: { value: string } } {
  return accountId ? { DepositToAccountRef: { value: accountId } } : {}
}
