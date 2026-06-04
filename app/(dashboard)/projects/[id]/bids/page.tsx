import { Package, Plus } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { createClient } from '@/lib/supabase/server'

interface BidsPageProps {
  params: { id: string }
}

export default async function BidsPage({ params }: BidsPageProps) {
  const supabase = createClient()

  const { data: bidPackages } = await supabase
    .from('bid_packages')
    .select('*, bid_invitations(count), bids(count)')
    .eq('project_id', params.id)
    .order('created_at', { ascending: false })

  const { data: bids } = await supabase
    .from('bids')
    .select('*, bid_packages!inner(project_id, scope), companies(name)')
    .eq('bid_packages.project_id', params.id)
    .order('created_at', { ascending: false })

  const packages = bidPackages ?? []
  const receivedBids = bids ?? []

  return (
    <div className="space-y-6">
      <PageHeader title="Bids" subtitle="Manage bid packages and review received bids." />

      {/* Bid Packages */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle>Bid Packages</CardTitle>
          <Button size="sm">
            <Plus className="h-4 w-4" />
            New Bid Package
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {packages.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No bid packages yet"
              description="Create bid packages to invite subcontractors and collect pricing."
              action={{ label: 'New Bid Package' }}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scope</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead># Invitations</TableHead>
                  <TableHead># Bids</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packages.map((pkg: any) => (
                  <TableRow key={pkg.id}>
                    <TableCell className="font-medium">{pkg.scope}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(pkg.status)}>{pkg.status}</Badge>
                    </TableCell>
                    <TableCell>{pkg.due_date ?? '—'}</TableCell>
                    <TableCell>{pkg.bid_invitations?.[0]?.count ?? 0}</TableCell>
                    <TableCell>{pkg.bids?.[0]?.count ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Received Bids */}
      <Card>
        <CardHeader>
          <CardTitle>Received Bids</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {receivedBids.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No bids received yet"
              description="Bids submitted by subcontractors will appear here."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scope</TableHead>
                  <TableHead>Subcontractor</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receivedBids.map((bid: any) => (
                  <TableRow key={bid.id}>
                    <TableCell>{bid.bid_packages?.scope}</TableCell>
                    <TableCell className="font-medium">{bid.companies?.name}</TableCell>
                    <TableCell>${Number(bid.amount).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(bid.status)}>{bid.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {bid.submitted_at
                        ? new Date(bid.submitted_at).toLocaleDateString()
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
