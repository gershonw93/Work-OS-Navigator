// The build scripts are shell, and nothing was checking they were valid shell.
//
// THE BUG THIS EXISTS FOR. I shipped this line into the signing step:
//
//     echo "Decoded a valid PEM private key.
//
// with no closing quote - a Python triple-quote in the script that wrote it
// swallowed the last character. Bash reported "unexpected EOF while looking for
// matching `"'" and the build died, on a Mac, twenty minutes and one round trip
// after I could have known.
//
// `bash -n` parses without executing. It costs milliseconds. Every script in the
// file is checked, not just the one I happened to touch, because the next
// mistake will be somewhere else.
//
// This does NOT check the commands are correct - it cannot run them, and the
// services they talk to are unreachable from here. It checks the file is
// syntactically shell, which is the class of error that actually happened.

import { execFileSync } from 'child_process'
import { ok, done, read, exists } from './_helpers'

const raw = read('codemagic.yaml')

/**
 * Pull the `script:` bodies out by indentation.
 *
 * Deliberately NOT js-yaml: it ships no type declarations, and adding a dev
 * dependency so one test file can typecheck is a poor trade. The shape here is
 * fixed and simple, and every other suite reads source as text too.
 */
function scripts(src: string): { name: string; body: string }[] {
  const lines = src.split('\n')
  const out: { name: string; body: string }[] = []
  let name = '?'
  for (let i = 0; i < lines.length; i++) {
    const nameMatch = /^\s*-\s*name:\s*(.+?)\s*$/.exec(lines[i])
    if (nameMatch) { name = nameMatch[1]; continue }

    const block = /^(\s*)script:\s*\|\s*$/.exec(lines[i])
    if (block) {
      const indent = block[1].length
      const body: string[] = []
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === '') { body.push(''); continue }
        const lead = lines[j].length - lines[j].trimStart().length
        if (lead <= indent) break
        body.push(lines[j].slice(indent + 2))
      }
      out.push({ name, body: body.join('\n') })
      continue
    }

    const inline = /^\s*script:\s*(\S.*)$/.exec(lines[i])
    if (inline) out.push({ name, body: inline[1] })
  }
  return out
}

const all = scripts(raw)
ok(all.length >= 8, `found the build scripts (${all.length})`)

for (const { name, body } of all) {
  let error = ''
  try {
    execFileSync('bash', ['-n'], { input: body, stdio: ['pipe', 'pipe', 'pipe'] })
  } catch (e: any) {
    error = String(e?.stderr ?? e?.message ?? '').trim().split('\n')[0]
  }
  ok(!error, `"${name}" is valid shell${error ? ` - ${error}` : ''}`)
}

// ── the things the iOS build cannot work without ─────────────────────────────
ok(/app_store_connect:\s*SyteNav ASC/.test(raw),
  'the App Store Connect integration is named exactly as Codemagic has it')
ok(/-\s*app_store_credentials/.test(raw),
  'the variable group carrying the signing key is referenced, or the key is invisible to the build')

// `ios_signing:` turns on Codemagic's PRE-BUILD automatic signing, which looks
// for an existing profile and fails in two seconds if there is none. It cannot
// create one, and it runs before any script here can.
ok(!/^\s*ios_signing:/m.test(raw),
  'there is no ios_signing block - it fails before any of the above can run')

const signing = all.find(s => s.name === 'Set up signing')?.body ?? ''
ok(signing.length > 0, 'the signing step exists')
ok(/--create\b/.test(signing), 'signing files are created when absent - a new account has none')
ok(/--delete-stale-profiles\b/.test(signing),
  'a profile that no longer matches the App ID capabilities is replaced, not reused - '
  + 'without this, enabling Push Notifications did nothing for three builds')
ok(/CERTIFICATE_PRIVATE_KEY_B64/.test(signing), 'the key comes from the base64 variable')
ok(/openssl base64 -d -A/.test(signing),
  'decoded with openssl, because `base64 -d` is `-D` on the BSD base64 macOS ships')
ok(signing.indexOf('CERTIFICATE_PRIVATE_KEY_B64') < signing.indexOf('fetch-signing-files'),
  'the key is decoded before it is used')
ok(/is empty or not set/.test(signing),
  'a missing key says so, rather than decoding to an empty file and failing as "not valid"')

