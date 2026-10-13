import { createClient } from '@supabase/supabase-js'

/** The service-role client every Reports route uses. */
export const reportDb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
