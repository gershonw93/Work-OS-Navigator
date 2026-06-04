import { ShieldCheck } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { createClient } from '@/lib/supabase/server'

interface CompliancePageProps {
  params: { id: string }
}

const docTypes = ['coi', 'license', 'w9', 'workers_comp'] as const
const docLabels: Record<string, string> = {
  coi: 'COI',
  license: 'License',
  w9: 'W-9',
  workers_comp: "Workers' Comp",
}

export default async function CompliancePage({ params }: CompliancePageProps) {
  const supabase = createClient()

  // Get all subcontracts on this project
  const { data: subcontracts } = await supabase
    .from('subcontracts')
    .select('*, companies(id, name)')
    .eq('project_id', params.id)

  const subs = subcontracts ?? []

  // Get all compliance docs for these companies on this project
  const companyIds = subs.map((s: any) => s.companies?.id).filter(Boolean)
  const { data: docs } = companyIds.length
    ? await supabase
        .from('compliance_documents')
        .select('*')
        .in('company_id', companyIds)
        .or(`project_id.eq.${params.id},project_id.is.null`)
    : { data: [] }

  const allDocs = docs ?? []

  function getDocStatus(companyId: string, type: string): string {
    const doc = allDocs.find(
      (d: any) => d.company_id === companyId && d.type === type
    )
    return doc?.status ?? 'missing'
  }

  return (
    <div>
      <PageHeader
        title="Compliance"
        subtitle="Document status for each subcontractor on this project."
      />

      <Card>
        <CardContent className="p-0">
          {subs.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="No subcontractors yet"
              description="Once subcontracts are awarded, you'll track COI, license, W-9, and workers' comp documents here."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  {docTypes.map((t) => (
                    <TableHead key={t}>{docLabels[t]}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {subs.map((sub: any) => (
                  <TableRow key={sub.id}>
                    <TableCell className="font-medium">{sub.companies?.name}</TableCell>
                    {docTypes.map((t) => {
                      const status = getDocStatus(sub.companies?.id, t)
                      return (
                        <TableCell key={t}>
                          <Badge variant={getStatusVariant(status)}>
                            {status}
                          </Badge>
                        </TableCell>
                      )
                    })}
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
