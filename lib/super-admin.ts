// Platform owner(s) allowed to impersonate ANY account for customer support.
// Keep this list tiny — these emails can log in as anyone, across all companies.
export const SUPER_ADMIN_EMAILS = [
  'gershon@clicktokmarketing.com',
]

export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  return SUPER_ADMIN_EMAILS.map(e => e.toLowerCase()).includes(email.toLowerCase())
}
