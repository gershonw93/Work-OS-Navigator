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
  read(rel)
    .replace(/\/\/[^\n]*/g, '')
    // A block comment only opens at the start of a line or inside a JSX `{...}`.
    //
    // IT USED TO BE `/\/\*[\s\S]*?\*\//g`, and that quietly ate 183 lines of the
    // inspections page: `accept="image/*,application/pdf"` contains `/*`, which
    // opened a comment that ran to the next `*/` hundreds of lines later. Every
    // source assertion about the JSX in between was searching text that was no
    // longer there - so a positive check could never pass and a negative one
    // could never fail. A test that cannot fail is a guess about what it covers,
    // and this one was hiding inside the helper the other suites all share.
    .replace(/(^|\n)([ \t]*)\/\*[\s\S]*?\*\//g, '$1$2')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')

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

/**
 * The combined idempotent migration, whatever it is called this week.
 *
 * Its name carries the highest migration number (`_combined_008-102.sql`), so
 * every test that named it directly broke on the next migration - which is a
 * test failing for a reason nobody would act on, the exact thing the lint
 * config is kept narrow to avoid.
 */
export const readCombined = (): string => {
  const dir = join(root(), 'supabase/migrations')
  const name = readdirSync(dir).find(f => f.startsWith('_combined_') && f.endsWith('.sql'))
  if (!name) throw new Error('no _combined_*.sql in supabase/migrations')
  return readFileSync(join(dir, name), 'utf8')
}

export const exists = (rel: string): boolean => {
  try { statSync(join(root(), rel)); return true } catch { return false }
}
