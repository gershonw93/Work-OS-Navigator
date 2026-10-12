// A TOKEN LINK MUST NOT LOAD THE TAG AT ALL.
//
// THE BUG: the first version refused the manual page_view on /portal, /share,
// /bid, /bill, /rfi and /compliance - and loaded GTM anyway. The tag's own
// automatic events (scroll, engagement) then went to Google carrying the raw
// URL, and on those routes the URL IS the secret. A source scan cannot see
// "the tag loaded"; a browser can. So this suite serves the real client
// module on app.sytenav.com (a local server behind --host-resolver-rules),
// records every attempt to reach a Google host from inside the page, and asks:
//
//   1. cold load of an excluded route -> ZERO attempts, no dataLayer, no gtag
//   2. cold load of a measured route  -> GTM requested (the control: a probe
//      that never sees a request passes check 1 for the wrong reason)
//   3. measured -> excluded -> measured -> the tag is silenced (ga-disable) for
//      the middle hop, sends no page_view for it, and wakes up after.

import { execFile, execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { ok, done, root } from './_helpers'

function chromium(): string | null {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'
  let dirs: string[] = []
  try { dirs = readdirSync(base).filter(d => d.startsWith('chromium')) } catch { /* none */ }
  for (const exe of ['chrome-linux/headless_shell', 'chrome-linux/chrome']) {
    for (const dir of dirs) {
      const p = join(base, dir, exe)
      if (existsSync(p)) return p
    }
  }
  for (const p of ['/usr/bin/chromium', '/usr/bin/google-chrome']) if (existsSync(p)) return p
  return null
}

const browser = chromium()
if (!browser) {
  console.log('  \x1b[33mSKIPPED\x1b[0m no Chromium found; set PLAYWRIGHT_BROWSERS_PATH')
  done()
}

// The REAL module, bundled for the browser - not a copy of its logic.
const work = mkdtempSync(join(tmpdir(), 'sytenav-analytics-'))
const bundle = join(work, 'analytics.js')
execFileSync('npx', [
  'esbuild', '--bundle', '--format=iife', '--global-name=SN', '--platform=browser',
  join(root(), 'lib/analytics-client.ts'), `--outfile=${bundle}`, '--log-level=error',
], { cwd: root(), stdio: ['ignore', 'ignore', 'inherit'] })
const js = readFileSync(bundle, 'utf8')

// Runs BEFORE the module: every way a tag reaches the network, recorded.
const PROBE = `
window.__hits = [];
// Stand in for GTM having registered the Google tag, which it would do once
// gtm.js arrived - Google is unreachable here, so without this every event
// waits in the module's queue for ever and none of them can be inspected.
window.google_tag_manager = { 'G-LXC64H4W7J': {} };
const rec = u => { u = String(u && u.url || u); if (/google(tagmanager|-analytics)\\.com|doubleclick|googleadservices/.test(u)) __hits.push(u) };
new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.src) rec(n.src) })))
  .observe(document.documentElement, { childList: true, subtree: true });
const _f = window.fetch; window.fetch = (u, ...a) => { rec(u); return _f(u, ...a) };
const _b = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = (u, d) => { rec(u); return _b(u, d) };
const _o = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function (m, u, ...r) { rec(u); return _o.call(this, m, u, ...r) };
const _s = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', { set(v) { rec(v); _s.set.call(this, v) }, get() { return _s.get.call(this) } });
`

const SCENARIO = `
const DISABLE = 'ga-disable-G-LXC64H4W7J';
// Event hits only - consent/set/gtm.js are the tag's setup, not things sent.
const events = () => (window.dataLayer || []).filter(e => e && e[0] === 'event').map(e => e[1]);
const out = {};
const go = p => { history.pushState(null, '', p); SN.routeChanged(p, '') };
if (location.hash === '#queue') delete window.google_tag_manager;   // tag NOT ready yet
if (location.hash === '#parked') sessionStorage.setItem('sn_analytics_pending', JSON.stringify([['login', { method: 'email' }]]));
SN.routeChanged(location.pathname, location.search);
out.cold = { hits: __hits.slice(), dataLayer: !!window.dataLayer, gtag: !!window.gtag, events: events() };
if (location.hash === '#nav') {
  SN.routeChanged('/portal/abc123token', '');
  out.inPortal = { disabled: window[DISABLE] === true, events: events() };
  SN.routeChanged('/pricing', '');
  out.back = { disabled: window[DISABLE] === true, events: events() };
}
if (location.hash === '#queue') {
  // Queued on a measured page while GTM was still loading...
  SN.track('quote_sent', { channel: 'email', quote_type: 'invite', invitee_count: 1 });
  SN.trackAfterNavigation('login', { method: 'email' });
  // ...then the visitor opens a token link before the tag is ready.
  go('/portal/abc123token');
  SN.track('sub_invited', { invitation_method: 'email', role: 'vendor', invite_count: 1 });
  window.google_tag_manager = { 'G-LXC64H4W7J': {} };   // the tag registers NOW, mid-portal
  setTimeout(() => {
    out.inPortal = { events: events(), parked: sessionStorage.getItem('sn_analytics_pending') };
    go('/pricing');
    out.back = { events: events(), parked: sessionStorage.getItem('sn_analytics_pending') };
  }, 300);
}
setTimeout(() => {
  out.hits = __hits.slice();
  document.body.insertAdjacentHTML('beforeend', '<pre id=probe>' + JSON.stringify(out).replace(/</g, '&lt;') + '</pre>');
}, 800);
`

const server = createServer((req, res) => {
  res.setHeader('content-type', 'text/html')
  res.end(`<!doctype html><html><head><script>${PROBE}</script></head><body>
<script>${js}</script><script>${SCENARIO}</script></body></html>`)
})
let port = 0

async function visit(path: string): Promise<any> {
  const { stdout } = await promisify(execFile)(browser!, [
    '--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=3000',
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'sytenav-profile-'))}`,
    // app.sytenav.com is the page; every OTHER host is unreachable, so the
    // test never talks to Google and the only evidence is what the page tried.
    `--host-resolver-rules=MAP app.sytenav.com 127.0.0.1:${port}, MAP * ~NOTFOUND`,
    '--dump-dom', `http://app.sytenav.com${path}`,
  ], { encoding: 'utf8', maxBuffer: 16 << 20 })
  const m = /<pre id="probe">([^<]*)<\/pre>/.exec(stdout)
  if (!m) throw new Error(`${path}: the page never reported`)
  return JSON.parse(m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'))
}

