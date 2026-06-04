import { CalendarDays, Plus } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { createClient } from '@/lib/supabase/server'

interface SchedulePageProps {
  params: { id: string }
}

function daysBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

export default async function SchedulePage({ params }: SchedulePageProps) {
  const supabase = createClient()
  const { data: schedule } = await supabase
    .from('schedule_items')
    .select('*, subcontracts(scope, trade, companies(name))')
    .eq('project_id', params.id)
    .order('start_date', { ascending: true })

  const items = schedule ?? []

  return (
    <div>
      <PageHeader
        title="Schedule"
        subtitle="Project timeline by trade and subcontractor."
        action={
          <Button>
            <Plus className="h-4 w-4" />
            Add Schedule Item
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No schedule built yet"
              description="Add schedule items to track when each trade is working on site."
              action={{ label: 'Add Schedule Item' }}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trade / Scope</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.subcontracts?.trade ?? '—'} — {item.subcontracts?.scope ?? '—'}
                    </TableCell>
                    <TableCell>{item.subcontracts?.companies?.name ?? '—'}</TableCell>
                    <TableCell>{item.start_date}</TableCell>
                    <TableCell>{item.end_date}</TableCell>
                    <TableCell>{daysBetween(item.start_date, item.end_date)} days</TableCell>
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
