import { LinkedInConsole } from '@/components/admin/linkedin-console'

// The /admin layout already gates this to the super admin behind the PIN, so
// the page just renders the console.
export default function AdminLinkedInPage() {
  return <LinkedInConsole />
}
