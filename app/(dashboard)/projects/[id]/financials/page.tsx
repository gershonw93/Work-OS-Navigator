import { DollarSign, TrendingUp, Clock, AlertCircle } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { createClient } from '@/lib/supabase/server'

interface FinancialsPageProps {
  params: { id: string }
}

export default async function FinancialsPage({ params }: FinancialsPageProps) {
  const supabase = createClient()
  const { data: subcontracts } = await supabase
    .from('subcontracts')
    .select('*, companies(name), invoices(amount, status)')
    .eq('project_id', params.id)

  const items = subcontracts ?? []

  let contractValue = 0
  let totalBilled = 0
  let totalPaid = 0

  for (const sub of items) {
    contractValue += Number(sub.contract_amount)
    for (const inv of sub.invoices ?? []) {
      if (['submitted', 'approved', 'paid'].includes(inv.status)) {
        totalBilled += Number(inv.amount)
      }
      if (inv.status === 'paid') {
        totalPaid += Number(inv.amount)
      }
    }
  }

  const outstanding = totalBilled - totalPaid

  function fmt(n: number) {
    return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financials"
        subtitle="Project-level financial summary across all subcontracts."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Contract Value" value={fmt(contractValue)} icon={DollarSign} iconColor="text-slate-500" />
        <StatCard label="Total Billed" value={fmt(totalBilled)} icon={TrendingUp} iconColor="text-blue-500" />
        <StatCard label="Total Paid" value={fmt(totalPaid)} icon={DollarSign} iconColor="text-green-500" />
        <StatCard label="Outstanding" value={fmt(outstanding)} icon={AlertCircle} iconColor="text-yellow-500" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Subcontract Summary</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <EmptyState
              icon={DollarSign}
              title="No subcontracts yet"
              description="Financial details for each subcontract will appear here once contracts are created."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Trade</TableHead>
                  <TableHead>Contract Value</TableHead>
                  <TableHead>Billed</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((sub: any) => {
                  const billed = (sub.invoices ?? [])
                    .filter((inv: any) => ['submitted', 'approved', 'paid'].includes(inv.status))
                    .reduce((s: number, inv: any) => s + Number(inv.amount), 0)
                  const paid = (sub.invoices ?? [])
                    .filter((inv: any) => inv.status === 'paid')
                    .reduce((s: number, inv: any) => s + Number(inv.amount), 0)
                  return (
                    <TableRow key={sub.id}>
                      <TableCell className="font-medium">{sub.companies?.name}</TableCell>
                      <TableCell className="capitalize">{sub.trade}</TableCell>
                      <TableCell>{fmt(sub.contract_amount)}</TableCell>
                      <TableCell>{fmt(billed)}</TableCell>
                      <TableCell>{fmt(paid)}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(sub.status)}>{sub.status}</Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
