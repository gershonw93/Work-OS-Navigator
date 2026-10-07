'use client'

import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'
import { Search, Sparkles, ChevronRight, Loader2, Mail } from 'lucide-react'
import { autoFocusOnDesktop } from '@/lib/auto-focus'
import { isNetworkError } from '@/lib/fetch-error'
import { helpHref } from '@/lib/help-host'
import { articlePath, searchPublic, topicLabel } from '@/lib/help/site'
import { questionProblem, type HelpAnswer } from '@/lib/help/answer'
import { SUPPORT_EMAIL, supportMailto } from '@/lib/support-email'

// The Help Center's search box: instant article matches as you type, and an AI
// short answer when you press Enter or "Ask".
//
// The two are deliberately separate acts. Typing is free and local; asking
// costs a model call, so it only happens when somebody asks for it - never on
// every keystroke.
//
// The API answers on the same origin from both hosts (help.sytenav.com rewrites
// pages, not /api), so the fetch is a plain relative path.

type AskState =
  | { kind: 'idle' }
  | { kind: 'asking'; question: string }
  | { kind: 'answered'; question: string; answer: HelpAnswer }
  | { kind: 'failed'; question: string; message: string }

export function HelpSearch({ large = false }: { large?: boolean }) {
  const [query, setQuery] = useState('')
  const [ask, setAsk] = useState<AskState>({ kind: 'idle' })
  // The question being waited for. A slower first answer must not land on top
  // of a second question asked meanwhile.
  const waitingFor = useRef<string | null>(null)

  const results = useMemo(() => searchPublic(query).slice(0, 8), [query])
  const trimmed = query.trim()

  async function askAi() {
    const problem = questionProblem(trimmed)
    if (problem) {
      setAsk({ kind: 'failed', question: trimmed, message: problem })
      return
    }
    const question = trimmed
    waitingFor.current = question
    setAsk({ kind: 'asking', question })
    try {
      const res = await fetch('/api/help-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      const data = await res.json().catch(() => null)
      if (waitingFor.current !== question) return
      if (res.ok && data?.answer) setAsk({ kind: 'answered', question, answer: data as HelpAnswer })
      else setAsk({ kind: 'failed', question, message: data?.error ?? 'Could not answer that right now. The articles below may have it.' })
    } catch (e) {
      if (waitingFor.current !== question) return
      // A question is safe to ask again, so the advice is simply to retry.
      setAsk({
        kind: 'failed', question,
        message: isNetworkError(e)
          ? 'The connection dropped before an answer came back. Check your connection and ask again.'
          : 'Could not answer that right now. The articles below may have it.',
      })
    }
  }

  return (
    <div className="w-full text-left">
      <form
        role="search"
        onSubmit={e => { e.preventDefault(); void askAi() }}
        className="relative"
      >
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-faint" aria-hidden />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={large ? 'Ask a question or search, e.g. how do I bill by pay app' : 'Ask a question'}
          aria-label="Search the Help Center or ask a question"
          maxLength={300}
          autoFocus={autoFocusOnDesktop() && large}
          className={`w-full rounded-2xl border border-line bg-panel pl-12 pr-28 text-base text-ink shadow-sm placeholder:text-faint focus:border-accent focus:outline-none ${large ? 'h-14' : 'h-12'}`}
        />
        <button
          type="submit"
          disabled={ask.kind === 'asking'}
          className="absolute right-2 top-1/2 inline-flex h-10 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-xl bg-accent px-3.5 text-sm font-semibold text-accent-ink"
        >
          {ask.kind === 'asking' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
          Ask
        </button>
      </form>

      {ask.kind !== 'idle' && <AnswerCard state={ask} />}

      {trimmed && (
        <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-panel">
          {results.length > 0 ? (
            <ul className="divide-y divide-line-soft">
              {results.map(a => (
                <li key={a.slug}>
                  <Link href={helpHref(articlePath(a.slug))} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-surface">
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink">{a.title}</span>
                      <span className="mt-0.5 block truncate text-sm text-muted-fg">{topicLabel(a.category)} · {a.summary}</span>
                    </span>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-faint" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-4 text-sm text-muted-fg">
              No article titles match those words. Press <span className="font-semibold text-ink">Ask</span> for an answer instead.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function AnswerCard({ state }: { state: Exclude<AskState, { kind: 'idle' }> }) {
  return (
    <div aria-live="polite" className="mt-3 rounded-2xl border border-accent/30 bg-accent-tint/40 p-4 sm:p-5">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent-fg">
        <Sparkles className="h-3.5 w-3.5" aria-hidden /> Quick answer
      </p>
      {state.kind === 'asking' && (
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-fg">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Reading the help articles…
        </p>
      )}
      {state.kind === 'failed' && <p className="mt-2 text-sm text-ink-soft">{state.message}</p>}
      {state.kind === 'answered' && (
        <>
          <p className="mt-2 whitespace-pre-line text-base leading-relaxed text-ink">{state.answer.answer}</p>
          {state.answer.sources.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-muted-fg">From these articles</p>
              <ul className="mt-1.5 space-y-1">
                {state.answer.sources.map(s => (
                  <li key={s.slug}>
                    <Link href={helpHref(articlePath(s.slug))} className="inline-flex items-center gap-1 text-sm font-medium text-accent-fg hover:underline">
                      {s.title} <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!state.answer.answered && (
            <a href={supportMailto(`Help Center question: ${state.question.slice(0, 80)}`)}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent-fg hover:underline">
              <Mail className="h-4 w-4" aria-hidden /> Ask us at {SUPPORT_EMAIL}
            </a>
          )}
          <p className="mt-3 text-xs text-faint">Written by AI from the articles on this site. Check the article before relying on it.</p>
        </>
      )}
    </div>
  )
}
