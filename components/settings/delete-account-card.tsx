'use client'

import { useCallback, useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { useNotice } from '@/components/ui/notice'
import { useDeleteGuard } from '@/components/ui/delete-guard'
import { fetchProblem } from '@/lib/fetch-error'
import { formatDate } from '@/lib/dates'
import { deletionPromise, type DeletionScope } from '@/lib/account-deletion'

// ─────────────────────────────────────────────────────────────────────────────
// "Delete my account" - and, in the Danger Zone, "Delete company account".
//
// ONE control for the three doors: Settings > Profile (everybody), the Danger
// Zone (the whole company, admins), and Me in Field Mode (a worker never sees
// Settings). Apple requires that anybody can START deleting their account in
// the app; the old button called a route that did not exist, so it failed
// every time and non-admins had no control at all.
//
// IT SAYS REQUEST BECAUSE IT IS ONE. We carry deletion out by hand within the
// promised window, and the confirmation, the success message and the email all
// read `deletionPromise`, so the screen cannot promise more than we do.
// ─────────────────────────────────────────────────────────────────────────────

async function authHeaders() {
  const { data: { session } } = await createClient().auth.getSession()
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` }
}

export function DeleteAccountCard({ scope, companyName }: { scope: DeletionScope; companyName?: string | null }) {
  const notify = useNotice()
  const guard = useDeleteGuard()
  // Loading, failed and "none" are three facts. The button is only offered
  // once we KNOW there is no open request, or a double press on a slow phone
  // looks like two requests.
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [requestedAt, setRequestedAt] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/account/deletion-request', { headers: await authHeaders() })
      if (!res.ok) { setState('failed'); return }
      const open = ((await res.json()).requests ?? []).find((r: { scope: string }) => r.scope === scope)
      setRequestedAt(open?.created_at ?? null)
      setState('ready')
    } catch { setState('failed') }
  }, [scope])

  useEffect(() => { load() }, [load])

  const isCompany = scope === 'company'
  const title = isCompany ? 'Delete company account' : 'Delete my account'

  function ask() {
    guard(async () => {
      setSending(true)
      try {
        const res = await fetch('/api/account/deletion-request', {
          method: 'POST', headers: await authHeaders(), body: JSON.stringify({ scope }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) { notify(body?.error ?? 'Could not send your request.'); return }
        setRequestedAt(body.requestedAt ?? new Date().toISOString())
        notify(
          body.already
            ? 'You have already asked - we are on it.'
            : body.confirmationSent === false
              ? 'Request received. We could not email you a confirmation, but it is recorded.'
              : 'Request received. We have emailed you a confirmation.',
          { tone: 'success' },
        )
      } catch (e) {
        notify(fetchProblem(e, 'sending your request'))
      } finally {
        setSending(false)
      }
    }, {
      title: isCompany ? `Delete ${companyName || 'your company'}?` : 'Delete your account?',
      body: deletionPromise(scope),
      confirmLabel: isCompany ? 'Request company deletion' : 'Request deletion',
    })
  }

  return (
    <div className="rounded-2xl border border-danger/30 bg-danger-tint p-5 lg:rounded-lg">
      <p className="mb-1 font-medium text-ink">{title}</p>
      <p className="mb-4 text-sm text-muted-fg">{deletionPromise(scope)}</p>
      {state === 'loading' ? (
        <p className="text-sm text-faint">Checking for an earlier request…</p>
      ) : requestedAt ? (
        <p className="text-sm font-medium text-ink">
          Requested on {formatDate(requestedAt)}. We will email you when it is done.
        </p>
      ) : (
        <>
          {state === 'failed' && (
            <p className="mb-3 text-sm text-muted-fg">Could not check for an earlier request - you can still ask.</p>
          )}
          <Button variant="outline" className="border-danger/40 text-danger" onClick={ask} disabled={sending}>
            <Trash2 className="h-4 w-4" /> {sending ? 'Sending…' : title}
          </Button>
        </>
      )}
    </div>
  )
}
