// A scan that the platform cuts off, reported in the browser's own words.
//
// THE REPORT: three red "Failed to fetch" bubbles over a Compare Responses
// panel whose contents were completely correct, sent as "cosmetic I think".
// Neither half of that was true.
//
// 1. The quote-upload route reads a PDF with an AI model and declared no
//    `maxDuration`. The invoice scan - the SAME work, reported once already -
//    has carried 60 the whole time. Eleven of the twelve routes that call the
//    model were in the first group. A rule that exists on one door has to
//    exist on the others, and this is what it looks like when it does not.
// 2. The client handed the resulting TypeError's `.message` to the user, so
//    Chrome's wording became the app's wording - and WebKit's would have been
//    different wording for the identical event.
//
// What this suite pins is both halves plus the thing that made the message a
// lie rather than merely ugly: a request that did not come back says NOTHING
// about whether the work happened, and the quote was on screen behind the
// bubble claiming it had failed.

import { ok, done, code, read, walk, root } from './_helpers'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

console.log('\nscan-timeout')

// ── 1. Every route that calls the model declares a duration ──────────────────
{
  const aiRoutes = walk('app/api')
    .filter(f => /route\.ts$/.test(f))
    .filter(f => /anthropic\.messages\.create|new Anthropic/.test(read(f)))

  ok(aiRoutes.length >= 12,
    `found the AI routes to check (${aiRoutes.length})`)

  const missing = aiRoutes.filter(f => !/export const maxDuration\s*=\s*(\d+)/.test(code(f)))
  ok(missing.length === 0,
    `every route that calls the model declares maxDuration${missing.length ? ` - missing: ${missing.join(', ')}` : ''}`)

  const tooShort = aiRoutes.filter(f => {
    const n = Number(code(f).match(/export const maxDuration\s*=\s*(\d+)/)?.[1] ?? 0)
    return n < 60
  })
  ok(tooShort.length === 0,
    `...and none is under 60s, which is what a document scan needs${tooShort.length ? ` - ${tooShort.join(', ')}` : ''}`)

  const wrongRuntime = aiRoutes.filter(f => !/export const runtime\s*=\s*'nodejs'/.test(code(f)))
  ok(wrongRuntime.length === 0,
    `...and each runs on nodejs, since maxDuration means nothing on the edge${wrongRuntime.length ? ` - ${wrongRuntime.join(', ')}` : ''}`)
}

// ── 2. One reader turns a dead request into a sentence ───────────────────────
{
  ok(existsSync(join(root(), 'lib/fetch-error.ts')),
    'lib/fetch-error.ts exists - one home for what a dead request says')

  const src = code('lib/fetch-error.ts')

  // WebKit is the native shell. Matching only Chrome's string is how a phone
  // shows something different from a laptop for one event.
  //
  // Asserted as the CALL, not as a bare substring of the file. The first
  // version asked `src.includes('load failed')` and went green while the line
  // was deleted, because the red-check edit had left the words "upload failed"
  // in the fallback sentence - and "up|load failed" contains it. A check that
  // passes for the wrong reason is the thing these suites exist to catch.
  for (const spelling of ['failed to fetch', 'load failed', 'networkerror']) {
    ok(new RegExp(`includes\\('${spelling}'\\)`).test(src.toLowerCase()),
      `...and recognises "${spelling}" - the browsers do not agree on the words`)
  }
  ok(/AbortError|TimeoutError/.test(src),
    '...and an aborted or timed-out request, which carries no status either')

  // The whole point: it must not announce a failure it did not observe.
  ok(/do not know whether it finished|may already be there/i.test(read('lib/fetch-error.ts')),
    '...and says we do not know the outcome, rather than claiming it failed')
  ok(!/\bsomething went wrong\b/i.test(src.split('return message')[0] ?? src),
    '...and does not flatten a real error into "something went wrong" before the fallback')
}

// ── 3. Nobody hands a raw thrown message to a user ───────────────────────────
{
  // The files that were doing it. A raw `.message` from a catch is the browser
  // talking, and on the network path the browser says "Failed to fetch".
  const SURFACES = [
    'app/(dashboard)/projects/[id]/request-quotes/page.tsx',
    'components/quotes/comparison-block.tsx',
    'app/share/[token]/page.tsx',
    'components/documents/pdf-filler.tsx',
    'components/settings/quickbooks-card.tsx',
  ]
  // `notify(e.message)`, `setError(e?.message ?? '...')`, `text: e.message`.
  const RAW = /(notify|setError|setProblem|setMsg|setNotice)\s*\(\s*\{?[^)]*\b(e|err|error)\??\.message\b/

  for (const f of SURFACES) {
    const src = code(f)
    ok(!RAW.test(src), `${f} shows no raw thrown message to a user`)
    ok(/fetchProblem\(/.test(src), `...and asks fetchProblem instead`)
  }
}

// ── 4. One bad file does not take the others down with it ────────────────────
{
  // Both doors onto the upload route. The page was fixed last change; the
  // block had the identical bug one file over, which is the pattern this
  // repo keeps paying for.
  for (const f of [
    'components/quotes/comparison-block.tsx',
    'app/(dashboard)/projects/[id]/request-quotes/page.tsx',
  ]) {
    const src = code(f)
    ok(/const failed: string\[\] = \[\]/.test(src),
      `${f} collects every file's answer rather than stopping at the first`)
    ok(/failed\.length === list\.length/.test(src),
      `...and says whether it was all of them or some of them`)
    ok(/console\.error\(`\[quotes\]/.test(src),
      `...and logs each one, so a report is recoverable from somewhere`)
  }

  // The refresh has to happen on the failure path too - the quote may have
  // landed while the connection was dying, which is what the report showed.
  const block = code('components/quotes/comparison-block.tsx')
  const finallyAt = block.indexOf('} finally {')
  ok(finallyAt > -1 && block.slice(finallyAt).includes('onChanged()'),
    'comparison-block refreshes in `finally`, because a dead request is not a verdict')
}

done()
