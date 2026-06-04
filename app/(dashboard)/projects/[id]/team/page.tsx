import { Users } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { createClient } from '@/lib/supabase/server'

interface TeamPageProps {
  params: { id: string }
}

export default async function TeamPage({ params }: TeamPageProps) {
  const supabase = createClient()
  const { data: subcontracts } = await supabase
    .from('subcontracts')
    .select('*, companies(name)')
    .eq('project_id', params.id)
    .order('created_at', { ascending: false })

  const items = subcontracts ?? []

  return (
    <div>
      <PageHeader
        title="Project Team"
        subtitle="Subcontractors and their contract details."
      />

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No team members yet"
              description="Award bids to subcontractors to build your project team. Their contracts will appear here."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trade</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Contract Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((sub: any) => (
                  <TableRow key={sub.id}>
                    <TableCell className="font-medium capitalize">{sub.trade}</TableCell>
                    <TableCell>{sub.companies?.name}</TableCell>
                    <TableCell>${Number(sub.contract_amount).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(sub.status)}>
                        {sub.status}
                      </Badge>
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
