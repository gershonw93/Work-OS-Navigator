import { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { ProjectTabs } from '@/components/layout/project-tabs'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { ProjectActivityButton } from '@/components/layout/project-activity-button'
import { SharePortalButton } from '@/components/layout/share-portal-button'
import { TeamQuickView } from '@/components/layout/team-quick-view'
import { EditProjectButton } from '@/components/layout/edit-project-button'

interface ProjectLayoutProps {
  children: ReactNode
  params: { id: string }
}

export default async function ProjectLayout({ children, params }: ProjectLayoutProps) {
  const supabase = createClient()
  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', params.id)
    .single()

  return (
    <div className="flex flex-col min-h-full">
      {/* Project header */}
      <div className="border-b border-line bg-panel px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
            <div>
              <h1 className="text-xl font-bold text-ink">
                {project?.name ?? 'Project'}
              </h1>
              {project?.address && (
                <p className="text-sm text-muted-fg mt-0.5">{project.address}</p>
              )}
            </div>
            {project?.status && (
              <Badge variant={getStatusVariant(project.status)} className="shrink-0">
                {project.status.replace('_', ' ')}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <TeamQuickView projectId={params.id} />
            <SharePortalButton projectId={params.id} />
            <ProjectActivityButton projectId={params.id} />
            <EditProjectButton projectId={params.id} project={{
              name: project?.name, address: project?.address, client: project?.client,
              type: project?.type, status: project?.status,
              start_date: project?.start_date, end_date: project?.end_date,
              customer_id: project?.customer_id,
            }} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <ProjectTabs projectId={params.id} />

      {/* Content */}
      <div className="flex-1 p-4 sm:p-6">
        {children}
      </div>
    </div>
  )
}
