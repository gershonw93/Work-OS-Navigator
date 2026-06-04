import { FileText, Upload } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { createClient } from '@/lib/supabase/server'

interface PlansPageProps {
  params: { id: string }
}

export default async function PlansPage({ params }: PlansPageProps) {
  const supabase = createClient()
  const { data: plans } = await supabase
    .from('project_plans')
    .select('*')
    .eq('project_id', params.id)
    .order('created_at', { ascending: false })

  const items = plans ?? []

  return (
    <div>
      <PageHeader
        title="Plans"
        subtitle="Architectural, structural, and other project drawings."
        action={
          <Button>
            <Upload className="h-4 w-4" />
            Upload Plan
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No plans uploaded yet"
              description="Upload architectural, structural, MEP, and other project drawings to keep your team aligned."
              action={{ label: 'Upload Plan' }}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-medium">{plan.name}</TableCell>
                    <TableCell className="capitalize">{plan.plan_type}</TableCell>
                    <TableCell>{new Date(plan.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <a href={plan.file_url} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="sm">View</Button>
                      </a>
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
