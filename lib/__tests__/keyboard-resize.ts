// The plugin the whole viewport design assumed was already there.
//
// THE BUG, reported as a screenshot of the Request Inspection form after
// tapping Inspector Name: the bottom tab bar floating in the middle of the
// screen above the keyboard, a band of bare background where the app should be,
// and the dialog somewhere off the top.
//
// `lib/visible-viewport.ts` opens by stating that "Capacitor's default keyboard
// mode shrinks the WKWebView frame, so the LAYOUT viewport is already only the
// visible strip", and CLAUDE.md repeated it as fact. It was never true of the
// shipped app: @capacitor/keyboard was not in package.json, not in the Podfile
// and not in the iOS project. Nothing resized anything.
//
// So WKWebView did not shrink, and iOS did the other thing it can do - PAN the
// visual viewport to bring a focused field above the keyboard, dragging every
// `position: fixed` element with it. The branch in visible-viewport.ts for a
// shrunken frame was dead code the whole time.
//
// An assumption nothing checks is a comment, not a guarantee. This checks it.

import { ok, done, read, code, exists } from './_helpers'

const pkg = JSON.parse(read('package.json'))
const deps: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies }

// ── the dependency ──────────────────────────────────────────────────────────
ok(!!deps['@capacitor/keyboard'],
  'THE MISSING PIECE: @capacitor/keyboard is a dependency')
{
  // One Capacitor major across the board, or the pods do not resolve.
  const major = (v: string) => (v.match(/(\d+)/) ?? [])[1]
  const core = major(deps['@capacitor/core'] ?? '')
  ok(major(deps['@capacitor/keyboard'] ?? '') === core,
    `...on the same major as @capacitor/core (${core})`)
}

// ── the native project actually builds it ───────────────────────────────────
// `npm install` alone changes nothing on the phone: the pod has to be in the
// Podfile, which is what `npx cap sync ios` writes.
const podfile = read('ios/App/Podfile')
ok(/pod 'CapacitorKeyboard'/.test(podfile),
  'the iOS Podfile builds it - installing the package alone reaches no device')
ok(exists('node_modules/@capacitor/keyboard/CapacitorKeyboard.podspec'),
  '...and the podspec that name refers to is really there (fixture sanity)')

// ── the mode, which is the entire point ─────────────────────────────────────
// `code()`, not `read()`: the comment above this block explains the mode by
// quoting it, so a scan of the raw file passes on the prose whatever the code
// says. The same reason `code()` exists at all.
const cfg = code('capacitor.config.ts')
ok(/Keyboard:\s*\{/.test(cfg), 'the config configures it')
ok(/resize:\s*'native'/.test(cfg),
  "THE MODE: 'native' - the frame shrinks, so the layout viewport IS the visible "
  + 'strip and iOS stops panning fixed elements around to reach a focused field')

// ── and the code that depends on it says so ─────────────────────────────────
// `visibleViewport` has two branches. The first one - trust innerHeight, no
// offset - is only ever reachable when something shrinks the frame. Without the
// plugin it was unreachable, and nothing said so.
const vv = read('lib/visible-viewport.ts')
ok(/innerHeight < full - 1/.test(vv),
  'visibleViewport still has the shrunken-frame branch this makes live')
ok(/@capacitor\/keyboard/.test(vv),
  '...and now names the plugin that makes it reachable, so the next reader can check it')

done()
