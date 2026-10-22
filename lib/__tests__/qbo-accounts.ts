// QuickBooks account selection: which account each push lands in.
//
// THE ASK: "select which bank account etc". Every push guessed - the first
// Cost of Goods Sold account for a bill, the first Bank account to pay it
// from, the first Service item on an invoice, QuickBooks' own default for a
// deposit. Against a real company with a payroll account beside the operating
// one, "the first Bank account" is whichever QuickBooks lists first.
//
// What is pinned here:
//   * a choice wins over the automatic pick, and NO ROW is Automatic;
//   * a choice is per QuickBooks company (realm + environment);
//   * a settings read that fails never stops a push - it falls back;
//   * every push kind asks `accountFor`, none calls a default directly;
//   * the route checks a chosen id against a FRESH QuickBooks list, and
//     Automatic deletes the row rather than storing the guess.

import {
  ACCOUNT_KINDS, KIND_BY_NAME, isAccountKind, toOptions, depositField, accountFor, readChoices,
} from '../qbo-accounts'
import { ok, done, code, read } from './_helpers'

// ── pure ─────────────────────────────────────────────────────────────────────
const kinds = ACCOUNT_KINDS.map(k => k.kind).sort()
ok(JSON.stringify(kinds) === JSON.stringify(['bill_expense', 'bill_payment_bank', 'invoice_item', 'payment_deposit']), 'four kinds: bill expense, bill payment bank, invoice item, payment deposit')
for (const k of ACCOUNT_KINDS) {
  ok(/Active = true/.test(k.query), `${k.kind}: lists ACTIVE records only`)
  ok(k.automatic.length > 0, `${k.kind}: says what Automatic does`)
}
ok(/AccountType = 'Bank'/.test(KIND_BY_NAME.bill_payment_bank.query), 'bill payments can only come out of a Bank account')
ok(isAccountKind('bill_expense') && !isAccountKind('toString') && !isAccountKind('x'), 'isAccountKind refuses anything else, prototype keys included')

const opts = toOptions(KIND_BY_NAME.bill_payment_bank, { Account: [
  { Id: '9', Name: 'Payroll', AccountType: 'Bank' }, { Name: 'no id' }, { Id: '4', Name: 'Operating', AccountType: 'Bank' },
] })
ok(opts.length === 2 && opts[0].name === 'Operating' && opts[1].id === '9', 'options are sorted by name and a row with no Id is dropped')
ok(toOptions(KIND_BY_NAME.invoice_item, {}).length === 0, 'an empty answer is no options, not a crash')
ok(JSON.stringify(depositField('35')) === '{"DepositToAccountRef":{"value":"35"}}', 'a chosen deposit account becomes DepositToAccountRef')
ok(JSON.stringify(depositField(null)) === '{}', "no choice sends nothing - QuickBooks' own default stands")

// ── accountFor against a fake database and a fake QuickBooks ────────────────
let stored: any[] = []
let readFails = false
let filters: Record<string, string> = {}
function fakeDb(): any {
  return { from(table: string) {
    const q: any = {
      select() { return q },
      eq(col: string, val: string) { filters[col] = val; return q },
      then(res: any) {
        if (table !== 'quickbooks_account_choices') return Promise.resolve({ data: [], error: null }).then(res)
        return Promise.resolve(readFails ? { data: null, error: { message: 'boom' } } : { data: stored, error: null }).then(res)
      },
    }
    return q
  } }
}
let qboCalls: string[] = []
;(globalThis as any).fetch = async (url: string) => {
  qboCalls.push(decodeURIComponent(String(url)))
  return { ok: true, status: 200, text: async () => JSON.stringify({ QueryResponse: { Account: [{ Id: '1' }], Item: [{ Id: '2' }] } }) }
}
const conn: any = { company_id: 'C1', realm_id: 'R1', environment: 'production', access_token: 't' }

