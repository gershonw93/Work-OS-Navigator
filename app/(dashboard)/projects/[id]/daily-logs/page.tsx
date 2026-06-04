import { BookOpen, Plus } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { createClient } from '@/lib/supabase/server'

interface DailyLogsPageProps {
  params: { id: string }
}

export default async function DailyLogsPage({ params }: DailyLogsPageProps) {
  const supabase = createClient()
  const { data: logs } = await supabase
    .from('daily_logs')
    .select('*, profiles(full_name)')
    .eq('project_id', params.id)
    .order('log_date', { ascending: false })

  const items = logs ?? []

  return (
    <div>
      <PageHeader
        title="Daily Logs"
        subtitle="Daily field reports, worker counts, and site conditions."
        action={
          <Button>
            <Plus className="h-4 w-4" />
            New Log
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No daily logs yet"
              description="Create daily logs to document site conditions, worker counts, and progress notes."
              action={{ label: 'New Log' }}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Workers Onsite</TableHead>
                  <TableHead>Weather</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Created By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium whitespace-nowrap">{log.log_date}</TableCell>
                    <TableCell>{log.workers_onsite}</TableCell>
                    <TableCell>{log.weather ?? '—'}</TableCell>
                    <TableCell>
                      <span className="line-clamp-1 max-w-xs">{log.notes}</span>
                    </TableCell>
                    <TableCell>{log.profiles?.full_name ?? '—'}</TableCell>
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
