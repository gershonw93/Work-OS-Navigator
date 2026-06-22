import { createClient } from '@/lib/supabase/client'

// Authenticated GET for admin pages — attaches the current session's bearer token.
export async function adminGet<T>(path: string): Promise<T | null> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const res = await fetch(path, { headers: { Authorization: `Bearer ${session.access_token}` } })
  if (!res.ok) return null
  return res.json() as Promise<T>
}
