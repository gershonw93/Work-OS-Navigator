// ─────────────────────────────────────────────────────────────────────────────
// The MCP wire protocol, the small part of it SyteNav speaks.
//
// MCP is JSON-RPC 2.0. Over "streamable HTTP" a client POSTs one message and
// the server may answer with plain `application/json` - no stream, no session -
// which is all a read-only server needs and all a serverless function can do
// well. So this is a pure function from one message to one reply (or to
// nothing, for a notification), testable without a server, and the route is
// the thin part.
//
// WHY NOT THE SDK: the official SDK's HTTP transport wants a Node request and
// response pair and a session map; a Next route handler has neither, and the
// adapter that bridges them is a second dependency for four methods. If the
// server grows streaming or server-initiated requests, that is the time to
// swap this file for the SDK - nothing outside it knows the difference.
// ─────────────────────────────────────────────────────────────────────────────

/** Newest first. A client asking for one of these gets it back; anything else gets the first. */
export const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'] as const

export const SERVER_INFO = { name: 'sytenav', title: 'SyteNav', version: '1.0.0' } as const

export const INSTRUCTIONS =
  'SyteNav is construction project management for general contractors. These tools READ the ' +
  'signed-in person\'s jobs with exactly their permissions in the app: projects, tasks, schedule, ' +
  'inspections, bills from subcontractors and invoices to clients. Nothing here can change ' +
  'SyteNav on this connection. Start with list_projects to get project ids. Dates are YYYY-MM-DD; amounts are ' +
  'US dollars. When a tool says a permission is missing, tell the person - do not guess the data.'

/**
 * The instructions for a connection the person ALLOWED to add records. Said
 * up front, because the model decides how careful to be before it calls
 * anything: confirm first, bills wait for approval, and money received is not
 * something it can record.
 */
export const WRITE_INSTRUCTIONS =
  'SyteNav is construction project management for general contractors. These tools read the ' +
  'signed-in person\'s jobs with exactly their permissions in the app, and this connection may also ADD ' +
  'and EDIT records across the app - tasks, schedule, budget, subcontracts, bills from subs, client ' +
  'invoices and payment requests (as drafts), daily logs, inspections, permits, RFIs, submittals, ' +
  'selections, change orders, compliance, materials, equipment, customers and Directory contacts - using ' +
  'these tools rather than a browser. Nothing can be deleted. Payments cannot be recorded. Nothing is ' +
  'sent or emailed to anyone outside the company: client-facing records are created as drafts for a ' +
  'person to send. A bill is created waiting for approval - nothing reaches QuickBooks until a person ' +
  'approves it in SyteNav. ' +
  'Before creating or changing anything, show the person exactly what you will enter and wait for them ' +
  'to say yes. Check the matching list_ tool first so you do not enter something twice. ' +
  'WHEN THE PERSON GIVES YOU A DOCUMENT (a PDF or photo): read it, decide what it is (a sub\'s bill, an ' +
  'insurance certificate or W-9 or license, a permit, a quote, a store receipt, a change order, plans, or ' +
  'something else), which job it belongs to and whose it is, and file it with the matching tool - ' +
  'document_destinations lists them. If ANY of those three is not certain, ask one short question ' +
  'instead of guessing. If you cannot attach the file itself, create the record and give the person the ' +
  'attach_url the tool returns so they can drop the original on it. ' +
  'Start with list_projects to get project ids. Dates are YYYY-MM-DD; amounts are US dollars. When a ' +
  'tool says a permission is missing, tell the person - do not guess.'

export const RPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const

export type JsonSchema = Record<string, unknown>

/** A tool, as `tools/list` describes it. */
export interface ToolSpec {
  name: string
  title: string
  description: string
  inputSchema: JsonSchema
  /** True for a tool that adds a record. Decides the annotations below. */
  write?: boolean
}

/** What a tool call produced: data for Claude to read, or a sentence about why not. */
export type ToolOutcome = { data: unknown } | { error: string }

export interface RpcContext {
  tools: ToolSpec[]
  /** Which instructions this connection gets - read-only unless the person allowed adding. */
  instructions?: string
  callTool: (name: string, args: Record<string, unknown>) => Promise<ToolOutcome>
}

