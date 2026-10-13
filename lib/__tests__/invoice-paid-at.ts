// A SUB'S BILL WAS PAID WHEN? `invoices` has never had an `updated_at`, and two
// dashboard routes asked for one: PostgREST refuses the whole query for an
// unknown column, so the home cash chart showed no money going out since #517,
// and "paid this month" filtered on a column that does not exist. The real
// column, `paid_at`, was in the first migration - and nothing ever wrote it.

import { readdirSync, statSync } from 'fs'
import { join } from 'path'
import { ok, done, code, root } from './_helpers'

const route = code('app/api/projects/[id]/invoices/[invoiceId]/route.ts')
ok(/status === 'paid' && invoice\.status !== 'paid'\) updates\.paid_at = new Date\(\)\.toISOString\(\)/.test(route),
  'marking a bill paid stamps paid_at, from the move - a second press keeps the first date')
ok(/status !== 'paid'\) updates\.paid_at = null/.test(route), '...and moving it off Paid clears it')
ok(!/paid_at\s*[:=]\s*body|body\.paid_at|\bpaid_at,\s*$/m.test(route.split('const {')[1]?.split('} = body')[0] ?? ''),
  'paid_at is never taken from the request body')

const overview = code('app/api/dashboard/overview/route.ts')
ok(/from\('invoices'\)\.select\('amount, status, paid_at, created_at'\)/.test(overview), 'the cash chart reads paid_at')
ok(/inv\.paid_at \?\? inv\.created_at/.test(overview), '...falling back to when a bill paid before it was recorded was entered')
ok(/paid_at\.gte\./.test(code('app/api/dashboard/stats/route.ts')), '"paid this month" filters on paid_at')

// No route anywhere asks `invoices` for the column it does not have.
const offenders: string[] = []
const walk = (dir: string) => {
  for (const f of readdirSync(join(root(), dir))) {
    const rel = join(dir, f)
    if (statSync(join(root(), rel)).isDirectory()) walk(rel)
    else if (/\.tsx?$/.test(f)) {
      const src = code(rel)
      // a chain on 'invoices' (not client_invoices) that mentions updated_at before the next from(
      for (const m of Array.from(src.matchAll(/from\('invoices'\)([\s\S]*?)(?=from\(|$)/g))) {
        if (/updated_at/.test(m[1].slice(0, 400))) offenders.push(rel)
      }
    }
  }
}
walk('app'); walk('lib')
ok(offenders.length === 0, `no query reads invoices.updated_at${offenders.length ? ': ' + Array.from(new Set(offenders)).join(', ') : ''}`)

done()
