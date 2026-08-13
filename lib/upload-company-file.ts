import { createClient } from '@/lib/supabase/client'

/**
 * Upload a company file straight to storage, then record it.
 *
 * NEVER post the bytes through /api/files. A serverless function caps the
 * request body at about 4.5MB, and the platform rejects a bigger one before any
 * of our code runs - so there is no JSON error to read, nothing in the logs,
 * and the page just hangs and resets. Going direct to storage removes the
 * ceiling and that whole class of silent failure with it.
 */
export async function uploadCompanyFile(opts: {
  file: File | Blob
  name: string
  category: string
  filledFromId?: string | null
  /** Called with 'signing' | 'uploading' | 'saving' so the UI can say where it is. */
  onStage?: (stage: 'signing' | 'uploading' | 'saving') => void
}): Promise<{ file: any }> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const auth = session?.access_token ?? ''
  const type = (opts.file as File).type || 'application/octet-stream'
  const size = opts.file.size

  opts.onStage?.('signing')
  const urlRes = await fetch('/api/files/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
    body: JSON.stringify({ name: opts.name, size }),
  })
  const urlText = await urlRes.text()
  let urlJson: any = {}
  try { urlJson = JSON.parse(urlText) } catch { urlJson = { error: urlText.slice(0, 200) } }
  if (!urlRes.ok) throw new Error(urlJson.error ?? `Could not start the upload (${urlRes.status})`)

  opts.onStage?.('uploading')
  const { error: upErr } = await supabase.storage
    .from(urlJson.bucket)
    .uploadToSignedUrl(urlJson.path, urlJson.token, opts.file, { contentType: type })
  if (upErr) throw new Error(upErr.message || 'The upload did not finish')

  opts.onStage?.('saving')
  const saveRes = await fetch('/api/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
    body: JSON.stringify({
      storage_path: urlJson.path,
      name: opts.name,
      category: opts.category,
      file_type: type,
      size,
      ...(opts.filledFromId ? { filled_from_id: opts.filledFromId } : {}),
    }),
  })
  const saveText = await saveRes.text()
  let saveJson: any = {}
  try { saveJson = JSON.parse(saveText) } catch { saveJson = { error: saveText.slice(0, 200) } }
  if (!saveRes.ok) throw new Error(saveJson.error ?? `Could not save the file (${saveRes.status})`)
  return saveJson
}
