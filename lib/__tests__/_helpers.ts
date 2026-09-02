// Shared by every suite. Deliberately tiny.
//
// `root()` comes from SYTENAV_ROOT, set by the runner. The suites this replaces
// hardcoded /home/user/Work-OS-Navigator, which is one reason they could never
// have run anywhere but the machine that wrote them.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const root = () => process.env.SYTENAV_ROOT ?? process.cwd()

let fails = 0

/** One assertion. Prints, counts, never throws - a suite reports every failure. */
export function ok(condition: boolean, name: string): void {
  console.log(`  ${condition ? '\x1b[32mok  \x1b[0m' : '\x1b[31mFAIL\x1b[0m'} ${name}`)
  if (!condition) fails++
}

/** Call at the end of every suite. */
export function done(): never {
  if (fails) console.log(`  \x1b[31m${fails} failed\x1b[0m`)
  process.exit(fails ? 1 : 0)
}

export const read = (rel: string): string => readFileSync(join(root(), rel), 'utf8')

/**
 * A file with its comments removed.
 *
 * Several of these suites assert that a bug is NOT present, and the comment
 * explaining that bug names it - so a naive search finds the prose and passes,
 * or finds it and fails, depending on which way round the check is. Strip the
 * comments and the assertion is about the code.
 */
export const code = (rel: string): string =>
  read(rel).replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')

/** Every .ts/.tsx under a directory, skipping what is not ours. */
export function walk(rel: string, out: string[] = []): string[] {
  const dir = join(root(), rel)
  for (const entry of readdirSync(dir)) {
    if (['node_modules', '.next', '.git', 'ios', 'android'].includes(entry)) continue
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(join(rel, entry), out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(join(rel, entry))
  }
  return out
}

export const exists = (rel: string): boolean => {
  try { statSync(join(root(), rel)); return true } catch { return false }
}
