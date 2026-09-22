'use client'

import { useState } from 'react'
import { AlertTriangle, ArrowRight, Info, Loader2, Lock, Mail, MailX } from 'lucide-react'
import type { ChangeWarning } from '@/lib/schedule-change-warning'

// "These moved." The screen between a cascade and a sub's inbox.
//
// NOTHING GOES OUT WITHOUT THIS. The two buttons are deliberately both real
// actions - "Notify subs" and "Shift silently" - because a single primary
// button with a quiet "don't email" checkbox beside it is a choice somebody
// makes by not noticing. Closing the dialog is Cancel, and Cancel moves
// nothing at all.
//
// It is `.overlay` + `data-overlay` like every other dialog: a hand-rolled
// `fixed inset-0` knows nothing about the notch, and a panel that does not
// declare itself an overlay leaves the page scrolling underneath it.

/** Straight off the edited line, or further down the chain from it. */
export type LinkKind = 'direct' | 'downstream'

/** What the link says. An 80% gate is not the same link as a plain one. */
export interface LinkGate {
  pct: number | null
  lagDays: number
}

export interface CascadeMove {
  id: string
  name: string
  from: { start: string; end: string }
  to: { start: string; end: string }
  shiftDays: number
  because: string | null
  link: LinkKind
  gate: LinkGate | null
  sub: { id: string; name: string; email: string | null } | null
}

export interface CascadeSkip {
  id: string
  name: string
  reason: 'manually_overridden' | 'no_shift' | 'chain_stopped' | 'progress_gate' | string
  /** `blockedBy`'s own sentence, for a gate. Never re-worded here. */
  blockReason?: string | null
  because: string
  link: LinkKind
  gate: LinkGate | null
}

/**
 * Why a linked line is sitting still. THE REPORT THIS ANSWERS: linked rows
 * were missing from the review entirely, which reads as "that row is not
 * linked" - the one thing this screen exists to disprove. Every linked line
 * the edit reaches is now in one list or the other, and a line that is not
 * moving says which of the three reasons it is.
 */
function whyStill(s: CascadeSkip): string {
  switch (s.reason) {
    case 'manually_overridden':
      return `its dates were changed by hand AFTER it was linked, so ${s.because} moving does not move it`
    case 'no_shift':
      return `${s.because} still finishes on the same day, so there is nothing to pass on`
    case 'chain_stopped':
      return `${s.because} is not moving, so where this one lands is not worked out`
    case 'progress_gate':
      // `blockedBy` already wrote this sentence, naming the percent it needs
      // and the percent it has. Wording it a second time here is how two
      // screens come to say different things about one gate.
      return s.blockReason
        ?? `${s.because} is not far enough along to pull this one forward`
    default:
      return `${s.because} moving does not move it`
  }
}

/**
 * The one place a link is put into words - AND IT NAMES THE GATE.
 *
 * REPORTED: the review "shortens its label to 'waits on Sheetrock', hiding
 * that it's an 80% link". Two rows waiting on the same trade under different
 * conditions printed the same sentence, so the screen could not be used to
 * check the thing it was showing you.
 */
function linkWords(link: LinkKind, editedName: string, gate: LinkGate | null): string {
  const head = link === 'direct' ? `waits on ${editedName}` : 'further down the chain'
  if (!gate) return head
  const parts: string[] = []
  if (gate.pct != null) parts.push(`at ${gate.pct}%`)
  if (gate.lagDays > 0) parts.push(`plus ${gate.lagDays} ${gate.lagDays === 1 ? 'day' : 'days'}`)
  return parts.length ? `${head} ${parts.join(', ')}` : head
}

export interface AffectedSub {
  companyId: string | null
  companyName: string
  email: string | null
  lines: { id: string; trade: string; from: string; to: string; because: string | null }[]
}