// ── the pods only exist in the workspace ─────────────────────────────────────
// `ios/App/Podfile` declares `pod 'Capacitor'` under `use_frameworks!`.
// CocoaPods links its pods through the WORKSPACE; archiving the bare .xcodeproj
// builds an app that has never heard of them, and fails with
// "unable to resolve module dependency: 'Capacitor'" after a full compile.
const build = all.find(s => s.name === 'Build ipa')?.body ?? ''
ok(build.length > 0, 'the build step exists')
ok(/--workspace/.test(build), 'the iOS build archives the workspace')
ok(!/--project\s+"?ios\/App\/App\.xcodeproj/.test(build),
  '...and not the bare project, which cannot see the pods')
ok(/App\.xcworkspace/.test(build), '...naming the workspace CocoaPods generates')
ok(exists('ios/App/Podfile'), 'there is a Podfile, which is why any of that matters')

// ── a build number Apple has not seen before ─────────────────────────────────
// Build 2 compiled, signed and produced an ipa, then the upload was refused:
// "The bundle version must be higher than the previously uploaded version: '1'."
// `CURRENT_PROJECT_VERSION = 1` is hardcoded in the project and nothing moved
// it, so every build after the first collides - twenty minutes in, at the last
// step, having done all the work.
const version = all.find(s => s.name === 'Set the build number')?.body ?? ''
ok(version.length > 0, 'the build number is set before the ipa is built')
ok(/CURRENT_PROJECT_VERSION/.test(version),
  '...on the build setting Info.plist reads CFBundleVersion from')
ok(!/agvtool/.test(version),
  'NOT agvtool - the recipe everyone copies needs VERSIONING_SYSTEM = apple-generic, '
  + 'which this project does not have, so it fails with "cannot find the versioning system"')
ok(/BUILD_NUMBER/.test(version),
  "Codemagic's own counter, which counts failed builds too and so only goes up")
ok(/-lt 2/.test(version),
  'a counter that cannot beat build 1 fails here in seconds, not at the upload')
ok(/grep -c[\s\S]{0,400}exit 1/.test(version),
  'the substitution is verified - a sed that matched nothing looks exactly like success')
ok(/sed -i ''/.test(version),
  "BSD sed's empty -i argument, because this runs on a Mac")

const order = all.map(s => s.name)
ok(order.indexOf('Set the build number') < order.indexOf('Build ipa'),
  '...and it happens BEFORE the archive, or the ipa carries the old number')
ok(order.indexOf('Add iOS platform if missing') < order.indexOf('Set the build number'),
  '...but after cap sync, which rewrites the native project from capacitor.config.ts')

// The config that reaches the app ONLY through cap sync. Without this step,
// `contentInset: 'never'` sits in a TypeScript file the native build never
// reads, and the safe-area fix silently does not ship.
const sync = all.find(s => s.name === 'Add iOS platform if missing')?.body ?? ''
ok(/cap sync ios/.test(sync),
  'capacitor.config.ts is synced into the native project, or its settings never ship')

// ── the deployment target Apple will start refusing ──────────────────────────
// ITMS-90068 on the first upload: "Starting in Spring 2027, all iOS apps must
// have a MinimumOSVersion of 15.0 or later." A warning now, a wall later.
//
// The Podfile and the Xcode project must AGREE: pods are built against the
// platform in one and the app against the setting in the other, and when they
// differ CocoaPods emits a warning nobody reads while the binary takes the
// project's value.
const podfile = read('ios/App/Podfile')
const pbxproj = read('ios/App/App.xcodeproj/project.pbxproj')
const podPlatform = /^platform :ios, '([\d.]+)'/m.exec(podfile)?.[1] ?? ''
ok(parseFloat(podPlatform) >= 15, `the Podfile targets iOS ${podPlatform || '?'}, which Apple still accepts`)

// Plain exec loop rather than matchAll spread: this file compiles under the
// repo's ES5 target, where iterating an iterator needs downlevelIteration.
const targets: string[] = []
const targetPattern = /IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);/g
let tm: RegExpExecArray | null
while ((tm = targetPattern.exec(pbxproj))) targets.push(tm[1])

ok(targets.length > 0, `the Xcode project declares a deployment target (${targets.length} places)`)
const distinct = targets.filter((t, i) => targets.indexOf(t) === i)
ok(targets.every(t => parseFloat(t) >= 15), `every one of them is 15.0 or later (${distinct.join(', ')})`)
ok(distinct.length === 1 && distinct[0] === podPlatform,
  'the Podfile and the Xcode project agree - a mismatch is a warning nobody reads')

done()
