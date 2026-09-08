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

done()
