// Android: getting it onto Google Play, and getting notifications to it.
//
// THE BUGS. Four, found together when the question was "how do I get this on
// the Play Store":
//
//   1. `bundleRelease` built an UNSIGNED bundle. codemagic.yaml decoded the
//      keystore to android/app/release.keystore and nothing in build.gradle
//      read it. Play refuses an unsigned upload.
//   2. `versionCode 1`, hardcoded - every upload after the first is refused as
//      a duplicate. The iOS workflow hit the identical bug with its build
//      number and fixed it; Android was never built, so nobody noticed.
//   3. targetSdk 34. Play refuses a new app targeting less than 35.
//   4. Every push went to APPLE. use-push.ts registered every phone as
//      platform 'ios', and pushToPhones sent every token to APNs, which cannot
//      deliver to an Android phone. There was no Google sender at all.
//
// What is testable without a phone, a Firebase project or Gradle: the build
// files say the right things, and the server half really does route an Android
// token to Google - run end to end against a stubbed fetch.

import { generateKeyPairSync, createVerify } from 'node:crypto'
import {
  fcmConfig, fcmPayload, classifyFcm, fcmAssertion, fcmReasonHelp, sendFcm,
  summariseFcmRefusals, _resetFcmToken, FCM_KEY_UNREADABLE, ANDROID_CHANNEL_ID,
} from '../fcm'
import { pushTestMessage } from '../push'
import { pushStateNote } from '../push-state'
import { pushToPhones } from '../notify'
import { ok, done, code, read, exists } from './_helpers'

