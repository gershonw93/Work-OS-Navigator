import type { SupabaseClient } from '@supabase/supabase-js'
import { duplicateCustomer } from './customer-dedupe'

/**
 * The customer a new job belongs to, when the form named one by TYPING it.
 *
 * "+ New client…" on the project form used to store the typed name in
 * `projects.client` and nothing else. The header printed that name, so the job
 * looked owned - while the Customers list (which reads `customers`) had never
 * heard of them and Project Settings (which reads `customer_id`) said "No
 * customer". One fact, two homes, and the one that every other screen reads
 * was empty. Fourteen live jobs were in that state when it was reported.
 *
 * So the name becomes a customer: an existing card with the same name is
 * reused (the same rule the Customers page uses, `duplicateCustomer`), and
 * otherwise one is created. Returns null when nothing could be resolved, in
 * which case the caller still creates the job - a missing link is recoverable
 * from Project Settings, a refused job is not - and logs why.
 */
export async function customerForNewProject(
  db: SupabaseClient,
  companyId: string,
  name: string | null | undefined,
): Promise<{ id: string; name: string; created: boolean } | null> {
  const typed = String(name ?? '').trim()
  if (!typed || !companyId) return null

  const { data: mine, error: listError } = await db
    .from('customers')
    .select('id, name, email')
    .eq('gc_company_id', companyId)
  if (listError) {
    console.error('[projects] could not read customers to link the new job', listError)
    return null
  }
  const dup = duplicateCustomer(mine ?? [], { name: typed })
  if (dup) return { id: dup.customer.id, name: dup.customer.name ?? typed, created: false }

  const { data: made, error } = await db
    .from('customers')
    .insert({ gc_company_id: companyId, name: typed })
    .select('id, name')
    .single()
  if (error || !made) {
    console.error('[projects] could not create a customer for the new job', error)
    return null
  }
  return { id: made.id, name: made.name, created: true }
}
