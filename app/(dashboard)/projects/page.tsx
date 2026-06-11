import Link from 'next/link'
import { FolderKanban, Plus } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { createClient } from '@/lib/supabase/server'

export default async function ProjectsPage() {
  const supabase = createClient()
  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })

  const items = projects ?? []

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Projects"
        subtitle="Manage all your construction projects."
        action={
          <Link href="/projects/new">
            <Button>
              <Plus className="h-4 w-4" />
              New Project
            </Button>
          </Link>
        }
      />

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title="No projects yet"
              description="Create your first project to start managing plans, bids, and the full construction workflow."
              action={{ label: 'New Project' }}
            />
          ) : (
            <>
            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-slate-100">
              {items.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}/plans`}
                  className="block p-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-slate-900">{project.name}</span>
                    <Badge variant={getStatusVariant(project.status)}>
                      {project.status?.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                    <span className="capitalize">{project.type?.replace('_', ' ')}</span>
                    {project.start_date && <span>{project.start_date}</span>}
                  </div>
                </Link>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/projects/${project.id}/plans`}
                        className="text-orange-600 hover:text-orange-700 hover:underline"
                      >
                        {project.name}
                      </Link>
                    </TableCell>
                    <TableCell className="capitalize">
                      {project.type?.replace('_', ' ')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(project.status)}>
                        {project.status?.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>{project.start_date}</TableCell>
                    <TableCell>
                      <Link href={`/projects/${project.id}/plans`}>
                        <Button variant="ghost" size="sm">View</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
