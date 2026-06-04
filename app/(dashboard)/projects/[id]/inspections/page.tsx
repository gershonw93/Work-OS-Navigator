import { ClipboardCheck, Plus } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { createClient } from '@/lib/supabase/server'

interface InspectionsPageProps {
  params: { id: string }
}

export default async function InspectionsPage({ params }: InspectionsPageProps) {
  const supabase = createClient()
  const { data: inspections } = await supabase
    .from('inspections')
    .select('*')
    .eq('project_id', params.id)
    .order('created_at', { ascending: false })

  const items = inspections ?? []

  return (
    <div>
      <PageHeader
        title="Inspections"
        subtitle="Track building inspections and their outcomes."
        action={
          <Button>
            <Plus className="h-4 w-4" />
            Schedule Inspection
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="No inspections yet"
              description="Schedule and track building inspections to stay on top of compliance milestones."
              action={{ label: 'Schedule Inspection' }}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Scheduled Date</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((inspection: any) => (
                  <TableRow key={inspection.id}>
                    <TableCell className="font-medium">{inspection.type}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(inspection.status)}>
                        {inspection.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{inspection.scheduled_date ?? '—'}</TableCell>
                    <TableCell>
                      <span className="line-clamp-1 max-w-xs text-slate-600">
                        {inspection.notes ?? '—'}
                      </span>
                    </TableCell>
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
