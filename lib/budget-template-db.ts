import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// A template belongs to a company, and an id from a URL proves nothing. Every
// route that writes to one asks this first. 404, not 403: another company's
// template is not something this caller can see at all.

export async function ownedTemplate(
  db: SupabaseClient, companyId: string | null, templateId: string,
): Promise<{ template: { id: string; name: string } } | { denied: NextResponse }> {
  if (!companyId) return { denied: NextResponse.json({ error: 'Template not found' }, { status: 404 }) }
  const { data, error } = await db.from('budget_templates').select('id, name')
    .eq('id', templateId).eq('company_id', companyId).maybeSingle()
  if (error) {
    console.error('[budget-templates] read failed', error.message)
    return { denied: NextResponse.json({ error: 'Could not read the template.' }, { status: 500 }) }
  }
  if (!data) return { denied: NextResponse.json({ error: 'Template not found' }, { status: 404 }) }
  return { template: data as { id: string; name: string } }
}

export const TEMPLATE_ITEM_COLUMNS = 'id, template_id, category, cost_code, description, default_amount, cost_type, sort_order'
