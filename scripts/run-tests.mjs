#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// The test runner. `npm test`, or `npm test <name>` for one suite.
//
// esbuild-bundle each .ts in lib/__tests__ and run it under node. A suite is a
// plain script that prints its assertions and exits non-zero if any failed -
// no framework, because the alternative was no tests at all in the repo.
//
// Exits non-zero if ANY suite fails, so it can go straight into the pre-merge
// checklist beside tsc, next build and lint:hooks.
// ─────────────────────────────────────────────────────────────────────────────

import { readdirSync, mkdtempSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const DIR = join(ROOT, 'lib', '__tests__')
const filter = process.argv[2] ?? ''

const suites = readdirSync(DIR)
  // `_helpers` and anything else prefixed with _ is shared code, not a suite.
  // Without this the runner counted it as a passing test, which inflates the
  // number it reports - the one figure somebody skims.
  .filter(f => f.endsWith('.ts') && !f.startsWith('_'))
  .map(f => f.replace(/\.ts$/, ''))
  .filter(n => !filter || n.includes(filter))
  .sort()

if (!suites.length) {
  console.error(filter ? `No suite matching "${filter}".` : 'No suites found.')
  process.exit(1)
}

const out = mkdtempSync(join(tmpdir(), 'sytenav-tests-'))
const failed = []

for (const name of suites) {
  process.stdout.write(`\n\x1b[1m${name}\x1b[0m\n`)
  const js = join(out, `${name}.mjs`)
  try {
    execFileSync('npx', [
      'esbuild', '--bundle', '--platform=node', '--format=esm',
      join(DIR, `${name}.ts`), `--outfile=${js}`, '--log-level=error',
    ], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] })
  } catch {
    console.error('  could not compile')
    failed.push(name)
    continue
  }
  try {
    // SYTENAV_ROOT so a suite never hardcodes an absolute path - that is what
    // tied the old ones to one machine.
    execFileSync('node', [js], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, SYTENAV_ROOT: ROOT } })
  } catch {
    failed.push(name)
  }
}

rmSync(out, { recursive: true, force: true })

console.log(`\n${'─'.repeat(60)}`)
if (failed.length) {
  console.log(`\x1b[31m${failed.length} of ${suites.length} suites FAILED:\x1b[0m ${failed.join(', ')}`)
  process.exit(1)
}
console.log(`\x1b[32mall ${suites.length} suites pass\x1b[0m`)
