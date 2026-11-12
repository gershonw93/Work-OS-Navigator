import { PmBoard } from '@/components/project-management/pm-board'

// The signed-in person's own board for this job. The screen and its rules are
// in components/project-management/pm-board.tsx.
export default function ProjectManagementPage({ params }: { params: { id: string } }) {
  return <PmBoard projectId={params.id} />
}
