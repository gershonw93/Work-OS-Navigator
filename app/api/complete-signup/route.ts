import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { companyName, companyType, fullName, email } = await request.json()

  // Verify the requesting user is authenticated
  const supabase = createServerClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Use service role client to bypass RLS
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Check if profile already exists
  const { data: existing } = await admin
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .single()

  if (existing) {
    return NextResponse.json({ success: true })
  }

  // Create company
  const { data: company, error: companyError } = await admin
    .from('companies')
    .insert({ name: companyName, type: companyType, contact_email: email })
    .select()
    .single()

  if (companyError) {
    return NextResponse.json({ error: companyError.message }, { status: 500 })
  }

  // Create profile
  const { error: profileError } = await admin
    .from('profiles')
    .insert({ id: user.id, company_id: company.id, email, full_name: fullName, role: 'admin' })

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