export function CascadeReview({
  moves, skipped, affected, editedName, warning, onConfirm, onCancel,
}: {
  moves: CascadeMove[]
  skipped: CascadeSkip[]
  affected: AffectedSub[]
  editedName: string
  /** What this change will NOT do. Rendered first - it is why the screen opened. */
  warning?: ChangeWarning | null
  onConfirm: (notify: boolean) => Promise<void>
  onCancel: () => void
}) {
  const [busy, setBusy] = useState<'notify' | 'silent' | null>(null)

  async function go(notify: boolean) {
    setBusy(notify ? 'notify' : 'silent')
    // try/finally, always: `setBusy(null)` as the last statement of the happy
    // path leaves the dialog spinning for ever on a throw.
    try { await onConfirm(notify) } finally { setBusy(null) }
  }

  const withEmail = affected.filter(a => a.email)
  const withoutEmail = affected.filter(a => !a.email)

  return (
    <div className="overlay" data-overlay role="dialog" aria-modal="true" aria-label="Review the schedule change">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-panel">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold text-ink">
            {moves.length === 0 ? 'Nothing else moves' : `${moves.length} ${moves.length === 1 ? 'line moves' : 'lines move'}`}
          </h2>
          <p className="mt-0.5 text-sm text-muted-fg">
            Moving {editedName}
            {moves.length > 0 && ' pushes everything that waits on it.'}
            {moves.length === 0 && skipped.length > 0
              && ` - ${skipped.length} linked ${skipped.length === 1 ? 'line stays' : 'lines stay'} put. Here is why.`}
            {moves.length === 0 && skipped.length === 0 && ' - nothing else on this job is waiting on it.'}
          </p>
        </div>

        <div className="max-h-[55vh] overflow-y-auto">
          {/* WHAT THIS WILL NOT DO, first, because on most jobs it is the only
              thing on the screen worth reading. An absence is a fact: "nothing
              is waiting on this" and "the feature did not fire" look identical
              from the chair unless one of them is written down. */}
          {warning && !warning.silent && (
            <div className="border-b border-line bg-warn-tint px-5 py-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-warn">
                <Info className="h-3.5 w-3.5 shrink-0" /> {warning.title}
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {warning.points.map((point: string, i: number) => (
                  <li key={i} className="text-sm leading-relaxed text-ink-soft">{point}</li>
                ))}
              </ul>
            </div>
          )}

          {moves.length > 0 && (
            <ul className="divide-y divide-line-soft">
              {moves.map(m => (
                <li key={m.id} className="px-5 py-3">
                  <div className="flex min-w-0 items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-medium text-ink">{m.name}</span>
                    <span className="whitespace-nowrap text-xs text-muted-fg">
                      {m.shiftDays > 0 ? '+' : ''}{m.shiftDays} {Math.abs(m.shiftDays) === 1 ? 'day' : 'days'}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
                    <span className="text-muted-fg line-through">{m.from.start}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-faint" />
                    <span className="font-medium text-ink">{m.to.start}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-fg">
                    {m.because ? `because ${m.because} moved` : 'you edited this'}
                    {' · '}
                    {linkWords(m.link, editedName, m.gate)}
                    {' · '}
                    {m.sub ? m.sub.name : 'no sub on this line yet'}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {skipped.length > 0 && (
            <div className="border-t border-line bg-surface px-5 py-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-warn">
                <Lock className="h-3.5 w-3.5" />
                {skipped.length} linked {skipped.length === 1 ? 'line is' : 'lines are'} not moving
              </p>
              <ul className="mt-1 space-y-0.5">
                {skipped.map(s => (
                  <li key={s.id} className="text-xs text-muted-fg">
                    <span className="text-ink">{s.name}</span>
                    {' ('}{linkWords(s.link, editedName, s.gate)}{') - '}
                    {whyStill(s)}.
                  </li>
                ))}
              </ul>
              {skipped.some(s => s.reason === 'manually_overridden') && (
                <p className="mt-1.5 text-xs text-faint">
                  Link it again from its own row and it follows from then on.
                </p>
              )}
              {/* A GATE ONLY EVER HOLDS A PULL-FORWARD. Saying so stops this
                  reading as "the gate stopped my delay going out". */}
              {skipped.some(s => s.reason === 'progress_gate') && (
                <p className="mt-1.5 text-xs text-faint">
                  A percent gate only holds a trade back from starting EARLIER. A trade that slips always
                  pushes the ones behind it, whatever percent they are at.
                </p>
              )}
            </div>
          )}
        </div>

        {moves.length > 0 && (
          <div className="border-t border-line px-5 py-3">
            {withEmail.length > 0 && (
              <p className="text-xs text-muted-fg">
                <span className="font-medium text-ink">{withEmail.length} {withEmail.length === 1 ? 'sub' : 'subs'}</span>
                {' would get one email each: '}
                {withEmail.map(a => a.companyName).join(', ')}
              </p>
            )}
            {withoutEmail.length > 0 && (
              <p className="mt-1 flex items-start gap-1.5 text-xs text-warn">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  No email on file for {withoutEmail.map(a => a.companyName).join(', ')} - {withoutEmail.length === 1 ? 'they' : 'they'} will not hear about this from SyteNav.
                </span>
              </p>
            )}
            {affected.length === 0 && (
              <p className="text-xs text-muted-fg">No subs are on the lines that moved, so there is nobody to tell.</p>
            )}
          </div>
        )}

        {/* Three controls do not share 390px. Below lg the two choices share a
            row and Cancel takes its own; .row-even reaches both edges. */}
        <div className="border-t border-line px-5 py-3">
          {/* NOTHING MOVING MEANS NOBODY TO TELL, so the choice between telling
              and not telling is not a choice - it is two buttons about emailing
              nobody, which is the report this screen already answered once.
              One button that saves, and Cancel. */}
          {moves.length === 0 ? (
            <div className="row-even lg:flex lg:flex-wrap lg:justify-end gap-2">
              <button
                type="button" onClick={onCancel} disabled={!!busy}
                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink hover:bg-surface disabled:opacity-60"
              >
                Cancel - change nothing
              </button>
              <button
                type="button" onClick={() => go(false)} disabled={!!busy}
                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink hover:opacity-90 disabled:opacity-60"
              >
                {busy === 'silent' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save the dates anyway
              </button>
            </div>
          ) : (<>
          <div className="row-even lg:flex lg:flex-wrap lg:justify-end gap-2">
            <button
              type="button" onClick={() => go(true)} disabled={!!busy || affected.length === 0}
              className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink hover:opacity-90 disabled:opacity-60"
            >
              {busy === 'notify' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Notify subs
            </button>
            <button
              type="button" onClick={() => go(false)} disabled={!!busy}
              className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink hover:bg-surface disabled:opacity-60"
            >
              {busy === 'silent' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailX className="h-4 w-4" />}
              Shift silently
            </button>
          </div>
          <button
            type="button" onClick={onCancel} disabled={!!busy}
            className="mt-2 w-full whitespace-nowrap rounded-lg px-4 py-2.5 text-sm text-muted-fg hover:bg-surface disabled:opacity-60 lg:mt-0 lg:w-auto lg:float-right lg:mr-2"
          >
            Cancel - move nothing
          </button>
          </>)}
        </div>
      </div>
    </div>
  )
}
