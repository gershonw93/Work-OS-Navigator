import { redirect } from 'next/navigation'

interface ProjectPageProps {
  params: { id: string }
}

export default function ProjectPage({ params }: ProjectPageProps) {
  redirect(`/projects/${params.id}/plans`)
}
