import { BarChart3 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { createClient } from '@/lib/supabase/server'

interface ProgressPageProps {
  params: { id: string }
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-orange-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-slate-600 tabular-nums">{pct}%</span>
    </div>
  )
}

export default async function ProgressPage({ params }: ProgressPageProps) {
  const supabase = createClient()
  const { data: subcontracts } = await supabase
    .from('subcontracts')
    .select('*, companies(name), invoices(amount, status)')
    .eq('project_id', params.id)

  const items = subcontracts ?? []

  return (
    <div>
      <PageHeader
        title="Subs Progress"
        subtitle="Field completion, schedule, and billing progress by subcontractor."
      />

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="No subcontractors on this project yet"
              description="Once subcontracts are awarded, you'll track field completion, schedule, and billing progress here."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company / Trade</TableHead>
                  <TableHead>Field %</TableHead>
                  <TableHead>Schedule %</TableHead>
                  <TableHead>Billed %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((sub: any) => {
                  const totalBilled = (sub.invoices ?? [])
                    .filter((inv: any) => ['submitted', 'approved', 'paid'].includes(inv.status))
                    .reduce((sum: number, inv: any) => sum + Number(inv.amount), 0)
                  const billedPct = sub.contract_amount > 0
                    ? Math.round((totalBilled / sub.contract_amount) * 100)
                    : 0

                  return (
                    <TableRow key={sub.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{sub.companies?.name}</p>
                          <p className="text-xs text-slate-500 capitalize">{sub.trade}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <ProgressBar value={0} />
                      </TableCell>
                      <TableCell>
                        <ProgressBar value={0} />
                      </TableCell>
                      <TableCell>
                        <ProgressBar value={billedPct} />
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
