/**
 * Send one push notification to one phone, and say exactly what Apple said.
 *
 * WHY THIS EXISTS. The alternative way to find out whether push works is to
 * make a TestFlight build, wait for it to process, install it, sign in, and
 * approve a bill - and if nothing buzzes, you have learned nothing about WHY.
 * This proves the server half the hour the .p8 arrives, with no build at all.
 *
 * It also turns Apple's least helpful answers into sentences. The two you will
 * actually hit:
 *
 *   InvalidProviderToken  the key, key id or team id do not agree. Almost
 *                         always the key: pasted through a dashboard, a .p8's
 *                         newlines arrive as the two characters \n. That IS
 *                         handled, but a key truncated on copy is not.
 *   DeviceTokenNotForTopic  the token came from a build with a different
 *                         bundle id, or a development build talking to the
 *                         production host.
 *
 * Usage, from the repo root, with the same variables Vercel has:
 *
 *   APNS_KEY_ID=ABC123DEFG \
 *   APNS_TEAM_ID=TEAM123456 \
 *   APNS_PRIVATE_KEY="$(cat AuthKey_ABC123DEFG.p8)" \
 *   npx tsx scripts/push-test.ts <device-token>
 *
 * Get the device token by signing in on the phone and reading it back:
 *   select token, platform, last_seen_at from device_tokens order by last_seen_at desc;
 */
import { apnsConfig, sendPush } from '../lib/push'

const token = process.argv[2]

if (!token) {
  console.error('Usage: npx tsx scripts/push-test.ts <device-token>')
  console.error('The token is the `token` column of device_tokens for your phone.')
  process.exit(1)
}

const cfg = apnsConfig()
if (!cfg) {
  console.error('Push is not configured. Set APNS_KEY_ID, APNS_TEAM_ID and APNS_PRIVATE_KEY.')
  console.error('Missing:', [
    !process.env.APNS_KEY_ID && 'APNS_KEY_ID',
    !process.env.APNS_TEAM_ID && 'APNS_TEAM_ID',
    !process.env.APNS_PRIVATE_KEY && 'APNS_PRIVATE_KEY',
  ].filter(Boolean).join(', '))
  process.exit(1)
}

console.log(`sending to ${cfg.host}`)
console.log(`  bundle ${cfg.bundleId}  key ${cfg.keyId}  team ${cfg.teamId}`)
console.log(`  device ${token.slice(0, 12)}...${token.slice(-6)}\n`)

sendPush([token], {
  title: 'SyteNav',
  body: 'Push is working. This is a test from the server.',
  // A real link, so tapping it also proves the routing half - the notification
  // should open the invoices screen, not just the app.
  link: '/dashboard',
  type: 'invoice_pending',
}).then(r => {
  if (r.skipped) { console.log(`skipped: ${r.skipped}`); process.exit(1) }
  if (r.error) { console.log(`failed: ${r.error}`); process.exit(1) }
  if (r.dead.length) {
    console.log('Apple says this token is dead - the app was deleted, the phone')
    console.log('was wiped, or the token came from a build with another bundle id.')
    console.log('In the app this row would now be removed automatically.')
    process.exit(1)
  }
  console.log(r.sent ? 'Sent. Look at the phone.' : 'Nothing sent, and Apple gave no reason.')
  process.exit(r.sent ? 0 : 1)
})