;(async () => {
  // ── 1-3. the build ──────────────────────────────────────────────────────────
  const gradle = code('android/app/build.gradle')
  ok(/signingConfigs\s*\{[\s\S]*release\s*\{[\s\S]*storeFile file\("release\.keystore"\)/.test(gradle),
    'build.gradle reads the keystore codemagic.yaml writes')
  ok(/storePassword System\.getenv\("CM_KEYSTORE_PASSWORD"\)/.test(gradle)
    && /keyAlias System\.getenv\("CM_KEY_ALIAS"\)/.test(gradle)
    && /keyPassword System\.getenv\("CM_KEY_PASSWORD"\)/.test(gradle),
    '...with the passwords under the names the variable group holds')
  ok(/buildTypes\s*\{[\s\S]*release\s*\{[\s\S]*signingConfig signingConfigs\.release/.test(gradle),
    'the release build is actually SIGNED with it - a declared config nothing uses signs nothing')
  ok(!/versionCode\s+1\b/.test(gradle), 'versionCode is not hardcoded to 1')
  ok(/versionCode\s*\(\s*\(System\.getenv\("BUILD_NUMBER"\)/.test(gradle),
    'versionCode comes from Codemagic\'s BUILD_NUMBER, which only goes up')

  const vars = code('android/variables.gradle')
  const target = Number(/targetSdkVersion\s*=\s*(\d+)/.exec(vars)?.[1] ?? 0)
  const compile = Number(/compileSdkVersion\s*=\s*(\d+)/.exec(vars)?.[1] ?? 0)
  ok(target >= 35, `targetSdk is ${target}, and Play requires 35 or more`)
  ok(compile >= target, `compileSdk (${compile}) is not below targetSdk (${target})`)
  const styles = read('android/app/src/main/res/values/styles.xml')
  ok(target !== 35 || (styles.match(/windowOptOutEdgeToEdgeEnforcement[^>]*>true</g) ?? []).length >= 2,
    'targeting 35 opts out of forced edge-to-edge on both themes, or the top bar sits under the clock')

  const cm = read('codemagic.yaml')
  const android = cm.slice(cm.indexOf('android-capacitor:'))
  // Codemagic checks publishing credentials BEFORE building, so a workflow
  // with a Play upload cannot produce the first .aab - the one that has to be
  // uploaded by hand before Play accepts any upload from the API at all.
  const buildOnly = android.slice(0, android.indexOf('android-release:'))
  ok(android.includes('android-release:') && !/publishing:/.test(buildOnly),
    'the plain Android workflow builds without uploading, so it runs before the Play key exists')
  ok(/android-release:\s*\n\s*<<: \*android[\s\S]*google_play:[\s\S]*GCLOUD_SERVICE_ACCOUNT_CREDENTIALS/.test(android),
    '...and the release workflow is the same recipe plus the upload')
  ok(/jarsigner -verify/.test(android), 'the Android workflow refuses to upload an unsigned bundle')
  // The free plan has no Linux machines ("not available with the current
  // billing plan"), so Android builds on the same Mac as iOS - and a Mac's
  // base64 is BSD's, which is why the decode goes through openssl.
  ok(/instance_type:\s*mac_mini_m2/.test(android), 'the Android build runs on a Mac, which the free plan includes')
  // Comment lines stripped: the comment explaining the rule names the command.
  const androidCode = android.split('\n').filter(l => !/^\s*#/.test(l)).join('\n')
  ok(!/base64 --decode/.test(androidCode), '...so nothing in it uses the GNU-only `base64 --decode`')
  ok(/GOOGLE_SERVICES_JSON/.test(android) && /google-services\.json/.test(android),
    'the Android workflow writes google-services.json - without it no phone ever gets an FCM token')
  ok(android.indexOf('google-services.json') < android.indexOf('bundleRelease'),
    '...BEFORE the build, which is the only time Gradle looks for it')
  const ignore = read('android/.gitignore')
  ok(/^\*\.keystore$/m.test(ignore) && /^app\/google-services\.json$/m.test(ignore),
    'the upload key and the Firebase config are git-ignored')

  // ── the notification looks like SyteNav's, on the channel the app creates ──
  const manifest = read('android/app/src/main/AndroidManifest.xml')
  ok(/default_notification_icon"\s+android:resource="@drawable\/ic_stat_sytenav"/.test(manifest)
    && exists('android/app/src/main/res/drawable/ic_stat_sytenav.xml'),
    'a silhouette status-bar icon is declared and exists - the launcher icon renders as a white square')
  ok(new RegExp(`default_notification_channel_id"\\s+android:value="${ANDROID_CHANNEL_ID}"`).test(manifest),
    'the manifest\'s default channel is the one the server names')
  ok(/createChannel\(\{[\s\S]*id: ANDROID_CHANNEL_ID/.test(code('lib/use-push.ts')),
    'the app creates that channel, or pushes land in Miscellaneous with no banner')

  // ── 4. the phone says what it is ────────────────────────────────────────────
  const hook = code('lib/use-push.ts')
  ok(!/platform:\s*'ios'\s*\}/.test(hook), 'use-push no longer files every phone as an iPhone')
  ok(/platform === 'android' \? 'android' : 'ios'/.test(hook), '...it sends the platform it is running on')
  ok(/select\('token, platform'\)/.test(code('lib/notify.ts')), 'pushToPhones reads the platform off each row')

  // ── the Google sender ───────────────────────────────────────────────────────
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const account = { project_id: 'sytenav-test', client_email: 'push@sytenav-test.iam.gserviceaccount.com', private_key: pem }

  const cfg = fcmConfig({ FCM_SERVICE_ACCOUNT: JSON.stringify(account) } as any)
  ok(cfg?.projectId === 'sytenav-test', 'the project id is read out of the service-account JSON')
  ok(!!fcmConfig({ FCM_SERVICE_ACCOUNT: Buffer.from(JSON.stringify(account)).toString('base64') } as any),
    'base64 of the JSON works too, for a dashboard that mangles raw JSON')
  // A key whose newlines were eaten by a web form - the .p8 bug, Google edition.
  const flattened = { ...account, private_key: pem.replace(/\n/g, ' ') }
  ok(!!fcmConfig({ FCM_SERVICE_ACCOUNT: JSON.stringify(flattened) } as any),
    'a key with its line breaks flattened is repaired, as the Apple one is')
  ok(fcmConfig({} as any) === null, 'no variable is "not configured", not a throw')
  ok(fcmConfig({ FCM_SERVICE_ACCOUNT: '{not json' } as any) === null, 'garbage is "not configured", not a throw')

  const jwt = fcmAssertion(cfg!, 1_800_000_000)
  const [h, c, sig] = jwt.split('.')
  const claims = JSON.parse(Buffer.from(c, 'base64url').toString())
  ok(createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(sig, 'base64url')),
    'the assertion is a valid RS256 signature over its own header and claims')
  ok(claims.scope === 'https://www.googleapis.com/auth/firebase.messaging' && claims.exp - claims.iat === 3600
    && claims.aud === 'https://oauth2.googleapis.com/token',
    'it asks for the messaging scope, for an hour, from Google\'s token endpoint')

  const p: any = fcmPayload('tok', { title: 'Bill', body: 'Needs approval', link: '/projects/1/invoices', type: 'invoice_pending' })
  ok(p.message.token === 'tok' && p.message.notification.title === 'Bill', 'payload carries token, title and body')
  ok(Object.values(p.message.data).every(v => typeof v === 'string') && p.message.data.link === '/projects/1/invoices',
    'data holds the link, as strings only - FCM refuses the whole message over a non-string')
  ok(!('data' in (fcmPayload('t', { title: 'a', body: 'b' }) as any).message),
    'no link and no type means no data block, never nulls in one')
  ok(p.message.android.priority === 'HIGH' && p.message.android.notification.channel_id === ANDROID_CHANNEL_ID,
    'high priority on the SyteNav channel')

  ok(classifyFcm(200) === 'sent', '200 sent')
  ok(classifyFcm(404, 'UNREGISTERED') === 'dead', 'UNREGISTERED is a dead phone')
  ok(classifyFcm(403, 'SENDER_ID_MISMATCH') === 'dead', 'a token for another Firebase project is dead')
  ok(classifyFcm(400, 'INVALID_ARGUMENT', 'The registration token is not a valid FCM registration token') === 'dead',
    'a malformed TOKEN is dead')
  ok(classifyFcm(400, 'INVALID_ARGUMENT', 'Invalid value at message.data') === 'failed',
    'a malformed PAYLOAD is not - that is our bug, and deleting every row over it is permanent')
  ok(classifyFcm(404, 'NOT_FOUND') === 'failed', 'a bare 404 (a wrong project id, for every phone) is not dead')
  ok(classifyFcm(401, 'UNAUTHENTICATED') === 'failed' && classifyFcm(403, 'PERMISSION_DENIED') === 'failed',
    'auth failures are our key, never the phone')
  ok(summariseFcmRefusals([{ token: 'a', outcome: 'failed', status: 403, reason: 'PERMISSION_DENIED' },
    { token: 'b', outcome: 'failed', status: 403, reason: 'PERMISSION_DENIED' }]) === 'FCM 403 PERMISSION_DENIED',
    'refusals are summarised once, prefixed FCM so the screen knows whose they are')

  // ── what the test button says, and whose name is on it ──────────────────────
  const base = { configured: true, devices: 1, sent: 0, dead: 0 }
  const g = pushTestMessage({ ...base, error: 'FCM 403 PERMISSION_DENIED' })
  ok(/^Google refused it/.test(g.text) && /FCM_SERVICE_ACCOUNT/.test(g.text),
    'a Google refusal is Google\'s, with the variable to go and fix')
  ok(!/Apple/.test(g.text), '...and never mentions Apple')
  ok(/^Apple refused it/.test(pushTestMessage({ ...base, error: '403 InvalidProviderToken' }).text),
    'an Apple refusal is still Apple\'s')
  ok(/^Refused:/.test(pushTestMessage({ ...base, error: '403 InvalidProviderToken, FCM 403 PERMISSION_DENIED' }).text),
    'one of each names neither company wrongly')
  const localKey = pushTestMessage({ ...base, error: `${FCM_KEY_UNREADABLE}: error:1E08010C:DECODER routines::unsupported` })
  ok(/^SyteNav could not sign/.test(localKey.text) && /FCM_SERVICE_ACCOUNT/.test(localKey.text)
    && !/APNS_PRIVATE_KEY/.test(localKey.text),
    'an unreadable Google key is ours, and points at the Google variable, not the Apple one')
  ok(fcmReasonHelp('FCM 429 QUOTA_EXCEEDED') !== null && fcmReasonHelp('FCM 400 SOMETHING_NEW') === null,
    'known codes get a sentence; unknown ones pass through verbatim')

  // ── the phone's own record names the right company ──────────────────────────
  const droid = pushStateNote({ stage: 'denied', at: '', platform: 'android' })
  ok(/Apps → SyteNav → Notifications/.test(droid) && !/iPhone/.test(droid),
    'an Android phone with notifications off is sent to Android settings, not iPhone ones')
  ok(/iPhone Settings/.test(pushStateNote({ stage: 'denied', at: '' })),
    'a record with no platform (every one written before Android) is still an iPhone')
  ok(/^Google would not register/.test(pushStateNote({ stage: 'apple_refused', at: '', platform: 'android' })),
    'a registration refusal on Android is Google\'s')

  // ── end to end: an Android token goes to Google, and a dead one is removed ──
  process.env.FCM_SERVICE_ACCOUNT = JSON.stringify(account)
  delete process.env.APNS_KEY_ID
  _resetFcmToken()
  const calls: { url: string; body: any }[] = []
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (url: any, init: any) => {
    const u = String(url)
    if (u.startsWith('https://oauth2.googleapis.com/token')) {
      calls.push({ url: u, body: String(init.body) })
      return new Response(JSON.stringify({ access_token: 'ya29.test', expires_in: 3599 }), { status: 200 })
    }
    const body = JSON.parse(init.body)
    calls.push({ url: u, body })
    if (body.message.token === 'droid-gone') {
      return new Response(JSON.stringify({ error: { code: 404, status: 'NOT_FOUND', message: 'Requested entity was not found.',
        details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'UNREGISTERED' }] } }), { status: 404 })
    }
    return new Response(JSON.stringify({ name: 'projects/sytenav-test/messages/1' }), { status: 200 })
  }) as any

  const deleted: string[] = []
  const db = {
    from: (table: string) => ({
      select: () => ({
        in: async () => ({ data: table === 'device_tokens' ? [
          { token: 'droid-ok', platform: 'android' },
          { token: 'droid-gone', platform: 'android' },
          { token: 'iphone', platform: 'ios' },
        ] : [] }),
      }),
      delete: () => ({ in: async (_c: string, tokens: string[]) => { deleted.push(...tokens); return {} } }),
    }),
  }

  const res = await pushToPhones(db, ['u1'], { title: 'SyteNav', body: 'Test', link: '/settings', type: 'invoice_pending' })
  const sends = calls.filter(c => c.url.includes('fcm.googleapis.com'))
  ok(sends.length === 2 && sends.every(c => c.url === 'https://fcm.googleapis.com/v1/projects/sytenav-test/messages:send'),
    'both Android tokens went to FCM, under the project named in the key')
  ok(!sends.some(c => c.body.message.token === 'iphone'), 'the iPhone token did NOT go to Google')
  ok(res.sent === 1, `one delivered (${res.sent})`)
  ok(deleted.length === 1 && deleted[0] === 'droid-gone', 'the UNREGISTERED phone\'s row is deleted, and only that one')
  ok(calls.filter(c => c.url.startsWith('https://oauth2')).length === 1, 'one access token for the whole batch')

  // The token is cached, so a second send does not sign in again.
  await sendFcm(['droid-ok'], { title: 'a', body: 'b' })
  ok(calls.filter(c => c.url.startsWith('https://oauth2')).length === 1, 'the access token is reused, not re-fetched per send')

  globalThis.fetch = realFetch
  delete process.env.FCM_SERVICE_ACCOUNT
  done()
})()
