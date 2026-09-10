// What the date on a task says.
//
// THE BUG. This read the calendar and nothing else, so it answered "6d overdue"
// whatever the task's status - and a COMPLETED card sat in the Completed column
// contradicting itself. Finished work cannot be late. It has a date it was
// finished on, and that is the only interesting one.
//
// IN lib/ RATHER THAN IN THE PAGE, and not only because a page component may
// not export anything but a page. This is the whole of the fix and it is pure:
// four states and a fall-back, testable without a browser. The version that
// shipped the bug was eight lines inside a 1,400-line screen where nothing
// could reach it.

import { formatDate } from './dates'

export interface DueFacts {
  due_date: string | null
  status: string
  completed_at?: string | null
}

export function dueLabel(task: DueFacts): string | null {
  if (task.status === 'completed') {
    // `completed_at` is the honest answer, and every task finished from now on
    // has one - the PATCH route writes it, which it never did before. Where it
    // is missing, on everything finished up to today, fall back to the plain
    // due date with NO overdue language: not knowing when something was done is
    // not a reason to call it late.
    const done = task.completed_at ?? task.due_date
    if (!done) return null
    return `Done ${formatDate(new Date(done), { month: 'short', day: 'numeric' })}`
  }
  if (!task.due_date) return null
  const d = new Date(task.due_date + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff < 0) return `${Math.abs(diff)}d overdue`
  if (diff === 0) return 'Due today'
  if (diff === 1) return 'Due tomorrow'
  return `Due ${formatDate(d, { month: 'short', day: 'numeric' })}`
}
