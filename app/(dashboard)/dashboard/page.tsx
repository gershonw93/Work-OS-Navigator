import { FolderKanban, AlertCircle, ShieldAlert, MessageSquare } from 'lucide-react'
import { StatCard } from '@/components/ui/stat-card'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'

const recentProjects: {
  id: string
  name: string
  status: string
  start_date: string
  team_size: number
}[] = []

const pendingApprovals: {
  id: string
  type: string
  project: string
  submitted_by: string
  date: string
}[] = []

export default function DashboardPage() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Welcome back. Here's what's happening across your projects."
      />

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active Projects"
          value="—"
          icon={FolderKanban}
          iconColor="text-orange-500"
        />
        <StatCard
          label="Pending Approvals"
          value="—"
          icon={AlertCircle}
          iconColor="text-yellow-500"
        />
        <StatCard
          label="Expiring Compliance"
          value="—"
          icon={ShieldAlert}
          iconColor="text-red-500"
        />
        <StatCard
          label="Open RFIs"
          value="—"
          icon={MessageSquare}
          iconColor="text-blue-500"
        />
      </div>

      {/* Recent Projects */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Projects</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recentProjects.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title="No projects yet"
              description="Create your first project to get started managing your construction work."
              action={{ label: 'New Project' }}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>Team Size</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentProjects.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(p.status)}>
                        {p.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>{p.start_date}</TableCell>
                    <TableCell>{p.team_size}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pending Approvals */}
      <Card>
        <CardHeader>
          <CardTitle>Pending Approvals</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {pendingApprovals.length === 0 ? (
            <EmptyState
              icon={AlertCircle}
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
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingApprovals.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.type}</TableCell>
                    <TableCell>{a.project}</TableCell>
                    <TableCell>{a.submitted_by}</TableCell>
                    <TableCell>{a.date}</TableCell>
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
