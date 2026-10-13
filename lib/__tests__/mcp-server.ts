// The SyteNav MCP server (/api/mcp) - how Claude reads a person's jobs.
//
// What must hold, and why each is here:
//   - Every gate is in the DISPATCHER, so a tool cannot be added that forgets
//     one: the permission it names, the role, and the job.
//   - A project id from a model is checked against the jobs the person's
//     company owns, and a foreign id is refused in the same words as a made-up
//     one, so the answer leaks nothing.
//   - A failed read is an error, never `[]` - a model repeats "there are none"
//     to a person as fact.
//   - PHASE 1 IS READ ONLY, by construction: every tool says so in its
//     annotations, no tool body writes, and a personal token works on this
//     route and nowhere else.

import { handleRpc, PROTOCOL_VERSIONS, RPC, type RpcContext } from '../mcp/protocol'
import { TOOLS, callTool, actorProblem, ROW_LIMIT } from '../mcp/tools'
import { newMcpToken, isMcpToken, hashMcpToken, mcpTokenPrefix, MCP_TOKEN_PREFIX } from '../mcp-token'
import { mcpTokenNameProblem } from '../mcp-token-name'
import { RESOURCES, getEffectivePermissions, getRoleDefaults } from '../permissions'
import type { ActorPerms } from '../server-permissions'
import { ok, done, code, walk } from './_helpers'

