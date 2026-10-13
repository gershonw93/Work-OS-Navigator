'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bot, Check, ChevronDown, Copy, Eye, Loader2, PencilLine } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useNotice } from '@/components/ui/notice'
import { useDeleteGuard } from '@/components/ui/delete-guard'
import { RowMenu, MenuItem } from '@/components/ui/row-menu'
import { mcpTokenNameProblem } from '@/lib/mcp-token-name'
import { absoluteTime, timeAgo } from '@/lib/time-ago'

// ─────────────────────────────────────────────────────────────────────────────
// CLAUDE, ON THE INTEGRATIONS TAB.
//
// A personal token for the SyteNav MCP server (/api/mcp), so Claude Desktop or
// Claude Code can read this person's jobs - with this person's permissions and
// nothing more. Read only, for now; the card says so, because a connection
// that can "see your jobs" invites the question of what else it can do.
//
// THE TOKEN IS SHOWN ONCE. Only its hash is stored, so the screen says that in
// as many words BEFORE somebody closes it, and the setup lines are built with
// the token already in them - copying a command and then hunting for the
// token to paste into it is two chances to lose it.
// ─────────────────────────────────────────────────────────────────────────────

interface Connection {
  id: string
  name: string
  token_prefix: string
  created_at: string
  last_used_at: string | null
  /** Made by signing in from Claude, rather than a token pasted into a config file. */
  signed_in?: boolean
  /** The person allowed this connection to add records. Off unless they did. */
  can_write?: boolean
}

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await createClient().auth.getSession()
  return { Authorization: `Bearer ${session?.access_token ?? ''}` }
}

function serverUrl(): string {
  return typeof window === 'undefined' ? '/api/mcp' : `${window.location.origin}/api/mcp`
}

function claudeCodeCommand(token: string): string {
  return `claude mcp add --transport http sytenav ${serverUrl()} --header "Authorization: Bearer ${token}"`
}

function claudeDesktopConfig(token: string): string {
  // mcp-remote's documented shape: the header value comes from an env var, so
  // the space in "Bearer <token>" survives Windows argument quoting.
  return JSON.stringify({
    mcpServers: {
      sytenav: {
        command: 'npx',
        args: ['-y', 'mcp-remote', serverUrl(), '--header', 'Authorization:${SYTENAV_AUTH}'],
        env: { SYTENAV_AUTH: `Bearer ${token}` },
      },
    },
  }, null, 2)
}

function CopyBlock({ label, text }: { label: string; text: string }) {
  const notice = useNotice()
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      notice('Could not copy - select the text and copy it by hand.')
    }
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink-soft">{label}</p>
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-lg border border-line-soft bg-surface p-3 text-xs text-ink">{text}</pre>
    </div>
  )
}

