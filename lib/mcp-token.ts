import { createHash, randomBytes } from 'crypto'

// ─────────────────────────────────────────────────────────────────────────────
// A personal token for the SyteNav MCP server - the credential Claude Desktop
// or Claude Code sends to /api/mcp.
//
// ONE PREFIX, AND IT IS THE WHOLE ROUTING RULE. A Supabase access token is a
// JWT (`eyJ...`); ours start `snv_`. `/api/mcp` asks `isMcpToken` and looks
// the hash up; EVERY OTHER ROUTE goes through `getActor`, which hands the
// string to the auth server, which refuses it. So a personal token reads
// through the MCP server and is a 401 everywhere else - that is what keeps
// phase 1 read-only by construction rather than by a list of routes somebody
// has to remember to keep current. Pinned in `mcp-server.ts`.
//
// ONLY THE HASH IS STORED. SHA-256 rather than a slow password hash on
// purpose: the input is 32 random bytes, not something a person chose, so
// there is nothing for a dictionary to find, and the lookup is an equality on
// a unique index - a salted hash could not be looked up at all.
// ─────────────────────────────────────────────────────────────────────────────

export const MCP_TOKEN_PREFIX = 'snv_'

/** How many characters of a token the screen shows to tell two apart. */
const SHOWN = 8

/** A person may keep this many live tokens - one per machine is the normal case. */
export const MAX_LIVE_TOKENS = 10

export function newMcpToken(): string {
  return MCP_TOKEN_PREFIX + randomBytes(32).toString('base64url')
}

export function isMcpToken(token: string | null | undefined): token is string {
  return typeof token === 'string' && token.startsWith(MCP_TOKEN_PREFIX) && token.length > MCP_TOKEN_PREFIX.length + 20
}

export function hashMcpToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** `snv_AbC1…` - enough to recognise, nowhere near enough to use. */
export function mcpTokenPrefix(token: string): string {
  return token.slice(0, MCP_TOKEN_PREFIX.length + SHOWN)
}

// The name check is `lib/mcp-token-name.ts`: the Settings form asks it too,
// and this file's `crypto` import must not reach a browser bundle.
export { mcpTokenNameProblem } from './mcp-token-name'
