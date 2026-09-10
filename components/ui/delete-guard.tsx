'use client'

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react'
import { autoFocusOnDesktop } from '@/lib/auto-focus'
import { createClient } from '@/lib/supabase/client'
import { AlertTriangle, Loader2, X, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface GuardOptions {
  /** What is being deleted, e.g. "this quote" - shown in the prompt. */
  label?: string
  /** Set true for money/files etc. so the secret key is required when protection is on. */
  protected?: boolean
  /**
   * Copy overrides, for the handful of confirmations that are NOT deletes.
   *
   * Disconnecting QuickBooks and accepting a scanned inspection result both
   * needed a blocking question and both reached for `window.confirm`, which is
   * the native dialog this component exists to replace. Rather than leave two
   * exceptions, the dialog can say something other than "delete".
   */
  title?: string
  body?: ReactNode
  confirmLabel?: string
}

type Ctx = (onConfirm: () => void | Promise<void>, opts?: GuardOptions) => void
const DeleteGuardContext = createContext<Ctx | null>(null)

export function useDeleteGuard(): Ctx {
  const ctx = useContext(DeleteGuardContext)
  // NO `window.confirm` FALLBACK. It would make this file the one place still
  // allowed to open a blocking native dialog - and in the Capacitor shell one
  // that fails to present takes the whole page with it, which is exactly what
  // happened to Delete in the Directory. The provider is mounted at the ROOT
  // layout and pinned there, so the no-provider branch cannot happen.
  return ctx ?? (onConfirm => {
    console.error('[delete-guard] used outside the provider; acting without confirmation')
    void onConfirm()
  })
}

export function DeleteGuardProvider({ children }: { children: ReactNode }) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('this item')
  const [copy, setCopy] = useState<{ title?: string; body?: ReactNode; confirmLabel?: string }>({})
  const [needsKey, setNeedsKey] = useState(false)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef<(() => void | Promise<void>) | null>(null)
  // Cache protection state for the session after first lookup.
  const protectionOn = useRef<boolean | null>(null)

  async function token() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  const request = useCallback<Ctx>((onConfirm, opts) => {
    pending.current = onConfirm
    setLabel(opts?.label ?? 'this item')
    setCopy({ title: opts?.title, body: opts?.body, confirmLabel: opts?.confirmLabel })
    setError(''); setKey('')
    // Decide whether to ask for the key. Only "protected" deletes can require it.
    ;(async () => {
      let needKey = false
      if (opts?.protected) {
        if (protectionOn.current === null) {
          try {
            const res = await fetch('/api/settings', { headers: { Authorization: `Bearer ${await token()}` } })
            if (res.ok) protectionOn.current = !!(await res.json()).deleteProtection?.enabled
            else protectionOn.current = false
          } catch { protectionOn.current = false }
        }
        needKey = protectionOn.current === true
      }
      setNeedsKey(needKey)
      setOpen(true)
    })()
  }, [])

  async function submit() {
    setBusy(true); setError('')
    try {
      if (needsKey) {
        const res = await fetch('/api/settings/verify-delete-key', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
          body: JSON.stringify({ key }),
        })
        const ok = res.ok && (await res.json()).ok
        if (!ok) { setError('Incorrect key.'); setBusy(false); return }
      }
      const fn = pending.current
      pending.current = null
      setOpen(false)
      await fn?.()
    } finally { setBusy(false) }
  }

  return (
    <DeleteGuardContext.Provider value={request}>
      {children}
      {open && (
        <div className="overlay z-[60] items-center justify-center bg-black/50" data-overlay onClick={() => !busy && setOpen(false)}>
          <div className="w-full max-w-sm rounded-xl bg-panel border border-line shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-line-soft flex items-center justify-between">
              <h2 className="font-semibold text-ink flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-danger" /> {copy.title ?? 'Confirm delete'}</h2>
              <button onClick={() => !busy && setOpen(false)} className="text-faint hover:text-ink"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-muted-fg">
                {copy.body ?? <>Are you sure you want to delete <span className="font-medium text-ink-soft">{label}</span>? This can&apos;t be undone.</>}
              </p>
              {needsKey && (
                <div className="space-y-1.5">
                  <label className="text-sm text-ink-soft flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 text-faint" /> Enter the secret delete key</label>
                  <input type="password" autoFocus={autoFocusOnDesktop()} value={key} onChange={e => setKey(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && key) submit() }}
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none" />
                  {error && <p className="text-xs text-danger">{error}</p>}
                </div>
              )}
              <div className="row-even lg:flex justify-end gap-2 pt-1">
                <Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
                <Button disabled={busy || (needsKey && !key)} onClick={submit} className="bg-danger-solid text-white hover:bg-danger-solid/90">
                  {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Working…</> : (copy.confirmLabel ?? 'Delete')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DeleteGuardContext.Provider>
  )
}
