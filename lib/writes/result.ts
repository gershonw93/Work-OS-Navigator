// What a shared create function hands back: the status and JSON body the app's
// route would answer with, so the route returns it as-is and the MCP server
// reads the same answer. One result shape for every file in lib/writes/.
export interface WriteResult {
  status: number
  body: Record<string, any>
}

/**
 * The name a record is attributed to. "Dana via Claude" when the MCP server
 * made it - the activity feed is where somebody looks to see who entered a
 * thing, and a bill Claude typed must not read as if Dana typed it herself.
 */
export function withVia(name: string, via?: string): string {
  return via ? `${name} via ${via}` : name
}
