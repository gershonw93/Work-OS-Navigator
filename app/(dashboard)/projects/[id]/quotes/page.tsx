import { redirect } from 'next/navigation'

// Compare Quotes has merged into the unified "Quotes" tab.
export default function QuotesRedirect({ params }: { params: { id: string } }) {
  redirect(`/projects/${params.id}/request-quotes`)
}
