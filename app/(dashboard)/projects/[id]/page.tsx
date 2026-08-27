import { redirect } from 'next/navigation'

interface ProjectPageProps {
  params: { id: string }
}

/**
 * Opening a job lands on the overview, not Plans.
 *
 * It used to redirect to /plans - so the front door of an active job was a file
 * list, and nothing anywhere said where the job stood or what had piled up
 * since you last looked.
 *
 * Whether the viewer can SEE an overview is not knowable here (it is GC-side
 * only, and sites do not have one), so /overview sends anyone else on to Plans
 * itself rather than this guessing.
 */
export default function ProjectPage({ params }: ProjectPageProps) {
  redirect(`/projects/${params.id}/overview`)
}
