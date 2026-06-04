import { FileCheck, Plus } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { createClient } from '@/lib/supabase/server'

interface PermitsPageProps {
  params: { id: string }
}

export default async function PermitsPage({ params }: PermitsPageProps) {
  const supabase = createClient()
  const { data: permits } = await supabase
    .from('permits')
    .select('*')
    .eq('project_id', params.id)
    .order('created_at', { ascending: false })

  const items = permits ?? []

  return (
    <div>
      <PageHeader
        title="Permits"
        subtitle="Building permits and their current status."
        action={
          <Button>
            <Plus className="h-4 w-4" />
            Add Permit
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <EmptyState
              icon={FileCheck}
              title="No permits tracked yet"
              description="Add building permits to track their submission, issuance, and expiration dates."
              action={{ label: 'Add Permit' }}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Permit #</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expiry Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((permit: any) => (
                  <TableRow key={permit.id}>
                    <TableCell className="font-medium">{permit.type}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {permit.permit_number ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(permit.status)}>
                        {permit.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>{permit.expiry_date ?? '—'}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm">Edit</Button>
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
