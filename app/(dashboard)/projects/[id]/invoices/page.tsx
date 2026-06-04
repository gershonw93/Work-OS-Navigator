import { Receipt, Plus } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { createClient } from '@/lib/supabase/server'

interface InvoicesPageProps {
  params: { id: string }
}

export default async function InvoicesPage({ params }: InvoicesPageProps) {
  const supabase = createClient()
  const { data: invoices } = await supabase
    .from('invoices')
    .select('*, subcontracts(scope, trade, companies(name))')
    .eq('project_id', params.id)
    .order('created_at', { ascending: false })

  const items = invoices ?? []

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Subcontractor invoices submitted against this project."
        action={
          <Button>
            <Plus className="h-4 w-4" />
            New Invoice
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No invoices yet"
              description="Subcontractor invoices submitted against this project's subcontracts will appear here."
              action={{ label: 'New Invoice' }}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Subcontractor</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((invoice: any, index: number) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-mono text-slate-500 text-xs">
                      INV-{String(index + 1).padStart(4, '0')}
                    </TableCell>
                    <TableCell className="font-medium">
                      {invoice.subcontracts?.companies?.name ?? '—'}
                    </TableCell>
                    <TableCell>${Number(invoice.amount).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(invoice.status)}>
                        {invoice.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {invoice.submitted_at
                        ? new Date(invoice.submitted_at).toLocaleDateString()
                        : '—'}
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