type Id = string | number | null

export interface RpcResponse {
  jsonrpc: '2.0'
  id: Id
  result?: unknown
  error?: { code: number; message: string }
}

const reply = (id: Id, result: unknown): RpcResponse => ({ jsonrpc: '2.0', id, result })
export const rpcError = (id: Id, code: number, message: string): RpcResponse =>
  ({ jsonrpc: '2.0', id, error: { code, message } })

export function negotiateVersion(requested: unknown): string {
  return (PROTOCOL_VERSIONS as readonly string[]).includes(requested as string)
    ? (requested as string)
    : PROTOCOL_VERSIONS[0]
}

/**
 * What each tool may do, declared, because a client decides how much to ask
 * the person before calling a tool from these hints - and declared ON EVERY
 * TOOL by construction, from its `write` flag, so one cannot be added without
 * it. A write tool only ever ADDS (destructiveHint false), and is not
 * idempotent: calling it twice would make two records were it not for the
 * server's own duplicate guard.
 */
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
const ADDS = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }

/**
 * One message in, one reply out - or null for a notification, which the
 * route answers with 202 and no body.
 */
export async function handleRpc(message: unknown, ctx: RpcContext): Promise<RpcResponse | null> {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return rpcError(null, RPC.INVALID_REQUEST, 'Send one JSON-RPC message per request.')
  }
  const m = message as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown }
  const hasId = 'id' in m && (typeof m.id === 'string' || typeof m.id === 'number')
  const id: Id = hasId ? (m.id as string | number) : null

  if (m.jsonrpc !== '2.0' || typeof m.method !== 'string') {
    // A response the client sent us (it has no method) needs nothing back.
    if (m.jsonrpc === '2.0' && hasId && !('method' in m)) return null
    return rpcError(id, RPC.INVALID_REQUEST, 'Not a JSON-RPC 2.0 request.')
  }

  // A notification has no id and gets no reply - initialized, cancelled, etc.
  if (!hasId) return null

  const params = (m.params && typeof m.params === 'object' ? m.params : {}) as Record<string, unknown>

  switch (m.method) {
    case 'initialize':
      return reply(id, {
        protocolVersion: negotiateVersion(params.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: ctx.instructions ?? INSTRUCTIONS,
      })

    case 'ping':
      return reply(id, {})

    case 'tools/list':
      return reply(id, {
        tools: ctx.tools.map(({ write, ...t }) => ({ ...t, annotations: { title: t.title, ...(write ? ADDS : READ_ONLY) } })),
      })

    case 'tools/call': {
      const name = params.name
      if (typeof name !== 'string' || !ctx.tools.some(t => t.name === name)) {
        return rpcError(id, RPC.INVALID_PARAMS, `Unknown tool: ${String(name)}`)
      }
      const args = (params.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments)
        ? params.arguments : {}) as Record<string, unknown>
      let outcome: ToolOutcome
      try {
        outcome = await ctx.callTool(name, args)
      } catch (e) {
        // A tool that threw is a failure to answer, not an answer. Logged for
        // us; the sentence for Claude says so rather than passing a stack on.
        console.error(`[mcp] ${name} threw:`, e instanceof Error ? e.message : e)
        outcome = { error: 'SyteNav could not answer that just now. Try again in a moment.' }
      }
      // A tool's own refusal is a RESULT with isError, not a protocol error:
      // that is how the model gets to read it and tell the person.
      if ('error' in outcome) {
        return reply(id, { content: [{ type: 'text', text: outcome.error }], isError: true })
      }
      return reply(id, {
        content: [{ type: 'text', text: JSON.stringify(outcome.data, null, 2) }],
        structuredContent: wrapStructured(outcome.data),
      })
    }

    default:
      return rpcError(id, RPC.METHOD_NOT_FOUND, `Method not supported: ${m.method}`)
  }
}

/** `structuredContent` must be an object; a bare list goes under `items`. */
function wrapStructured(data: unknown): Record<string, unknown> {
  if (data && typeof data === 'object' && !Array.isArray(data)) return data as Record<string, unknown>
  return { items: data }
}
