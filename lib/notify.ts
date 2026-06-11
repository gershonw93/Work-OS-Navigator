import { SupabaseClient } from '@supabase/supabase-js'

export async function createNotification(
  db: SupabaseClient,
  userId: string,
  title: string,
  message?: string,
  link?: string,
  type?: string,
) {
  await db.from('notifications').insert({
    user_id: userId,
    title,
    message: message ?? null,
    link: link ?? null,
    type: type ?? 'info',
    read: false,
  })
}
