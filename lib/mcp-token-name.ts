// Pure and browser-safe, so the form and the route ask one function.

/**
 * What a person typed as the token's name, or why not. Asked by the route;
 * the form uses the same function so the two cannot disagree.
 */
export function mcpTokenNameProblem(name: unknown): string | null {
  const n = typeof name === 'string' ? name.trim() : ''
  if (!n) return 'Give the connection a name, like "Claude Desktop - office".'
  if (n.length > 60) return 'Keep the name under 60 characters.'
  return null
}
