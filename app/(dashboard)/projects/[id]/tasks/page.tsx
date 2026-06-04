import { CheckSquare, Plus } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { createClient } from '@/lib/supabase/server'

interface TasksPageProps {
  params: { id: string }
}

export default async function TasksPage({ params }: TasksPageProps) {
  const supabase = createClient()
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*, profiles(full_name)')
    .eq('project_id', params.id)
    .order('created_at', { ascending: false })

  const items = tasks ?? []

  const statusLabel: Record<string, string> = {
    not_started: 'Not Started',
    in_progress: 'In Progress',
    complete: 'Complete',
  }

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle="Track action items and deliverables for this project."
        action={
          <Button>
            <Plus className="h-4 w-4" />
            Add Task
          </Button>
        }
      />

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {['All', 'Not Started', 'In Progress', 'Complete'].map((filter) => (
          <button
            key={filter}
            className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-900 border-b-2 border-transparent hover:border-slate-300 transition-colors"
          >
            {filter}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <EmptyState
              icon={CheckSquare}
              title="No tasks yet"
              description="Add tasks to track action items, follow-ups, and deliverables for this project."
              action={{ label: 'Add Task' }}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((task: any) => (
                  <TableRow key={task.id}>
                    <TableCell className="font-medium">{task.title}</TableCell>
                    <TableCell>{task.profiles?.full_name ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(task.status)}>
                        {statusLabel[task.status] ?? task.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{task.due_date ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
