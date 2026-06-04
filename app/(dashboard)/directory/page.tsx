import { Building2, Plus } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { createClient } from '@/lib/supabase/server'

export default async function DirectoryPage() {
  const supabase = createClient()
  const { data: companies } = await supabase
    .from('companies')
    .select('*')
    .eq('type', 'subcontractor')
    .order('name', { ascending: true })

  const items = companies ?? []

  return (
    <div className="p-6">
      <PageHeader
        title="Subcontractor Directory"
        subtitle="Manage your approved vendor and subcontractor list."
        action={
          <Button>
            <Plus className="h-4 w-4" />
            Add Company
          </Button>
        }
      />

      {/* Search */}
      <div className="mb-4 max-w-sm">
        <Input placeholder="Search companies..." />
      </div>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No companies in directory"
              description="Add subcontractors and vendors to your directory to quickly invite them to bid on projects."
              action={{ label: 'Add Company' }}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Trade</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Insurance</TableHead>
                  <TableHead>License #</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((company: any) => (
                  <TableRow key={company.id}>
                    <TableCell className="font-medium">{company.name}</TableCell>
                    <TableCell>{company.trade ?? '—'}</TableCell>
                    <TableCell>
                      <a
                        href={`mailto:${company.contact_email}`}
                        className="text-orange-600 hover:text-orange-700 hover:underline text-sm"
                      >
                        {company.contact_email}
                      </a>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          company.insurance_status === 'active'
                            ? 'success'
                            : company.insurance_status === 'expired'
                            ? 'danger'
                            : 'muted'
                        }
                      >
                        {company.insurance_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {company.license_number ?? '—'}
                    </TableCell>
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