async function main() {
  // ── the protocol ──────────────────────────────────────────────────────────
  const ctx: RpcContext = {
    tools: TOOLS.map(({ name, title, description, inputSchema }) => ({ name, title, description, inputSchema })),
    callTool: async (name) => {
      if (name === 'list_projects') return { data: [{ id: 'p1' }] }
      if (name === 'get_project') throw new Error('boom: secret detail')
      return { error: 'You may not.' }
    },
  }

  const init: any = await handleRpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, ctx)
  ok(init?.result?.protocolVersion === '2025-06-18', 'initialize: a version we speak is echoed back')
  ok(init?.result?.capabilities?.tools !== undefined, '...and the server says it has tools')
  const initOld: any = await handleRpc({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } }, ctx)
  ok(initOld?.result?.protocolVersion === PROTOCOL_VERSIONS[0], 'initialize: an unknown version gets our newest, not an error')

  ok(await handleRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx) === null,
    'a notification gets NO reply (the route answers 202)')
  ok(await handleRpc({ jsonrpc: '2.0', id: 3, result: {} }, ctx) === null,
    'a response the client sent us gets no reply either')

  const ping: any = await handleRpc({ jsonrpc: '2.0', id: 4, method: 'ping' }, ctx)
  ok(ping?.id === 4 && ping?.result && !ping.error, 'ping answers')

  const batch: any = await handleRpc([{ jsonrpc: '2.0', id: 5, method: 'ping' }], ctx)
  ok(batch?.error?.code === RPC.INVALID_REQUEST, 'a batch is refused as an invalid request, not half-answered')

  const nope: any = await handleRpc({ jsonrpc: '2.0', id: 6, method: 'resources/list' }, ctx)
  ok(nope?.error?.code === RPC.METHOD_NOT_FOUND, 'an unsupported method is METHOD_NOT_FOUND')

  const list: any = await handleRpc({ jsonrpc: '2.0', id: 7, method: 'tools/list' }, ctx)
  const listed = list?.result?.tools ?? []
  ok(listed.length === TOOLS.length && listed.length >= 7, `tools/list lists every tool (${listed.length})`)
  ok(listed.every((t: any) => t.annotations?.readOnlyHint === true && t.annotations?.destructiveHint === false),
    'READ ONLY: every listed tool carries readOnlyHint true and destructiveHint false')
  ok(listed.every((t: any) => t.inputSchema?.type === 'object'), 'every tool has an object input schema')

  const unknown: any = await handleRpc({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'delete_everything' } }, ctx)
  ok(unknown?.error?.code === RPC.INVALID_PARAMS, 'calling a tool that does not exist is INVALID_PARAMS')

  const good: any = await handleRpc({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'list_projects', arguments: {} } }, ctx)
  ok(good?.result?.isError !== true && JSON.parse(good?.result?.content?.[0]?.text ?? 'null')?.[0]?.id === 'p1',
    'a tool result is returned as text Claude can read')
  ok(good?.result?.structuredContent?.items?.[0]?.id === 'p1', '...and a bare list is wrapped, since structuredContent must be an object')

  const refused: any = await handleRpc({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'list_tasks', arguments: {} } }, ctx)
  ok(refused?.result?.isError === true && refused.result.content[0].text === 'You may not.',
    "a tool's refusal is a RESULT with isError, so the model reads the sentence and tells the person")

  const threw: any = await handleRpc({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'get_project', arguments: { project_id: 'x' } } }, ctx)
  ok(threw?.result?.isError === true && !/boom|secret/.test(threw.result.content[0].text),
    'a tool that THREW answers with a plain sentence, never the exception text')

  // ── the token ─────────────────────────────────────────────────────────────
  const t = newMcpToken()
  ok(t.startsWith(MCP_TOKEN_PREFIX) && isMcpToken(t), 'a new token carries the snv_ prefix the route routes on')
  ok(t !== newMcpToken(), 'two tokens are never the same')
  ok(!isMcpToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.x'), 'a Supabase session token (a JWT) is NOT taken for one')
  ok(!isMcpToken('snv_'), 'a bare prefix is not a token')
  ok(/^[0-9a-f]{64}$/.test(hashMcpToken(t)) && hashMcpToken(t) === hashMcpToken(t), 'the stored hash is a stable SHA-256')
  ok(!hashMcpToken(t).includes(t.slice(4, 20)), '...which does not contain the token')
  ok(mcpTokenPrefix(t).length < 16 && t.startsWith(mcpTokenPrefix(t)), 'the prefix shown on screen is a short head of the token, not the token')
  ok(mcpTokenNameProblem('') !== null && mcpTokenNameProblem('   ') !== null, 'a connection needs a name')
  ok(mcpTokenNameProblem('x'.repeat(61)) !== null && mcpTokenNameProblem('Office PC') === null, '...of a sane length')

  // ── the dispatcher's gates, against a fake database ───────────────────────
  //
  // Records every table touched. A gate that refuses has to refuse BEFORE the
  // tool body reads anything, so "no query ran" is the assertion, not just the
  // sentence that came back.
  type Result = { data: any; error: any }
  function fakeDb(results: Record<string, Result>) {
    const touched: string[] = []
    const db: any = {
      from(table: string) {
        touched.push(table)
        const res = results[table] ?? { data: [], error: null }
        const chain: any = new Proxy({}, {
          get(_t, prop) {
            if (prop === 'then') return (resolve: any) => resolve(res)
            if (prop === 'maybeSingle' || prop === 'single') {
              return () => Promise.resolve({ data: Array.isArray(res.data) ? res.data[0] ?? null : res.data, error: res.error })
            }
            return () => chain
          },
        })
        return chain
      },
    }
    return { db, touched }
  }

  const actor = (role: string, companyId: string | null = 'c1', overrides: any = null): ActorPerms => ({
    userId: 'u1', role, companyId, permissions: getEffectivePermissions(role, overrides, getRoleDefaults(role)),
  })
  const PROJECTS = { data: [{ id: 'p1', name: 'Henderson' }, { id: 'p2', name: 'Lot 14' }], error: null }

  {
    const { db, touched } = fakeDb({ projects: PROJECTS })
    const out: any = await callTool(db, actor('worker'), 'list_tasks', {})
    ok('error' in out && touched.length === 0,
      'an ASSIGNED-ONLY role is refused with a sentence, before anything is read (not handed a wider view)')
  }
  {
    const { db, touched } = fakeDb({ projects: PROJECTS })
    const out: any = await callTool(db, actor('admin', null), 'list_projects', {})
    ok('error' in out && touched.length === 0, 'an account with no company is refused before anything is read')
  }
  {
    // A project manager is deliberately denied `payments` by default? Use an
    // override to be sure of the fact under test rather than of a default.
    const denied = actor('admin', 'c1', { payments: { view: false, create: false, edit: false, delete: false } })
    const { db, touched } = fakeDb({ projects: PROJECTS })
    const out: any = await callTool(db, denied, 'list_client_invoices', {})
    ok('error' in out && /permission/i.test(out.error) && touched.length === 0,
      'THE PERMISSION THE TOOL NAMES is asked first: no `payments` view, no client invoices, nothing read')
  }
  {
    const { db, touched } = fakeDb({ projects: PROJECTS })
    const out: any = await callTool(db, actor('admin'), 'get_schedule', { project_id: 'someone-elses' })
    ok('error' in out && !touched.includes('schedule_items'),
      "A JOB THAT IS NOT THEIRS: an id outside the company's projects is refused and the schedule is never read")
    const out2: any = await callTool(db, actor('admin'), 'get_schedule', { project_id: 'made-up' })
    ok('error' in out && 'error' in out2 && out.error === out2.error,
      "...in the same words as an id that never existed, so the answer leaks nothing")
  }
  {
    const { db, touched } = fakeDb({ projects: PROJECTS })
    const out: any = await callTool(db, actor('admin'), 'get_schedule', {})
    ok('error' in out && /project_id/.test(out.error) && !touched.includes('schedule_items'), 'a tool that needs a job says so when given none')
  }
  {
    const { db } = fakeDb({ projects: PROJECTS, project_tasks: { data: null, error: { message: 'column x does not exist' } } })
    const out: any = await callTool(db, actor('admin'), 'list_tasks', {})
    ok('error' in out && !/column/.test(out.error),
      'A FAILED READ IS AN ERROR, never an empty list - and the Postgres text stays in the log')
  }
  {
    const { db } = fakeDb({ projects: { data: null, error: { message: 'down' } } })
    const out: any = await callTool(db, actor('admin'), 'list_tasks', {})
    ok('error' in out, '...and the same when the list of jobs itself could not be read')
  }
  {
    const { db } = fakeDb({
      projects: PROJECTS,
      schedule_items: { data: [{ id: 's1', label: 'Framing', trade: null, start_date: '2026-10-01', end_date: '2026-10-09', progress_pct: '80.00', subcontracts: { scope: 'Frame it', trade: 'Framing', companies: { name: 'QA Framing', type: 'subcontractor' } } }], error: null },
    })
    const out: any = await callTool(db, actor('admin'), 'get_schedule', { project_id: 'p1' })
    const line = out.data?.schedule?.[0]
    ok(line?.percent_complete === 80, 'NUMERIC comes back as "80.00" and leaves as 80, never the string')
    ok(line?.trade === 'Framing' && line?.subcontractor === 'QA Framing', "the trade and the sub come from the app's own readers")
  }
  {
    const { db } = fakeDb({
      projects: PROJECTS,
      inspections: { data: [
        { id: 'i1', project_id: 'p1', type: 'Framing', status: 'requested', requested_date: '2026-10-20', scheduled_date: null },
        { id: 'i2', project_id: 'p1', type: 'Footing', status: 'void', requested_date: null, scheduled_date: '2026-09-01' },
        { id: 'i3', project_id: 'p2', type: 'Final', status: 'passed', requested_date: null, scheduled_date: '2026-09-02' },
      ], error: null },
    })
    const out: any = await callTool(db, actor('admin'), 'list_inspections', {})
    const rows = out.data?.inspections ?? []
    ok(rows.length === 1 && rows[0].id === 'i1', 'open inspections only by default; a VOID one is never listed')
    ok(rows[0]?.date_label === 'Needed by' && rows[0]?.date === '2026-10-20',
      'a wished-for date is labelled "Needed by", never passed off as a booking')
    ok(rows[0]?.project === 'Henderson', 'each row names its job, for a question asked across every job')
  }
  {
    const many = Array.from({ length: ROW_LIMIT + 1 }, (_, i) => ({ id: `t${i}`, project_id: 'p1', title: 'x', status: 'todo' }))
    const { db } = fakeDb({ projects: PROJECTS, project_tasks: { data: many, error: null }, project_task_assignees: { data: [], error: null } })
    const out: any = await callTool(db, actor('admin'), 'list_tasks', {})
    ok(out.data?.tasks?.length === ROW_LIMIT && out.data?.truncated === true, 'a long list says it was CUT, rather than silently stopping')
  }
  {
    const { db } = fakeDb({
      projects: PROJECTS,
      project_tasks: { data: [{ id: 't1', project_id: 'p1', title: 'x', status: 'todo' }], error: null },
      project_task_assignees: { data: null, error: { message: 'refused' } },
    })
    const out: any = await callTool(db, actor('admin'), 'list_tasks', {})
    ok(out.data?.tasks?.[0]?.assigned_to === null, 'assignees that could not be read are null ("unknown"), never [] ("nobody")')
  }
  ok(actorProblem(actor('admin')) === null && actorProblem(actor('project_manager')) === null,
    'office roles can connect')

  // ── read only, by construction ────────────────────────────────────────────
  const keys = new Set(RESOURCES.map(r => r.key))
  for (const tool of TOOLS) ok(keys.has(tool.resource), `${tool.name} names a real permission (${tool.resource})`)

  const tools = code('lib/mcp/tools.ts')
  ok(tools.includes(".from('projects')"), '(the scan below can see queries in tools.ts)')
  ok(!/\.(insert|update|upsert|delete|rpc)\(/.test(tools), 'NO TOOL WRITES: tools.ts contains no insert, update, upsert, delete or rpc')
  ok(/const action = write \? \(tool as WriteToolDef\)\.action : 'view'/.test(tools) && /actorCan\(actor, tool\.resource, action\)/.test(tools),
    'the dispatcher asks the permission each tool names - view to read, the tool\'s own action to add')
  ok(/ownedProjectsFilter\(actor\.companyId/.test(tools), 'the jobs come from the same filter as the Projects list')

  // A personal token must work on /api/mcp and nowhere else - every other
  // route resolves the caller through getActor, which never looks one up.
  ok(!/isMcpToken|mcp_tokens/.test(code('lib/server-permissions.ts')),
    'getActor never resolves a personal token, so on every other route it is a 401')
  const readers = walk('app').concat(walk('lib'))
    .filter(f => !f.includes('__tests__'))
    .filter(f => /from\('mcp_tokens'\)/.test(code(f)))
    .sort()
  ok(JSON.stringify(readers) === JSON.stringify(['app/api/mcp/route.ts', 'app/api/settings/mcp-tokens/route.ts', 'lib/mcp/oauth-server.ts']),
    `only the MCP route, the token settings route and the Claude sign-in touch the token table (found: ${readers.join(', ')})`)
  const resolvers = walk('app').concat(walk('lib'))
    .filter(f => !f.includes('__tests__') && f !== 'lib/mcp-token.ts')
    .filter(f => /isMcpToken\(/.test(code(f)))
  ok(JSON.stringify(resolvers) === JSON.stringify(['app/api/mcp/route.ts']),
    `only /api/mcp accepts a personal token as a credential (found: ${resolvers.join(', ')})`)

  const route = code('app/api/mcp/route.ts')
  ok(/export const maxDuration = 60/.test(route) && /export const runtime = 'nodejs'/.test(route),
    'the route declares nodejs and a 60s budget, like every other long route')
  ok(/\.is\('revoked_at', null\)/.test(route), 'a revoked token is refused')

  const card = code('components/settings/claude-connector-card.tsx')
  ok(!/from '@\/lib\/mcp-token'/.test(card), "the Settings card does not import the token module (its crypto must not reach a browser)")
  ok(/mcpTokenNameProblem/.test(card) && /mcpTokenNameProblem/.test(code('app/api/settings/mcp-tokens/route.ts')),
    'the form and the route ask the same name check')
  ok(!/\bconfirm\(|\balert\(/.test(card), 'no native confirm/alert on the card')
  ok(/const isOpen = open \?\? !connected/.test(card),
    'the card FOLDS once connected and starts open when not - the setup steps are noise on every later visit')
  ok(/variant="success"[^>]*>[\s\S]{0,120}Connected<\/Badge>/.test(card), '...and a connected card says so in green')
  ok(/aria-expanded=\{isOpen\}/.test(card), 'the fold is a real button a screen reader can read the state of')

  done()
}

main()
