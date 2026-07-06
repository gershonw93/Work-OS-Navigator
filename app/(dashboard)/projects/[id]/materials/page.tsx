'use client'

import { MaterialsView } from '@/components/materials/materials-view'

export default function ProjectMaterialsPage({ params }: { params: { id: string } }) {
  return <MaterialsView lockedProjectId={params.id} />
}
