import { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { ProjectTabs } from '@/components/layout/project-tabs'
import { ProjectTabGuard } from '@/components/layout/project-tab-guard'
import { ProjectActivityButton } from '@/components/layout/project-activity-button'
import { SharePortalButton } from '@/components/layout/share-portal-button'
import { TeamQuickView } from '@/components/layout/team-quick-view'
import { EditProjectButton } from '@/components/layout/edit-project-button'
import { ProjectStatusSwitch } from '@/components/layout/project-status-switch'
import { SetupChecklist } from '@/components/projects/setup-checklist'
import { ownsProject, clientLabel } from '@/lib/project-access'
import { currentProfile } from '@/lib/supabase/current-user'

interface ProjectLayoutProps {
  children: ReactNode
  params: { id: string }
}

export default async function ProjectLayout({ children, params }: ProjectLayoutProps) {
  const supabase = createClient()

  // Two awaits, not five. This layout wraps EVERY project page, so anything
  // sequential here is paid on every navigation - and the customer name used
  // to cost three extra round trips, two of them re-asking what the dashboard
  // layout had just resolved.
  //
  // The customer rides along on the project query as a join rather than a
  // second trip, and currentProfile() is the same cached answer the parent
  // already paid for.
  const [{ data: project }, profile] = await Promise.all([
    supabase.from('projects').select('*, customers(name)').eq('id', params.id).single(),
    currentProfile(),
  ])

  // A job inside a building needs a way back to it - otherwise the only route
  // to its 39 siblings is the Projects list, which deliberately hides them.
  // Only reachable once we know the project, so it genuinely has to follow.
  const { data: parent } = project?.parent_project_id
    ? await supabase.from('projects').select('id, name').eq('id', project.parent_project_id).single()
    : { data: null }

  // Whose client this is. The header named the project and the address and
  // never once said who it was FOR - the thing you sort a job by in your head.
  //
  // Shown only to the owning company: subcontractors working this job see the
  // same header, and who the GC is billing is not theirs to know.
  const client = ownsProject(profile?.company_id, project)
    ? clientLabel((project as any)?.customers?.name, project?.client)
    : null

  return (
    <div className="flex flex-col min-h-full">
      {/* Project header */}
      <div className="border-b border-line bg-panel px-4 sm:px-6 py-4 print:hidden">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
            <div className="min-w-0">
              {parent && (
                <a href={`/projects/${parent.id}/units`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent-fg hover:underline">
                  ← {parent.name}
                </a>
              )}
              {client && (
                <p className="text-xs font-medium text-muted-fg truncate">{client}</p>
              )}
              <h1 className="text-lg sm:text-xl font-bold text-ink truncate">
                {project?.name ?? 'Project'}
              </h1>
              {(project?.address || project?.unit || project?.floor) && (
                <p className="text-sm text-muted-fg mt-0.5 truncate">
                  {[
                    project?.unit ? `Unit ${project.unit}` : null,
                    project?.floor ? `Floor ${project.floor}` : null,
                    project?.address,
                  ].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
            {project?.status && (
              <ProjectStatusSwitch projectId={params.id} status={project.status} isSite={!!project.is_site} />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
            {/* A chip in the row of controls that already exists, rather than
                another band across the top. Everything else is behind it. */}
            <SetupChecklist projectId={params.id} />
            <TeamQuickView projectId={params.id} />
            <SharePortalButton projectId={params.id} />
            <ProjectActivityButton projectId={params.id} />
            <EditProjectButton projectId={params.id} project={{
              name: project?.name, address: project?.address, client: project?.client,
              type: project?.type, status: project?.status,
              start_date: project?.start_date, end_date: project?.end_date,
              customer_id: project?.customer_id,
              interior_sqft: project?.interior_sqft, exterior_sqft: project?.exterior_sqft,
              billing_mode: project?.billing_mode, contract_type: project?.contract_type,
              contractor_fee_pct: project?.contractor_fee_pct,
              default_retainage_pct: project?.default_retainage_pct,
              unit: project?.unit, floor: project?.floor,
              is_site: project?.is_site, parent_project_id: project?.parent_project_id,
            }} />
          </div>
        </div>
      </div>

      <div className="print:hidden">
        <ProjectTabs projectId={params.id} />
      </div>

      {/* Content. Wrapped so a tab this person may not see says so, rather
          than rendering an empty version of it - see ProjectTabGuard. */}
      <div className="flex-1 p-4 sm:p-6 print:p-0">
        <ProjectTabGuard>{children}</ProjectTabGuard>
      </div>
    </div>
  )
}
