import { CheckSquare } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { createClient } from '@/lib/supabase/server'

export default async function ApprovalsPage() {
  const supabase = createClient()

  // Fetch submitted invoices awaiting approval
  const { data: invoices } = await supabase
    .from('invoices')
    .select('*, projects(name), subcontracts(companies(name))')
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false })

  // Fetch open RFIs
  const { data: rfis } = await supabase
    .from('rfis')
    .select('*, projects(name), profiles(full_name)')
    .eq('status', 'open')
    .order('created_at', { ascending: false })

  const pendingInvoices = invoices ?? []
  const openRfis = rfis ?? []
  const allItems = [
    ...pendingInvoices.map((inv: any) => ({
      id: inv.id,
      type: 'Invoice',
      project: inv.projects?.name,
      submitted_by: inv.subcontracts?.companies?.name,
      amount: inv.amount,
      date: inv.submitted_at,
    })),
    ...openRfis.map((rfi: any) => ({
      id: rfi.id,
      type: 'RFI',
      project: rfi.projects?.name,
      submitted_by: rfi.profiles?.full_name,
      amount: null,
      date: rfi.created_at,
    })),
  ]

  return (
    <div className="p-6">
      <PageHeader
        title="Approvals"
        subtitle="Review and act on pending invoices, RFIs, and change orders."
      />

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {['All', 'Invoices', 'RFIs', 'Change Orders'].map((filter) => (
          <button
            key={filter}
            className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-900 border-b-2 border-transparent hover:border-slate-300 transition-colors first:border-orange-500 first:text-orange-600"
          >
            {filter}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {allItems.length === 0 ? (
            <EmptyState
              icon={CheckSquare}
              title="No pending approvals"
              description="Invoices, RFIs, and change orders submitted for your review will appear here."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Submitted By</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allItems.map((item) => (
                  <TableRow key={`${item.type}-${item.id}`}>
                    <TableCell>
                      <Badge variant={item.type === 'Invoice' ? 'info' : 'warning'}>
                        {item.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{item.project ?? '—'}</TableCell>
                    <TableCell>{item.submitted_by ?? '—'}</TableCell>
                    <TableCell>
                      {item.amount != null ? `$${Number(item.amount).toLocaleString()}` : '—'}
                    </TableCell>
                    <TableCell>
                      {item.date ? new Date(item.date).toLocaleDateString() : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="default" size="sm">
                          Approve
                        </Button>
                        <Button variant="destructive" size="sm">
                          Reject
                        </Button>
                      </div>
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
