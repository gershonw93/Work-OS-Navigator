'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FolderKanban, Plus, Pencil, Trash2, X } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'

interface Project {
  id: string
  name: string
  address: string | null
  client: string | null
  type: string | null
  status: string | null
  start_date: string | null
  end_date: string | null
  created_at: string
}

const PROJECT_TYPES = ['residential', 'commercial', 'industrial', 'civil', 'other']
const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed', 'cancelled']

export default function ProjectsPage() {
  const supabase = createClient()
  const [items, setItems] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [saving, setSaving] = useState(false)

  // Edit form state
  const [editName, setEditName] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [editClient, setEditClient] = useState('')
  const [editType, setEditType] = useState('')
  const [editStatus, setEditStatus] = useState('')
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function fetchProjects() {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
    setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchProjects() }, [])

  function openEdit(project: Project) {
    setEditProject(project)
    setEditName(project.name)
    setEditAddress(project.address ?? '')
    setEditClient(project.client ?? '')
    setEditType(project.type ?? '')
    setEditStatus(project.status ?? '')
    setEditStartDate(project.start_date ?? '')
    setEditEndDate(project.end_date ?? '')
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editProject) return
    setSaving(true)
    const token = await getToken()
    await fetch(`/api/projects/${editProject.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: editName,
        address: editAddress || null,
        client: editClient || null,
        type: editType || null,
        status: editStatus || null,
        start_date: editStartDate || null,
        end_date: editEndDate || null,
      }),
    })
    setSaving(false)
    setEditProject(null)
    fetchProjects()
  }

  async function handleDelete(project: Project) {
    if (!window.confirm('Delete this project and all its data?')) return
    const token = await getToken()
    await fetch(`/api/projects/${project.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    fetchProjects()
  }

  if (loading) return <div className="p-4 sm:p-6 text-sm text-slate-400 py-12 text-center">Loading...</div>

  return (
    <div className="p-4 sm:p-6">
      {/* Edit Modal */}
      {editProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Edit Project</h2>
              <button onClick={() => setEditProject(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleEdit}>
              <div className="px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <Label>Project Name <span className="text-red-500">*</span></Label>
                  <Input required value={editName} onChange={e => setEditName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Address</Label>
                  <Input value={editAddress} onChange={e => setEditAddress(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Client</Label>
                  <Input value={editClient} onChange={e => setEditClient(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <select value={editType} onChange={e => setEditType(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:border-orange-500 focus:outline-none">
                      <option value="">Select type...</option>
                      {PROJECT_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <select value={editStatus} onChange={e => setEditStatus(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:border-orange-500 focus:outline-none">
                      <option value="">Select status...</option>
                      {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Start Date</Label>
                    <Input type="date" value={editStartDate} onChange={e => setEditStartDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>End Date</Label>
                    <Input type="date" value={editEndDate} onChange={e => setEditEndDate(e.target.value)} />
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-slate-100 flex gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => setEditProject(null)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <PageHeader
        title="Projects"
        subtitle="Manage all your construction projects."
        action={
          <Link href="/projects/new">
            <Button>
              <Plus className="h-4 w-4" />
              New Project
            </Button>
          </Link>
        }
      />

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title="No projects yet"
              description="Create your first project to start managing plans, bids, and the full construction workflow."
              action={{ label: 'New Project' }}
            />
          ) : (
            <>
            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-slate-100">
              {items.map((project) => (
                <div key={project.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/projects/${project.id}/plans`} className="font-medium text-slate-900 hover:text-orange-600">
                      {project.name}
                    </Link>
                    <Badge variant={getStatusVariant(project.status ?? '')}>
                      {project.status?.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                    <span className="capitalize">{project.type?.replace('_', ' ')}</span>
                    {project.start_date && <span>{project.start_date}</span>}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => openEdit(project)} className="text-slate-400 hover:text-slate-600">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(project)} className="text-slate-400 hover:text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/projects/${project.id}/plans`}
                        className="text-orange-600 hover:text-orange-700 hover:underline"
                      >
                        {project.name}
                      </Link>
                    </TableCell>
                    <TableCell className="capitalize">
                      {project.type?.replace('_', ' ')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(project.status ?? '')}>
                        {project.status?.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>{project.start_date}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Link href={`/projects/${project.id}/plans`}>
                          <Button variant="ghost" size="sm">View</Button>
                        </Link>
                        <button onClick={() => openEdit(project)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleDelete(project)} className="p-1.5 text-slate-400 hover:text-red-500 rounded">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
