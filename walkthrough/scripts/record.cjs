// Drives the LOCAL app through the walkthrough and records it.
//
// Frames come from a CDP screencast (JPEG q90, real wall-clock timestamps)
// rather than Playwright's recordVideo, whose fixed low bitrate smears text.
// Each step's start time is written to out/timeline.json on the same clock as
// the frames, so assemble.py can lay each narration line exactly there.
//
// SAFETY: the base URL must be localhost, and every click goes through
// `click()`, which refuses any control whose text matches FORBIDDEN. The
// steps also never press Save on the cascade review, Send on the portal, or
// any approve/pay/connect control. The local env has no email or QuickBooks
// keys, so even a mistake could not leave this machine.
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'out')
const FRAMES = path.join(OUT, 'frames')
const BASE = process.env.WALKTHROUGH_BASE_URL || 'http://localhost:3000'
const EMAIL = 'demo@sytenav.com'
const PASSWORD = 'SyteNavDemo2026!'
const PROJECT = 'Maple Street Residences'
const PAD = 0.6 // seconds of breathing room after each line
const FORBIDDEN = /\b(send|email|approve|pay|record payment|connect|delete|remove|void|mint|regenerate|notify)\b/i

if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error(`Refusing to record against ${BASE}: the walkthrough runs on local fake data only.`)
  process.exit(1)
}

const lines = JSON.parse(fs.readFileSync(path.join(ROOT, 'narration.json'), 'utf8'))
const durations = JSON.parse(fs.readFileSync(path.join(OUT, 'durations.json'), 'utf8'))
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── Overlay: a cursor that follows real mouse events, a click ripple, and a
// highlight box. Injected into every document, drawn above everything.
const OVERLAY = () => {
  if (window.__wt) return
  window.__wt = true
  const install = () => {
    const css = document.createElement('style')
    css.textContent = `
      #wt-cursor{position:fixed;left:0;top:0;width:28px;height:28px;z-index:2147483647;pointer-events:none;
        transform:translate(-4px,-2px);transition:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
      .wt-ripple{position:fixed;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;z-index:2147483646;
        pointer-events:none;border:3px solid #84cc16;animation:wt-r .5s ease-out forwards}
      @keyframes wt-r{from{transform:scale(.3);opacity:1}to{transform:scale(1.6);opacity:0}}
      #wt-hl{position:fixed;z-index:2147483645;pointer-events:none;border:3px solid #84cc16;border-radius:14px;
        box-shadow:0 0 0 9999px rgba(15,23,42,.28),0 0 24px rgba(132,204,22,.55);opacity:0;
        transition:opacity .35s ease,left .45s ease,top .45s ease,width .45s ease,height .45s ease}`
    document.head.appendChild(css)
    const c = document.createElement('div')
    c.id = 'wt-cursor'
    c.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M4 2l15 11-6.5 1.2L16 21l-3 1.4-3.4-6.9L4 20z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>'
    document.body.appendChild(c)
    const hl = document.createElement('div'); hl.id = 'wt-hl'; document.body.appendChild(hl)
    const pos = window.__wtPos || { x: 960, y: 540 }
    c.style.left = pos.x + 'px'; c.style.top = pos.y + 'px'
    addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; window.__wtPos = { x: e.clientX, y: e.clientY } }, true)
    addEventListener('mousedown', e => {
      const r = document.createElement('div'); r.className = 'wt-ripple'
      r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'
      document.body.appendChild(r); setTimeout(() => r.remove(), 600)
    }, true)
  }
  if (document.body) install(); else addEventListener('DOMContentLoaded', install)
}

