'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// Something went wrong, said inside the page.
//
// THE BUG. Two reports in a row said the app "crashed" or "killed the page":
// typing -500 into an allowance, and typing a choice onto a selection with no
// budget line. Both are ordinary refusals - a 400 and a 409 - and both ended in
// the same single statement:
//
//     alert((await res.json().catch(() => ({}))).error ?? 'Could not save')
//
// In the native shell this app is a REMOTE WKWebView (capacitor.config.ts sets
// `server.url`), and there `window.alert` is not a browser chrome bar: the
// Capacitor bridge presents a native UIAlertController and WebKit BLOCKS THE
// JAVASCRIPT THREAD until it is dismissed. One of the two fired from a `blur`
// handler while the keyboard was dismissing - a presentation racing a view
// controller transition. A dialog that does not get presented is a page that
// never runs another line, which from the outside is indistinguishable from a
// crash.
//
// `window.confirm` was dealt with long ago: DeleteGuardProvider replaced every
// one with an in-page dialog. `alert` was left behind, in 53 places, and was
// the last blocking native dialog in the app. This is its replacement, and it
// is deliberately shaped like its older sibling - a provider at the root, a
// hook, one call.
//
// NOT AN OVERLAY, and that is the point. It carries no `data-overlay` (which
// freezes the app behind it) and it is not `.overlay` (which is a modal
// layer). A message about a field is not a mode; you must be able to fix the
// field while reading it. The dock is pointer-events: none so the app
// underneath stays live, and only the cards themselves take taps.
//
// It is positioned off `--vv-h`/`--vv-t` like every other floating thing here,
// so it sits above the keyboard rather than behind it - which is exactly the
// situation the reports were in when they hit it.
// ─────────────────────────────────────────────────────────────────────────────

export type NoticeTone = 'error' | 'success' | 'info'

export interface NoticeOptions {
  /** Default 'error' - all but a handful of these are failure paths. */
  tone?: NoticeTone
  /** A short bold lead, when the message alone does not say what it is about. */
  title?: string
}

type Notify = (message: string, opts?: NoticeOptions) => void

const NoticeContext = createContext<Notify | null>(null)

/**
 * Say something to the user.
 *
 * NO `alert` FALLBACK when there is no provider, on purpose. Falling back would
 * make this file the one place still allowed to open a blocking native dialog,
 * and "being the exception" is how the plans viewer went a whole sweep without
 * learning about the notch. Instead the provider is mounted once at the ROOT
 * layout - every screen in the app, the client portal and share links included
 * - and a test pins it there, so the no-provider branch cannot happen.
 */
export function useNotice(): Notify {
  const ctx = useContext(NoticeContext)
  return ctx ?? ((message, opts) => {
    // Unreachable while the root layout mounts the provider. Logged rather
    // than swallowed, so if that ever stops being true it is findable.
    console.error(`[notice:${opts?.tone ?? 'error'}]`, opts?.title ?? '', message)
  })
}

interface Item {
  id: number
  message: string
  tone: NoticeTone
  title?: string
}

const TONE: Record<NoticeTone, { icon: typeof AlertTriangle; classes: string; iconClass: string }> = {
  error: { icon: AlertTriangle, classes: 'border-danger/40 bg-danger-tint', iconClass: 'text-danger' },
  success: { icon: CheckCircle2, classes: 'border-success/40 bg-success-tint', iconClass: 'text-success' },
  info: { icon: Info, classes: 'border-line bg-panel', iconClass: 'text-muted-fg' },
}

/** How long a confirmation stays. An ERROR never times out - see below. */
const DISMISS_MS = 6000

export function NoticeProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([])
  const nextId = useRef(1)
  // Cleared on unmount so a timer cannot fire into a gone component.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    const pending = timers.current
    return () => { for (const t of pending) clearTimeout(t) }
  }, [])

  const dismiss = useCallback((id: number) => {
    setItems(list => list.filter(i => i.id !== id))
  }, [])

  const notify = useCallback<Notify>((message, opts) => {
    const tone = opts?.tone ?? 'error'
    const id = nextId.current++
    setItems(list => [
      // Three at a time. A stack taller than that is covering the thing the
      // user is being asked to fix.
      ...list.slice(-2),
      { id, message: String(message ?? ''), tone, title: opts?.title },
    ])
    // An ERROR stays until it is dismissed. A message that names what is wrong
    // with a field, and then removes itself while the user is still reading the
    // field, is the quiet failure this whole component exists to end.
    if (tone !== 'error') {
      timers.current.push(setTimeout(() => dismiss(id), DISMISS_MS))
    }
  }, [dismiss])

  return (
    <NoticeContext.Provider value={notify}>
      {children}
      {items.length > 0 && (
        <div className="notice-dock" aria-live="polite">
          {items.map(item => {
            const { icon: Icon, classes, iconClass } = TONE[item.tone]
            return (
              <div
                key={item.id}
                role={item.tone === 'error' ? 'alert' : 'status'}
                className={cn(
                  'pointer-events-auto mt-2 flex w-full max-w-md items-start gap-2.5 rounded-2xl border px-4 py-3 shadow-lg lg:rounded-xl',
                  classes,
                )}
              >
                <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', iconClass)} />
                <div className="min-w-0 flex-1">
                  {item.title && <p className="text-sm font-semibold text-ink">{item.title}</p>}
                  <p className="break-words text-sm text-ink-soft">{item.message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  aria-label="Dismiss"
                  className="-m-1 shrink-0 rounded-lg p-1 text-faint hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </NoticeContext.Provider>
  )
}
