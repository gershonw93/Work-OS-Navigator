/**
 * Seed a fully-populated demo account for SyteNav (CLI).
 *
 * Run once, from the repo root, in a TERMINAL (not the Supabase SQL editor):
 *
 *   NEXT_PUBLIC_SUPABASE_URL="https://YOURPROJECT.supabase.co" \
 *   SUPABASE_SERVICE_ROLE_KEY="eyJ...service-role..." \
 *   npx tsx scripts/seed-demo.ts
 *
 * No terminal? Use the browser route instead: /api/dev/seed-demo (see
 * scripts/README.md).
 */
import { createClient } from '@supabase/supabase-js'
import { runSeed } from '../lib/seed-demo'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !KEY) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.')
  process.exit(1)
}

const db = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

runSeed(db, { password: process.env.DEMO_PASSWORD, log: m => console.log('  ' + m) })
  .then(r => {
    console.log(`\n Done. Log in at /login with:\n   email:    ${r.email}\n   password: ${r.password}`)
    process.exit(0)
  })
  .catch(e => { console.error(e); process.exit(1) })