async function main() {
await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()))
port = (server.address() as { port: number }).port
try {
  // ── 2 first: the control ──────────────────────────────────────────────────
  const measured = await visit('/pricing')
  ok(measured.hits.some((u: string) => u.includes('googletagmanager.com/gtm.js?id=GTM-MXB4F2W3')),
    'control: a measured page DOES request GTM - so the probe can see a request')
  ok(measured.cold.events.includes('page_view'), 'control: and queues its page_view')

  // ── 1: every excluded route, cold ─────────────────────────────────────────
  for (const p of ['/portal/abc123token', '/share/abc123token', '/bid/abc123token', '/bill/abc123token',
    '/rfi/abc123token', '/compliance/abc123token', '/admin/demo']) {
    const r = await visit(p)
    ok(r.hits.length === 0, `${p}: zero requests to Google on a cold load (saw ${r.hits.length})`)
    ok(!r.cold.dataLayer && !r.cold.gtag, `${p}: no dataLayer and no gtag - the tag was never started`)
  }

  // ── 3: navigating into a token link silences the running tag ──────────────
  const nav = await visit('/pricing#nav')
  ok(nav.inPortal.disabled, 'entering /portal sets ga-disable, which stops automatic hits too')
  ok(nav.inPortal.events.filter((e: string) => e === 'page_view').length === 1,
    '...and sends no page_view for the portal')
  ok(!nav.back.disabled, 'leaving it wakes the tag again')
  ok(nav.back.events.filter((e: string) => e === 'page_view').length === 2,
    '...and the page after it is counted, even though it is the same page as before')
  ok(!JSON.stringify(nav).includes('abc123token'), 'the token appears nowhere the tag could read')
  // ── 4: an event queued before the tag was ready must not leave from /portal ─
  const q = await visit('/pricing#queue')
  ok(q.inPortal.events.length === 0,
    `nothing queued on /pricing is flushed once the visitor is on /portal (saw ${JSON.stringify(q.inPortal.events)})`)
  ok(!q.inPortal.events.includes('sub_invited'), 'a track() called on /portal sends nothing')
  ok(!!q.inPortal.parked, 'the parked login waits - it is not spent on a token link')
  ok(q.back.events.filter((e: string) => e === 'login').length === 1, 'and goes exactly once on the next measured page')
  ok(q.back.parked === null, '...which empties the parking spot, so it cannot go twice')
  ok(!q.back.events.includes('quote_sent'), 'the event dropped on /portal is gone for good, not replayed later')

  // ── 5: a parked outcome does not start the tag on a cold token link ────────
  const parked = await visit('/portal/abc123token#parked')
  ok(parked.hits.length === 0 && !parked.cold.dataLayer, 'a token link holding a parked outcome still makes zero requests')
} finally {
  server.close()
}
}

main().then(() => done(), e => { console.error(e); process.exit(1) })
