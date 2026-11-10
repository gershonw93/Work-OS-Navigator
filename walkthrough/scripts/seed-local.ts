// Seeds the LOCAL Supabase (never a hosted project) with the demo company.
import { createClient } from '@supabase/supabase-js'
import { runSeed } from '../../lib/seed-demo'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) {
  console.error(`Refusing to seed ${url || '(unset)'}: walkthrough seeding is local-only.`)
  process.exit(1)
}
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
runSeed(db, { log: m => console.log('  ' + m) })
  .then(r => console.log(JSON.stringify(r)))
  .catch(e => { console.error(e); process.exit(1) })
