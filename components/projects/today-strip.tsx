'use client'

import Link from 'next/link'
import { CalendarCheck, HardHat, CheckSquare, PhoneCall } from 'lucide-react'
import { todayOnJob, type TodayInput, type TodayKind } from '@/lib/today'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// "Whoever is on the job site should see what's coming for that day."
//
// They could not. The Master Calendar gathers a day and it is admins and
// managers only - a foreman, office staff, a worker or a sub cannot open it -
// and it is a month grid with no "what is next", so even an admin has to know
// which square to look in. A booked inspection was therefore invisible unless
// you already knew its date, which is the reverse of what a calendar is for.
//
// This sits on the two screens the field already opens, and it is ONE card with
// hairline rows rather than a box per item.
// ─────────────────────────────────────────────────────────────────────────────

const ICON: Record<TodayKind, any> = {
  inspection: CalendarCheck,
  schedule: HardHat,
  task: CheckSquare,
  needs_booking: PhoneCall,
}

// Colour only where it MEANS something: the last group is the one nobody has
// done anything about yet. The rest of the day is just the day.
const TONE: Record<TodayKind, string> = {
  inspection: 'text-info',
  schedule: 'text-muted-fg',
  task: 'text-muted-fg',
  needs_booking: 'text-warn',
}

export function TodayStrip({ title = 'Today on site', ...input }: TodayInput & { title?: string }) {
  const rows = todayOnJob(input)

  return (
    <div className="rounded-2xl border border-line bg-panel lg:rounded-lg">
      <div className="flex items-baseline justify-between gap-2 px-5 py-3">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <span className="text-xs text-faint">
          {formatDate(new Date(), { weekday: 'long', month: 'short', day: 'numeric' })}
        </span>
      </div>
      {rows.length === 0 ? (
        // An empty day is a sentence, not a blank panel. "Nothing here" and
        // "we could not work it out" must never look the same.
        <p className="border-t border-line-soft px-5 py-4 text-sm text-muted-fg">
          Nothing booked or due on this job today.
        </p>
      ) : (
        <ul className="divide-y divide-line-soft border-t border-line-soft">
          {rows.map((r, i) => {
            const Icon = ICON[r.kind]
            const body = (
              <>
                <Icon className={cn('h-4 w-4 shrink-0', TONE[r.kind])} />
                <span className="flex-1 min-w-0 text-sm font-medium text-ink-soft break-words">{r.label}</span>
                {r.detail && (
                  <span className={cn('shrink-0 text-xs', r.kind === 'needs_booking' ? 'text-warn' : 'text-faint')}>
                    {r.detail}
                  </span>
                )}
              </>
            )
            return (
              <li key={`${r.kind}-${i}`}>
                {r.href
                  ? (
                    <Link href={r.href} className="flex min-h-11 items-center gap-3 px-5 py-3 hover:bg-surface">
                      {body}
                    </Link>
                  )
                  : <div className="flex min-h-11 items-center gap-3 px-5 py-3">{body}</div>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
