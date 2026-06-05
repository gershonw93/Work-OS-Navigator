import { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { ProjectTabs } from '@/components/layout/project-tabs'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { ProjectActivityButton } from '@/components/layout/project-activity-button'

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
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                {project?.name ?? 'Project'}
              </h1>
              {project?.address && (
                <p className="text-sm text-slate-500 mt-0.5">{project.address}</p>
              )}
            </div>
            {project?.status && (
              <Badge variant={getStatusVariant(project.status)} className="shrink-0">
                {project.status.replace('_', ' ')}
              </Badge>
            )}
          </div>
          <ProjectActivityButton projectId={params.id} />
        </div>
      </div>

      {/* Tabs */}
      <ProjectTabs projectId={params.id} />

      {/* Content */}
      <div className="flex-1 p-6">
        {children}
      </div>
    </div>
  )
}
