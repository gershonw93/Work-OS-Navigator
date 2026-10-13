'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bot, Check, Copy, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useNotice } from '@/components/ui/notice'
import { useDeleteGuard } from '@/components/ui/delete-guard'
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
        body: JSON.stringify({ name }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { notice(body.error ?? 'Could not create the connection.'); return }
      setFresh({ token: body.token, name: body.connection?.name ?? name.trim(), id: body.connection?.id ?? null })
      setName('')
      await load()
    } catch {
      notice('Could not reach SyteNav. Check your connection and try again.')
    } finally {
      setCreating(false)
    }
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

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="shrink-0 rounded-lg border border-line-soft bg-surface p-2">
            <Bot className="h-5 w-5 text-muted-fg" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-ink">Claude</p>
            <p className="text-sm text-muted-fg">
              Let Claude Desktop or Claude Code read your jobs - projects, tasks, schedule, inspections,
              bills and client invoices - with your permissions. Claude can only read for now; it cannot change anything in SyteNav.
            </p>
          </div>
        </div>

        {state === 'loading' ? (
          <p className="text-sm text-faint">Checking…</p>
        ) : state === 'failed' ? (
          <p className="text-sm text-muted-fg">Could not load your Claude connections. Reload to try again.</p>
        ) : unavailable ? (
          <p className="text-sm text-muted-fg">{unavailable}</p>
        ) : (
          <>
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

            {connections.length > 0 && (
              <div className="divide-y divide-line-soft rounded-xl border border-line">
                {connections.map(c => (
                  <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{c.name}</p>
                      <p className="text-xs text-muted-fg">
                        <span className="font-mono">{c.token_prefix}…</span>
                        {' · '}
                        {c.last_used_at
                          ? <span title={absoluteTime(c.last_used_at)}>last used {timeAgo(c.last_used_at)}</span>
                          : 'never used'}
                      </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => revoke(c)}>Revoke</Button>
                  </div>
                ))}
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
            </form>
          </>
        )}
      </CardContent>
    </Card>
  )
}
