'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { usePermissions } from '@/lib/use-permissions'
import { fetchProblem } from '@/lib/fetch-error'
import { todayDateInput } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { attentionDate, cardDue, pmAllowedRole, PM_SLUG, type PmCard } from '@/lib/project-management'
import { getImpersonation } from '@/components/layout/impersonate-switcher'

/**
 * My Work: the signed-in person's own Project Management cards, from every
 * job, in the order they need attention. Read-only here - a card is opened and
 * changed on its own job's board, which is where each row leads.
 *
 * The same privacy as the boards: `/api/me/project-management` answers only
 * for the caller's own rows.
 */

interface Group { key: string; title: string; cards: PmCard[] }

function groups(cards: PmCard[], today: string): Group[] {
  const open = cards.filter(c => !c.completed_at)
  // The card's own due date or its soonest open subtask, whichever is first.
  const dated = (c: PmCard) => attentionDate(c)
  const byDue = (a: PmCard, b: PmCard) => dated(a).localeCompare(dated(b))
  return [
    { key: 'overdue', title: 'Overdue', cards: open.filter(c => dated(c) && dated(c) < today).sort(byDue) },
    { key: 'today', title: 'Today', cards: open.filter(c => dated(c) === today) },
    { key: 'coming', title: 'Coming up', cards: open.filter(c => dated(c) > today).sort(byDue) },
    { key: 'undated', title: 'No date', cards: open.filter(c => !dated(c)) },
  ].filter(g => g.cards.length)
}

export default function MyWorkPage() {
  const { role, loading: permsLoading } = usePermissions()
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [failure, setFailure] = useState('')
  const [cards, setCards] = useState<PmCard[]>([])
  const [projects, setProjects] = useState<Record<string, string>>({})
  const [attempt, setAttempt] = useState(0)
  // Signed in AS somebody from the platform console: their private cards are
  // not support's to read, so nothing is asked for. See pm-board.tsx.
  const [impersonating, setImpersonating] = useState<boolean | null>(null)
  useEffect(() => { setImpersonating(!!getImpersonation()) }, [])
  const allowed = pmAllowedRole(role) && impersonating === false
  const today = todayDateInput()

  useEffect(() => {
    if (permsLoading || !allowed) return
    let live = true
    ;(async () => {
      try {
        const { data: { session } } = await createClient().auth.getSession()
        const res = await fetch('/api/me/project-management', { headers: { Authorization: `Bearer ${session?.access_token ?? ''}` } })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(d.error || `That did not work (${res.status}).`)
        if (!live) return
        setCards(d.cards ?? [])
        setProjects(Object.fromEntries(((d.projects ?? []) as { id: string; name: string }[]).map(p => [p.id, p.name])))
        setState('ready')
      } catch (e) {
        if (live) { setFailure(fetchProblem(e, 'loading your cards')); setState('failed') }
      }
    })()
    return () => { live = false }
  }, [permsLoading, allowed, attempt])

  const list = groups(cards, today)
  const done = cards.filter(c => c.completed_at).length

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">My Work</h1>
        <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-fg">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Your own Project Management cards from every job. Nobody else can see them, your admin included.</span>
        </p>
      </div>

      {(permsLoading || impersonating === null || (allowed && state === 'loading')) && <p className="py-16 text-center text-sm text-faint">Loading…</p>}

      {!permsLoading && !allowed && impersonating !== null && (
        <p className="py-16 text-center text-sm text-muted-fg">
          {impersonating ? 'Private cards are not shown while you are signed in as somebody else.' : 'My Work is not part of Field Mode.'}
        </p>
      )}

      {allowed && state === 'failed' && (
        <div className="py-16 text-center">
          <p className="text-sm font-medium text-ink-soft">Your cards could not be loaded.</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-fg">{failure}</p>
          <Button type="button" variant="outline" className="mt-4" onClick={() => { setState('loading'); setAttempt(a => a + 1) }}>Try again</Button>
        </div>
      )}

      {allowed && state === 'ready' && list.length === 0 && (
        <div className="rounded-2xl border border-line bg-panel px-4 py-12 text-center">
          <p className="text-sm font-medium text-ink-soft">{done ? 'Nothing open. Everything on your boards is done.' : 'No cards yet.'}</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-fg">
            Open a job and go to its Project Management tab to add one. It shows up here as well.
          </p>
          <Link href="/projects" className="mt-4 inline-block text-sm font-medium text-accent-fg hover:underline">Go to Projects →</Link>
        </div>
      )}

      {allowed && state === 'ready' && list.map(g => (
        <section key={g.key} aria-label={g.title} className="space-y-2">
          <h2 className={cn('text-xs font-bold uppercase tracking-wider', g.key === 'overdue' ? 'text-danger' : 'text-ink')}>
            {g.title} <span className="font-medium text-muted-fg">{g.cards.length}</span>
          </h2>
          <div className="divide-y divide-line-soft rounded-2xl border border-line bg-panel">
            {g.cards.map(card => {
              const due = cardDue(card, today)
              return (
                <Link key={card.id} href={`/projects/${card.project_id}/${PM_SLUG}?card=${card.id}`}
                  className="flex flex-col gap-1 px-4 py-3.5 hover:bg-surface lg:flex-row lg:items-center lg:gap-4">
                  <span className="min-w-0 flex-1 break-words text-sm font-semibold text-ink">{card.title}</span>
                  <span className="min-w-0 truncate text-xs text-muted-fg lg:w-56">{projects[card.project_id] ?? 'A job'}</span>
                  <span className={cn('text-xs lg:w-56 lg:text-right', !due?.subtask && 'whitespace-nowrap',
                    due?.tone === 'overdue' ? 'font-semibold text-danger' : due?.tone === 'today' ? 'font-semibold text-ink' : 'text-muted-fg')}>
                    {due?.text ?? 'No date'}
                  </span>
                </Link>
              )
            })}
          </div>
        </section>
      ))}

      {allowed && state === 'ready' && list.length > 0 && done > 0 && (
        <p className="text-xs text-muted-fg">{done} finished {done === 1 ? 'card is' : 'cards are'} not listed here. They are still on their boards.</p>
      )}
    </div>
  )
}
