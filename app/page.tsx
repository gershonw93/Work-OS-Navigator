import { redirect } from 'next/navigation'

// Logged-in users are sent to /dashboard by middleware; everyone else lands on
// the marketing homepage.
export default function RootPage() {
  redirect('/homepage')
}