async function main() {
  const origError = console.error
  console.error = () => {}
  try {
    stored = [{ kind: 'bill_payment_bank', qbo_id: '35', qbo_name: 'Operating' }]
    qboCalls = []; filters = {}
    ok(await accountFor(fakeDb(), conn, 'bill_payment_bank') === '35', 'a chosen bank account is the one a bill payment uses')
    ok(qboCalls.length === 0, '...without asking QuickBooks for "the first Bank account"')
    ok(filters.realm_id === 'R1' && filters.environment === 'production' && filters.company_id === 'C1', 'choices are read for THIS QuickBooks company: company + realm + environment')

    stored = []
    qboCalls = []
    ok(await accountFor(fakeDb(), conn, 'bill_expense') === '1', 'no row is Automatic: the first COGS / Expense account')
    ok(qboCalls.some(u => /Cost of Goods Sold/.test(u)), '...found by asking QuickBooks, as before')
    ok(await accountFor(fakeDb(), conn, 'payment_deposit') === null, 'an unchosen deposit is null - nothing is sent')

    readFails = true
    ok(await accountFor(fakeDb(), conn, 'invoice_item') === '2', 'a settings read that FAILS falls back to Automatic - a push never stops over it')
    ok(JSON.stringify(await readChoices(fakeDb(), conn)) === '{}', 'readChoices answers {} on a failed read')
    readFails = false

    stored = [{ kind: 'bill_expense', qbo_id: '80', qbo_name: 'Subcontractors' }, { kind: 'nonsense', qbo_id: '1' }]
    let reads = 0
    const counting: any = { from(t: string) { reads++; return fakeDb().from(t) } }
    const cache: any = {}
    await accountFor(counting, conn, 'bill_expense', cache)
    await accountFor(counting, conn, 'payment_deposit', cache)
    ok(reads === 1, 'a run reads the choices once (cached on the push context)')
    ok(!('nonsense' in cache.choices), 'an unknown kind in the table is ignored')
  } finally { console.error = origError }

  // ── every push asks accountFor ─────────────────────────────────────────────
  const push = code('lib/quickbooks-push.ts')
  ok(!/defaultExpenseAccountId|defaultBankAccountId|defaultServiceItemId/.test(push), 'no push calls a default directly - the choice would be skipped')
  for (const k of ['bill_expense', 'bill_payment_bank', 'invoice_item', 'payment_deposit']) {
    ok(push.includes(`accountFor(db, conn, '${k}'`), `a push asks accountFor for ${k}`)
  }
  ok((push.match(/\.\.\.deposit\b/g) ?? []).length === 2, 'both applied-payment posts (single and split cheque) carry the deposit account')
  ok(/\.\.\.depositField\(await accountFor\(db, conn, 'payment_deposit'/.test(push), 'a sales receipt carries it too')
  ok(/account\/\$\{bankAccountId\}/.test(push) && /account\/\$\{depositId\}/.test(push), 'a 610 probes the chosen bank and deposit accounts, so an inactive choice is named')

  // ── the route ──────────────────────────────────────────────────────────────
  const route = code('app/api/quickbooks/accounts/route.ts')
  ok(/requirePermission\(db, request, 'settings_company', 'view'\)/.test(route), 'the route asks settings_company')
  const post = route.slice(route.indexOf('export async function POST'))
  ok(/mayManageCompanySetting/.test(post), 'only an admin may save a choice')
  ok(post.indexOf('listOptions(conn, kind)') > 0 && post.indexOf('listOptions(conn, kind)') < post.indexOf('.upsert('), 'a chosen id is checked against a FRESH list before it is stored')
  ok(/options\.find\(o => o\.id === qboId\)/.test(post), '...and refused when it is not in it')
  ok(/qboId === null[\s\S]{0,200}\.delete\(\)/.test(post), 'Automatic DELETES the row - the guess is never stored as a choice')
  ok(/quickbooks_sync_log/.test(post), 'a change is written to the sync log')
  ok(/realm_id: conn\.realm_id/.test(post), 'a choice is stored against the connected QuickBooks company')

  // ── the table ──────────────────────────────────────────────────────────────
  const sql = read('supabase/migrations/153_quickbooks_account_choices.sql')
  for (const k of ACCOUNT_KINDS) ok(sql.includes(`'${k.kind}'`), `the table's CHECK allows ${k.kind}`)
  ok(/PRIMARY KEY \(company_id, realm_id, environment, kind\)/.test(sql), 'one choice per kind per QuickBooks company')
  ok(/company_id\s+uuid NOT NULL REFERENCES companies \(id\) ON DELETE CASCADE/.test(sql), 'company FK cascades')
  ok(/updated_by\s+uuid REFERENCES profiles \(id\) ON DELETE SET NULL/.test(sql), 'who chose it outlives their account')

  // ── the card ───────────────────────────────────────────────────────────────
  const card = code('components/settings/quickbooks-card.tsx')
  ok(/connected && status\?\.canManage && <QuickBooksAccounts/.test(card), 'the dropdowns show for an admin on a working connection')
  const ui = code('components/settings/quickbooks-accounts.tsx')
  ok(/Automatic - \$\{row\.automatic\}/.test(ui), 'the first option says what Automatic does')
  ok(/state === 'failed'/.test(ui) && /row\.error/.test(ui), 'a list that could not be read says so - never an empty dropdown')
  done()
}
main()
