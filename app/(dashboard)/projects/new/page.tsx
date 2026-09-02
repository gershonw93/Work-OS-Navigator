'use client'

import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { ProjectForm } from '@/components/projects/project-form'

/**
 * The form itself lives in components/projects/project-form.tsx, because the
 * Add Project modal on a customer's page mounts the same one. It used to have
 * its own shorter copy that had fallen four fields behind - including contract
 * type and billing mode, which the Budget and Payments tabs are built on.
 */
export default function NewProjectPage() {
  const router = useRouter()

  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      <PageHeader
        title="New Project"
        subtitle="Fill in the details to create your construction project."
      />

      <Card>
        <CardContent className="pt-6">
          <ProjectForm
            onCreated={(project) => router.push(`/projects/${project.id}`)}
            onCancel={() => router.back()}
          />
        </CardContent>
      </Card>
    </div>
  )
}
