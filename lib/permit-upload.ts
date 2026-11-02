import type { SupabaseClient } from '@supabase/supabase-js'
import type { RoundFile } from '@/lib/permit-rounds'

// The files on a submission or an answer, uploaded into the `permits` bucket
// the permit's own document already lives in. Handed to the write functions as
// a callback so nothing is uploaded until the round has passed its checks - a
// refused submission must not leave files behind.

/** Every non-empty file under `key` in a multipart form. */
export function filesFrom(form: FormData, key = 'files'): File[] {
  return form.getAll(key).filter((f): f is File => typeof f === 'object' && f !== null && 'size' in f && (f as File).size > 0)
}

export function permitFilesUploader(db: SupabaseClient, projectId: string, files: File[]) {
  if (!files.length) return undefined
  return async (): Promise<{ files: RoundFile[] } | { error: string }> => {
    const out: RoundFile[] = []
    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${projectId}/rounds/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`
      const { error } = await db.storage.from('permits')
        .upload(path, await file.arrayBuffer(), { contentType: file.type || undefined, upsert: false })
      if (error) {
        console.error('[permit-upload] failed', file.name, error.message)
        return { error: `Could not upload ${file.name}. Nothing was saved - try again.` }
      }
      // Same lifetime as the permit document beside it.
      const { data: signed } = await db.storage.from('permits').createSignedUrl(path, 60 * 60 * 24 * 365 * 10)
      if (!signed?.signedUrl) return { error: `Could not link ${file.name}. Nothing was saved - try again.` }
      out.push({ name: file.name, url: signed.signedUrl, type: file.type || null, size: file.size })
    }
    return { files: out }
  }
}
