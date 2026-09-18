'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Contact, Loader2, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/dates'

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE CONTACTS, ON THE INTEGRATIONS TAB.
//
// WHY IT EXISTS: "i pressed connect, i selected my google account, it took me
// then to integrations is the settings but there only qb there not google
// contacts". The connection had worked perfectly - the row was written, with a
// refresh token - and the page it returned to said nothing about Google at all,
// because the only UI was on Directory -> Imported contacts.
//
// Two things were wrong and this fixes the second: the return trip now lands on
// the staging area, AND Integrations lists Google, because that is where
// somebody looks for an integration whatever we think the feature's home is.
// ─────────────────────────────────────────────────────────────────────────────

interface Status {
  configured: boolean
  connected: boolean
  status: string | null
  googleEmail: string | null
  lastSyncAt: string | null
  staged: number
}

export function GoogleContactsCard() {
  const [status, setStatus] = useState<Status | null>(null)
  // Loading and failed are different facts, and neither of them is
  // "not connected".
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await createClient().auth.getSession()
      const res = await fetch('/api/google-contacts/status', {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      })
      if (!res.ok) { setState('failed'); return }
      setStatus(await res.json())
      setState('ready')
    } catch { setState('failed') }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="shrink-0 rounded-lg border border-line-soft bg-surface p-2">
              <Contact className="h-5 w-5 text-muted-fg" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-ink">Google Contacts</p>
              {state === 'loading' ? (
                <p className="text-sm text-faint">Checking…</p>
              ) : state === 'failed' ? (
                <p className="text-sm text-muted-fg">Could not check this connection.</p>
              ) : !status?.configured ? (
                <p className="text-sm text-muted-fg">
                  Not set up on this server yet.
                </p>
              ) : status.connected ? (
                <p className="text-sm text-muted-fg">
                  {/* NAME THE ACCOUNT. "Connected" alone tells somebody with
                      three Google logins nothing. */}
                  {status.status === 'expired'
                    ? <>Connection expired{status.googleEmail ? ` (${status.googleEmail})` : ''} - reconnect to read contacts again.</>
                    : <>Connected as <span className="font-medium text-ink">{status.googleEmail ?? 'a Google account'}</span>
                        {status.lastSyncAt ? ` · last read ${formatDate(status.lastSyncAt)}` : ' · not read yet'}</>}
                </p>
              ) : (
                <p className="text-sm text-muted-fg">
                  Read your Google address book into a staging list, then pick who joins your Directory.
                </p>
              )}
            </div>
          </div>

          {/* The card does not connect or sync - those live on the page that
              shows the result. A second set of the same buttons in two places
              is two things to keep in step. */}
          <Link href="/directory/imported" className="shrink-0">
            <Button variant={status?.connected ? 'outline' : 'default'} className="w-full lg:w-auto">
              {state === 'loading'
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Loading</>
                : status?.connected
                  ? <>{status.staged > 0 ? `Review ${status.staged} contact${status.staged === 1 ? '' : 's'}` : 'Open imported contacts'} <ExternalLink className="h-4 w-4" /></>
                  : <>Set up Google Contacts <ExternalLink className="h-4 w-4" /></>}
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
