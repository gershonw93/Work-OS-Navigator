import { PageHeader } from '@/components/ui/page-header'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/server'
import { UserPlus } from 'lucide-react'

export default async function SettingsPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = user
    ? await supabase
        .from('profiles')
        .select('*, companies(*)')
        .eq('id', user.id)
        .single()
    : { data: null }

  const { data: teammates } = profile?.company_id
    ? await supabase
        .from('profiles')
        .select('*')
        .eq('company_id', profile.company_id)
    : { data: [] }

  const company = (profile as any)?.companies
  const team = teammates ?? []

  return (
    <div className="p-6 max-w-3xl space-y-8">
      <PageHeader title="Settings" subtitle="Manage your company profile, team, and preferences." />

      {/* Company Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Company Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                defaultValue={company?.name ?? ''}
                placeholder="Your company name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="companyType">Company Type</Label>
              <Select id="companyType" defaultValue={company?.type ?? 'gc'}>
                <option value="gc">General Contractor</option>
                <option value="subcontractor">Subcontractor</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="contactEmail">Contact Email</Label>
              <Input
                id="contactEmail"
                type="email"
                defaultValue={company?.contact_email ?? ''}
                placeholder="contact@company.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                defaultValue={company?.phone ?? ''}
                placeholder="(555) 000-0000"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              defaultValue={company?.address ?? ''}
              placeholder="123 Main St, City, State 12345"
            />
          </div>
          <div className="pt-2">
            <Button>Save Changes</Button>
          </div>
        </CardContent>
      </Card>

      {/* Team Members */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Team Members</CardTitle>
          <Button size="sm">
            <UserPlus className="h-4 w-4" />
            Invite Member
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {team.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-slate-400 py-8">
                    No team members yet. Invite your first teammate.
                  </TableCell>
                </TableRow>
              ) : (
                team.map((member: any) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{member.full_name}</TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>
                      <Badge variant="muted" className="capitalize">{member.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm">Edit</Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            'New invoice submitted',
            'Invoice approved or rejected',
            'RFI response received',
            'Compliance document expiring',
            'New bid received',
          ].map((pref) => (
            <label key={pref} className="flex items-center justify-between py-1 cursor-pointer">
              <span className="text-sm text-slate-700">{pref}</span>
              <div className="relative">
                <input type="checkbox" defaultChecked className="peer sr-only" />
                <div className="h-5 w-9 rounded-full bg-slate-200 peer-checked:bg-orange-500 transition-colors" />
                <div className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
              </div>
            </label>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
