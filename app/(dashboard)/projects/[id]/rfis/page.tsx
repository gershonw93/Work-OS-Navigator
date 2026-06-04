import { MessageSquare, Plus } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { createClient } from '@/lib/supabase/server'

interface RFIsPageProps {
  params: { id: string }
}

export default async function RFIsPage({ params }: RFIsPageProps) {
  const supabase = createClient()
  const { data: rfis } = await supabase
    .from('rfis')
    .select('*, profiles(full_name)')
    .eq('project_id', params.id)
    .order('created_at', { ascending: false })

  const items = rfis ?? []

  return (
    <div>
      <PageHeader
        title="RFIs"
        subtitle="Requests for information submitted on this project."
        action={
          <Button>
            <Plus className="h-4 w-4" />
            New RFI
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="No RFIs yet"
              description="Create RFIs to formally request clarifications from the design team or owner."
              action={{ label: 'New RFI' }}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Question</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((rfi: any, index: number) => (
                  <TableRow key={rfi.id}>
                    <TableCell className="font-mono text-slate-500 text-xs">
                      RFI-{String(index + 1).padStart(3, '0')}
                    </TableCell>
                    <TableCell>
                      <span className="line-clamp-2 max-w-sm">{rfi.question}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(rfi.status)}>
                        {rfi.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{rfi.profiles?.full_name ?? '—'}</TableCell>
                    <TableCell>{new Date(rfi.created_at).toLocaleDateString()}</TableCell>
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