export function ClaudeConnectorCard() {
  const notice = useNotice()
  const guard = useDeleteGuard()
  const [connections, setConnections] = useState<Connection[]>([])
  // Loading, failed and "none yet" are three different facts.
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [unavailable, setUnavailable] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  // Adding records is a separate consent, off by default - a box that starts
  // ticked is a claim the person never made.
  const [newCanWrite, setNewCanWrite] = useState(false)
  const [open, setOpen] = useState<boolean | null>(null)
  const [showToken, setShowToken] = useState(false)
  const [fresh, setFresh] = useState<{ token: string; name: string; id: string | null } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/mcp-tokens', { headers: await authHeader() })
      if (!res.ok) { setState('failed'); return }
      const body = await res.json()
      setConnections(body.tokens ?? [])
      setUnavailable(body.unavailable ?? null)
      setState('ready')
    } catch { setState('failed') }
  }, [])

  useEffect(() => { load() }, [load])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    const problem = mcpTokenNameProblem(name)
    if (problem) { setNameError(problem); return }
    setNameError(null)
    setCreating(true)
    try {
      const res = await fetch('/api/settings/mcp-tokens', {
        method: 'POST',
        headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, can_write: newCanWrite }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { notice(body.error ?? 'Could not create the connection.'); return }
      setFresh({ token: body.token, name: body.connection?.name ?? name.trim(), id: body.connection?.id ?? null })
      setName('')
      setNewCanWrite(false)
      await load()
    } catch {
      notice('Could not reach SyteNav. Check your connection and try again.')
    } finally {
      setCreating(false)
    }
  }

  async function setWrite(c: Connection, canWrite: boolean) {
    try {
      const res = await fetch('/api/settings/mcp-tokens', {
        method: 'PATCH',
        headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, can_write: canWrite }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { notice(body.error ?? 'Could not change that connection.'); return }
      notice(canWrite
        ? `"${c.name}" can now add records. It still asks you before each one.`
        : `"${c.name}" can only read now.`, { tone: 'success' })
      await load()
    } catch {
      notice('Could not reach SyteNav. Check your connection and try again.')
    }
  }

  function allowWrite(c: Connection) {
    guard(() => setWrite(c, true), {
      title: 'Let this connection add records?',
      body: <>Claude on <span className="font-medium text-ink">{c.name}</span> will be able to add tasks, bills from subs (waiting for approval), inspection requests, change orders and Directory contacts, as you. It cannot record payments, edit or delete anything.</>,
      confirmLabel: 'Allow adding',
    })
  }

  function revoke(c: Connection) {
    guard(async () => {
      const res = await fetch(`/api/settings/mcp-tokens?id=${encodeURIComponent(c.id)}`, {
        method: 'DELETE', headers: await authHeader(),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { notice(body.error ?? 'Could not revoke that connection.'); return }
      // A token revoked while its setup lines are still on screen must not stay
      // there looking usable.
      if (fresh?.id === c.id) setFresh(null)
      notice(`"${c.name}" can no longer read SyteNav.`, { tone: 'success' })
      await load()
    }, {
      title: 'Revoke this connection?',
      body: <>Claude on <span className="font-medium text-ink">{c.name}</span> will stop being able to read your jobs straight away. You can make a new connection any time.</>,
      confirmLabel: 'Revoke',
    })
  }

  // CONNECTED IS THE NORMAL STATE, SO IT IS THE SMALL ONE. Once somebody has
  // a connection the setup steps are noise on every visit: the card folds to
  // one row with a green "Connected" and opens on a tap. With no connection it
  // starts open, because the steps are the whole point of looking. `null`
  // means nobody has pressed the toggle yet, so the default can follow the
  // load instead of being decided before it.
  const connected = state === 'ready' && connections.length > 0
  const isOpen = open ?? !connected
  const lastUsed = connections.map(c => c.last_used_at).filter(Boolean).sort().pop() ?? null
  const canAdd = connections.some(c => c.can_write)

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className={connected
            ? 'shrink-0 rounded-lg border border-success/30 bg-success-tint p-2'
            : 'shrink-0 rounded-lg border border-line-soft bg-surface p-2'}>
            <Bot className={connected ? 'h-5 w-5 text-success' : 'h-5 w-5 text-muted-fg'} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-ink">Claude</p>
              {connected
                ? <Badge variant="success"><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-success-solid" aria-hidden /> Connected</Badge>
                : state === 'ready' && !unavailable && <Badge variant="muted">Not connected</Badge>}
            </div>
            {connected && !isOpen ? (
              <p className="truncate text-sm text-muted-fg">
                {connections.length === 1 ? '1 connection' : `${connections.length} connections`}
                {' · '}{canAdd ? 'can add records' : 'read only'}
                {lastUsed && <> · <span title={absoluteTime(lastUsed)}>last used {timeAgo(lastUsed)}</span></>}
              </p>
            ) : (
              <p className="text-sm text-muted-fg">
                Let Claude read your jobs - projects, tasks, schedule, inspections, bills and client
                invoices - with your permissions. If you allow it, it can also add tasks, bills from subs,
                inspection requests, change orders and contacts; it never records payments, edits or deletes.
              </p>
            )}
          </div>
          {state === 'ready' && !unavailable && (
            <Button
              type="button" variant="outline" size="sm" className="shrink-0"
              aria-expanded={isOpen}
              onClick={() => setOpen(!isOpen)}
            >
              {isOpen ? 'Hide' : 'Manage'}
              <ChevronDown className={isOpen ? 'h-4 w-4 rotate-180 transition-transform' : 'h-4 w-4 transition-transform'} />
            </Button>
          )}
        </div>

        {state === 'loading' ? (
          <p className="text-sm text-faint">Checking…</p>
        ) : state === 'failed' ? (
          <p className="text-sm text-muted-fg">Could not load your Claude connections. Reload to try again.</p>
        ) : unavailable ? (
          <p className="text-sm text-muted-fg">{unavailable}</p>
        ) : !isOpen ? null : (
          <>
            {/* THE EASY WAY FIRST. Adding SyteNav in Claude by its address
                signs in through SyteNav's own Allow page - no token, no config
                file, and it works in claude.ai and the Claude apps. The token
                below is for the cases that need one. */}
            <div className="space-y-2 rounded-xl border border-line bg-surface/50 p-3 sm:p-4">
              <p className="text-sm font-semibold text-ink">Add SyteNav in Claude</p>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft">
                <li>In Claude, open Settings, then Connectors, and choose Add custom connector.</li>
                <li>Name it SyteNav and paste this address.</li>
                <li>Press Connect, sign in to SyteNav if asked, and press Allow.</li>
              </ol>
              <CopyBlock label="Connector address" text={serverUrl()} />
            </div>

            {connections.length > 0 && (
              <div className="space-y-1.5">
              <p className="text-sm font-medium text-ink-soft">Your connections</p>
              <div className="divide-y divide-line-soft rounded-xl border border-line">
                {connections.map(c => (
                  <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{c.name}</p>
                      <p className="text-xs text-muted-fg">
                        {c.signed_in ? 'Signed in from Claude' : <span className="font-mono">{c.token_prefix}…</span>}
                        {' · '}
                        {c.last_used_at
                          ? <span title={absoluteTime(c.last_used_at)}>last used {timeAgo(c.last_used_at)}</span>
                          : 'never used'}
                        {' · '}
                        <span className={c.can_write ? 'font-medium text-ink' : undefined}>
                          {c.can_write ? 'Can add records' : 'Read only'}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button type="button" variant="outline" size="sm" onClick={() => revoke(c)}>Revoke</Button>
                      <RowMenu label={`More for ${c.name}`}>
                        {close => (
                          c.can_write
                            ? <MenuItem onClick={() => { close(); setWrite(c, false) }}><Eye className="h-3.5 w-3.5" /> Make read only</MenuItem>
                            : <MenuItem onClick={() => { close(); allowWrite(c) }}><PencilLine className="h-3.5 w-3.5" /> Let it add records</MenuItem>
                        )}
                      </RowMenu>
                    </div>
                  </div>
                ))}
              </div>
              </div>
            )}

            {/* The token is the rarer way in, so it stays folded until asked
                for - or until one has just been made and must be copied. */}
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded-lg py-1 text-left text-sm font-medium text-ink-soft hover:text-ink"
              aria-expanded={showToken || !!fresh}
              onClick={() => setShowToken(v => !v)}
            >
              Or use a token, for Claude Code or a Claude Desktop config file
              <ChevronDown className={showToken || fresh ? 'h-4 w-4 shrink-0 rotate-180 transition-transform' : 'h-4 w-4 shrink-0 transition-transform'} />
            </button>
            {(showToken || fresh) && (<>
            {fresh && (
              <div className="space-y-3 rounded-xl border border-line bg-surface/50 p-3 sm:p-4">
                <p className="text-sm text-ink">
                  <span className="font-semibold">Connection "{fresh.name}" is ready.</span>{' '}
                  Copy one of these now - the token is only shown this once. If you lose it, revoke it and make another.
                </p>
                <CopyBlock label="Claude Code - run in a terminal" text={claudeCodeCommand(fresh.token)} />
                <CopyBlock label="Claude Desktop - Settings, Developer, Edit Config, then restart Claude" text={claudeDesktopConfig(fresh.token)} />
                <div className="row-even lg:flex lg:flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => setFresh(null)}>I have copied it</Button>
                </div>
              </div>
            )}

            <form onSubmit={create} className="space-y-1.5" noValidate>
              <Label htmlFor="claude-connection-name">Connection name *</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="claude-connection-name"
                  value={name}
                  onChange={e => { setName(e.target.value); if (nameError) setNameError(null) }}
                  placeholder="Claude Desktop - office"
                  maxLength={60}
                  error={!!nameError}
                />
                <Button type="submit" disabled={creating} className="shrink-0">
                  {creating ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating</> : 'Connect Claude'}
                </Button>
              </div>
              {nameError
                ? <p className="text-sm text-danger">{nameError}</p>
                : <p className="text-xs text-muted-fg">Name it after the computer or app, so you can tell connections apart later.</p>}
              <label className="flex items-start gap-2 pt-1 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0 accent-accent"
                  checked={newCanWrite}
                  onChange={e => setNewCanWrite(e.target.checked)}
                />
                <span>Also let it add records (optional) - tasks, bills waiting for approval, inspection requests, change orders and contacts.</span>
              </label>
            </form>
            </>)}
          </>
        )}
      </CardContent>
    </Card>
  )
}