async function main() {
  fs.rmSync(FRAMES, { recursive: true, force: true })
  fs.mkdirSync(FRAMES, { recursive: true })
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
  await context.addInitScript(OVERLAY)
  // The seed's photos point at a public image service; nothing leaves this
  // machine, so they are answered with local placeholder images instead.
  const PHOTOS = fs.readdirSync(path.join(ROOT, 'assets')).filter(f => f.endsWith('.jpg')).map(f => path.join(ROOT, 'assets', f))
  let photo = 0
  await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, route => {
    if (route.request().resourceType() === 'image' && PHOTOS.length) return route.fulfill({ path: PHOTOS[photo++ % PHOTOS.length] })
    return route.abort()
  })
  const page = await context.newPage()
  global.__page = page
  page.on('dialog', d => d.dismiss()) // a native dialog would hang the run

  // ── Sign in and warm every screen OFF the record, so dev-server compiles
  // and first loads never appear in the video.
  await page.goto(`${BASE}/login`)
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/dashboard/, { timeout: 180000 })
  await page.getByRole('link', { name: 'Projects' }).first().waitFor()
  await page.goto(`${BASE}/projects`)
  const projectHref = await page.getByRole('link', { name: PROJECT }).first().getAttribute('href')
  const pid = projectHref.match(/projects\/([^/]+)/)[1]
  for (const s of ['overview', 'schedule', 'daily-logs', 'inspections', 'budget', 'invoices', 'payments', 'change-orders']) {
    await page.goto(`${BASE}/projects/${pid}/${s}`, { timeout: 240000 })
    await page.waitForLoadState('networkidle', { timeout: 120000 }).catch(() => {})
  }
  await page.goto(`${BASE}/dashboard`)
  await settle(page)

  // ── Helpers the steps use.
  let mouse = { x: 960, y: 540 }
  async function moveTo(x, y, ms = 700) {
    // Time-based easing: each move is paced against the clock, so the glide
    // takes `ms` however long a single CDP round trip happens to be.
    const from = { ...mouse }, t0 = Date.now()
    for (;;) {
      const t = Math.min(1, (Date.now() - t0) / ms), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e)
      if (t >= 1) break
      await sleep(12)
    }
    mouse = { x, y }
  }
  // Phone and desktop markups both live in the DOM (one is display:none), so
  // every locator is narrowed to what is actually on screen.
  const vis = l => (typeof l === 'string' ? page.locator(l) : l).filter({ visible: true }).first()
  // { card: 'Text' } -> the bordered, rounded box that contains that text.
  async function cardBox(text, exact) {
    const el = vis(exact ? page.getByText(text, { exact: true }) : page.getByText(text))
    await el.waitFor({ state: 'visible', timeout: 30000 })
    return el.evaluate(n => {
      for (let e = n; e && e !== document.body; e = e.parentElement) {
        const cs = getComputedStyle(e)
        if (parseFloat(cs.borderTopWidth) > 0 && parseFloat(cs.borderTopLeftRadius) >= 8) {
          const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, innerHeight - r.y - 16) }
        }
      }
      const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }
    })
  }
  async function panelBox(text) {
    const el = vis(page.getByText(text, { exact: true }))
    await el.waitFor({ state: 'visible', timeout: 30000 })
    return el.evaluate(n => {
      let e = n
      while (e.parentElement && !e.parentElement.hasAttribute('data-overlay')) e = e.parentElement
      const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, innerHeight - r.y - 16) }
    })
  }
  async function boxOf(target) {
    if (target && target.panel !== undefined) return panelBox(target.panel)
    if (target && target.card !== undefined) return cardBox(target.card, target.exact)
    const loc = vis(target)
    await loc.waitFor({ state: 'visible', timeout: 30000 })
    return loc.boundingBox()
  }
  let hover = async function (target, ms) {
    let b = await boxOf(target)
    if (b && (b.y < 0 || b.y + b.height > 1080) && !(target && (target.card !== undefined || target.panel !== undefined))) {
      await vis(target).scrollIntoViewIfNeeded().catch(() => {})
      b = await boxOf(target)
    }
    await moveTo(b.x + b.width / 2, b.y + b.height / 2, ms)
  }
  let click = async function (target, ms = 450) {
    const T = [Date.now()]
    const loc = vis(target)
    const label = ((await loc.innerText().catch(() => '')) + ' ' + ((await loc.getAttribute('aria-label').catch(() => '')) || '')).trim()
    if (FORBIDDEN.test(label)) throw new Error(`Refusing to click "${label}" - it could send or change something real.`)
    T.push(Date.now())
    await hover(loc, ms)
    T.push(Date.now())
    await sleep(120)
    // A real click on the element (not at a remembered coordinate), so a
    // layout shift during the glide cannot land it on the row next door.
    const b = await loc.boundingBox()
    T.push(Date.now())
    await loc.click()
    T.push(Date.now())
    if (process.env.WT_PROFILE) console.log('    click profile', T.slice(1).map((t, i) => t - T[i]).join(' '))
    // Measured BEFORE the click: after a navigation the element is gone, and
    // asking for its box then waits out the full timeout.
    if (b) mouse = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    await settle(page)
  }
  let highlight = async function (...targets) {
    const boxes = []
    for (const t of targets) boxes.push(await boxOf(t))
    const x = Math.min(...boxes.map(b => b.x)) - 8, y = Math.min(...boxes.map(b => b.y)) - 8
    const r = Math.max(...boxes.map(b => b.x + b.width)) + 8, btm = Math.max(...boxes.map(b => b.y + b.height)) + 8
    await page.evaluate(({ x, y, w, h }) => {
      const el = document.getElementById('wt-hl'); if (!el) return
      // Over a dialog the app already dims and blurs the page; a second
      // full-screen dim on top of a backdrop-filter is costly to repaint.
      el.style.boxShadow = document.querySelector('[data-overlay]') ? '0 0 0 4px rgba(132,204,22,.25),0 0 24px rgba(132,204,22,.55)' : ''
      Object.assign(el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', opacity: '1' })
    }, { x, y, w: r - x, h: btm - y })
  }
  async function unhighlight() {
    await page.evaluate(() => { const el = document.getElementById('wt-hl'); if (el) el.style.opacity = '0' })
  }
  async function scrollMain(px) {
    await page.evaluate(px => { const m = document.querySelector('[data-app-scroll]'); m && m.scrollBy({ top: px, behavior: 'smooth' }) }, px)
    await sleep(700)
  }
  async function tabMenu(group, item) {
    await click(page.getByRole('button', { name: group, exact: true }))
    await click(page.locator(`a[href$="/${item}"]`))
  }
  // Any helper that stalls is reported, so a slow step can be traced to the
  // exact call rather than guessed at from the overrun.
  for (const [name, fn] of Object.entries({ hover, click, highlight })) {
    const wrapped = async (...a) => {
      const t = Date.now(); const r = await fn(...a)
      if (Date.now() - t > 2500) console.warn(`\n    slow ${name}(${a.map(x => String(x && x.card !== undefined ? 'card:' + x.card : x && x.panel !== undefined ? 'panel:' + x.panel : x)).join(', ')}) ${((Date.now() - t) / 1000).toFixed(1)}s`)
      return r
    }
    if (name === 'hover') hover = wrapped; else if (name === 'click') click = wrapped; else highlight = wrapped
  }
  const h = { page, pid, moveTo, hover, click, highlight, unhighlight, scrollMain, tabMenu, sleep }

  // ── Steps, one per narration id. Each starts as its line starts.
  // Each step: `go` runs BEFORE its line starts (navigation, silent), `show`
  // runs while the line is spoken (cursor and highlights), so a line never
  // talks over the previous screen.
  const STEPS = {
    'intro': { show: async () => { await moveTo(700, 420, 900); await highlight('h1') } },
    'dashboard': { show: async () => {
      await highlight({ card: 'Active Projects' }, { card: 'Due This Week' })
      await sleep(2400)
      await highlight({ card: 'This week', exact: true })
      await hover(page.getByText('This week', { exact: true }), 900)
    } },
    'project': {
      go: async () => {
        await click(page.getByRole('link', { name: 'Projects', exact: true }))
        const search = page.getByPlaceholder(/Search by name/)
        await click(search)
        await search.pressSequentially('Maple', { delay: 90 })
        await sleep(400)
      },
      show: async () => {
        await click(page.getByText(PROJECT, { exact: true }))
        await page.waitForURL(/\/projects\/[^/]+\/(overview)?$/, { timeout: 60000 })
        await vis(page.getByRole('heading', { name: PROJECT })).waitFor()
        await highlight(page.getByRole('heading', { name: PROJECT }), page.getByText('420 Maple Street'))
      },
    },
    'tabs': { show: async () => {
      const tabs = ['Field', 'Buyout', 'Finance', 'Docs'].map(n => page.getByRole('button', { name: n, exact: true }))
      await highlight(page.getByRole('link', { name: 'Overview', exact: true }), ...tabs)
      for (const t of tabs) { await hover(t, 350); await sleep(250) }
      await moveTo(1100, 600, 500)
    } },
    'schedule': {
      go: async () => {
        await tabMenu('Field', 'schedule')
        await click(page.getByRole('button', { name: 'Timeline', exact: true }))
      },
      show: async () => {
        await highlight({ card: 'Framing scope per plans' })
        await hover(page.getByText('HVAC scope per plans'), 900)
      },
    },
    'cascade': {
      go: async () => {
        await click(page.getByText('Framing scope per plans').locator('xpath=ancestor::div[.//div[contains(@class,"cursor-pointer")]][1]//div[contains(@class,"cursor-pointer")]'))
        await page.locator('#eend').waitFor()
      },
      show: async () => {
        const end = page.locator('#eend')
        const d = new Date((await end.inputValue()) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 3)
        await highlight(end)
        await hover(end, 500)
        await end.fill(d.toISOString().slice(0, 10))
        await sleep(400)
        await click(page.getByRole('button', { name: 'Save Changes' }))
        await vis(page.getByText(/lines? moves?$/)).waitFor({ timeout: 30000 })
        await sleep(300)
        await highlight({ panel: /lines? moves?$/ })
        await hover(page.getByText(/would get one email/), 900)
      },
      after: async () => {
        // Cancel the review, then the edit dialog: nothing typed is ever saved.
        await click(page.locator('[data-overlay]').last().getByRole('button', { name: /cancel/i }).last())
        await click(page.locator('[data-overlay]').last().getByRole('button', { name: 'Cancel', exact: true }))
        await page.locator('#eend').waitFor({ state: 'detached' })
      },
    },
    'daily-logs': {
      go: async () => {
        await tabMenu('Field', 'daily-logs')
        await vis(page.getByText(/^\w{3}, \w{3} \d+, \d{4}$/)).waitFor()
      },
      show: async () => {
        await click(page.getByText(/^\w{3}, \w{3} \d+, \d{4}$/))
        await sleep(500)
        await highlight({ card: /^\w{3}, \w{3} \d+, \d{4}$/ })
      },
    },
    'inspections': {
      go: async () => {
        await tabMenu('Docs', 'inspections')
        await vis(page.getByText('Rough Electrical', { exact: true })).waitFor()
      },
      show: async () => {
        await highlight({ card: 'Rough Electrical', exact: true })
        await hover(page.getByText(/^In \d+ days?$/), 900)
      },
    },
    'budget': {
      go: async () => { await tabMenu('Finance', 'budget'); await vis(page.getByText('Cost code', { exact: true })).waitFor() },
      show: async () => {
        await highlight({ card: 'Cost code', exact: true })
        await hover(page.getByText('Committed', { exact: true }), 900)
        await sleep(1600)
        await highlight({ card: 'Left to spend' })
      },
    },
    'bills': {
      go: async () => { await tabMenu('Finance', 'invoices'); await vis(page.getByText('Pending Approval', { exact: true })).waitFor() },
      show: async () => {
        await highlight({ card: 'Pending Approval', exact: true })
        await hover(page.getByText('Pending Approval', { exact: true }), 800)
      },
    },
    'client-billing': {
      go: async () => { await tabMenu('Finance', 'payments'); await vis(page.getByText('Funds received', { exact: true })).waitFor() },
      show: async () => {
        await highlight({ card: 'Funds received', exact: true }, { card: 'Escrow balance', exact: true })
        await sleep(2000)
        await highlight({ card: 'Invoices to your client', exact: true })
        await hover(page.getByText('Invoices to your client', { exact: true }), 800)
      },
    },
    'change-orders': {
      go: async () => { await tabMenu('Finance', 'change-orders'); await vis(page.getByText('Approved value', { exact: true })).waitFor() },
      show: async () => {
        await highlight({ card: 'Upgrade to porcelain tile in restrooms', exact: true })
        await hover(page.getByText('Upgrade to porcelain tile in restrooms', { exact: true }), 800)
        await sleep(1600)
        await highlight({ card: 'Approved value', exact: true })
      },
    },
    'portal': {
      show: async () => {
        await click(page.getByRole('button', { name: 'Share with client' }))
        await vis(page.getByText('Share with Client', { exact: true })).waitFor()
        await sleep(500)
        await highlight({ panel: 'Share with Client' })
        await hover(page.getByRole('button', { name: /copy link/i }), 900)
      },
      after: async () => {
        await click(page.locator('button:has(svg.lucide-x)')) // the dialog's X - never Send link or Regenerate
        await page.getByText('Share with Client', { exact: true }).waitFor({ state: 'detached' }).catch(() => {})
      },
    },
    'outro': {
      go: async () => { await click(page.getByRole('link', { name: 'Dashboard', exact: true })) },
      show: async () => { await moveTo(1100, 560, 1200) },
    },
  }
  function idOf(name) { return lines.find(l => l.id.replace(/^\d+-/, '') === name).id }

  // ── Record.
  const cdp = await context.newCDPSession(page)
  const frames = []
  cdp.on('Page.screencastFrame', async f => {
    const file = path.join(FRAMES, `${String(frames.length).padStart(6, '0')}.jpg`)
    frames.push({ file: path.basename(file), t: f.metadata.timestamp })
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'))
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 })
  await sleep(800)
  const timeline = []
  for (const line of lines) {
    const name = line.id.replace(/^\d+-/, '')
    const step = STEPS[name]
    if (!step) throw new Error(`No recorded step for narration id ${line.id}`)
    process.stdout.write(`  ${line.id} `)
    if (step.go) { await step.go(); await sleep(250) }
    const start = Date.now() / 1000
    timeline.push({ id: line.id, start, text: line.text, duration: durations[line.id] })
    await step.show()
    const left = start + durations[line.id] + PAD - Date.now() / 1000
    if (left > 0) await sleep(left * 1000)
    else process.stdout.write(`(action ran ${(-left).toFixed(1)}s past the line) `)
    await unhighlight()
    if (step.after) await step.after()
    console.log('ok')
  }
  await sleep(1200)
  await cdp.send('Page.stopScreencast')
  await sleep(300)
  const end = Date.now() / 1000
  fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify({ frames, steps: timeline, end }, null, 1))
  console.log(`  ${frames.length} frames, ${(end - frames[0].t).toFixed(1)}s`)
  await browser.close()
}

// Pages here poll, so "network idle" is often never reached; a fixed beat is
// enough because every step waits for the content it is about to show.
async function settle(page) {
  await page.waitForLoadState('domcontentloaded').catch(() => {})
  await sleep(250)
}

main().catch(async e => { console.error(e); await global.__page?.screenshot({ path: path.join(OUT, 'failure.png') }).catch(() => {}); process.exit(1) })
