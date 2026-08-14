import { createClient } from '@/lib/supabase/client'

/**
 * Put a drawing straight into storage, then record it as a plan.
 *
 * NEVER post the bytes through /api/projects/[id]/plans/upload as multipart. A
 * serverless function caps the request body at about 4.5MB and the platform
 * rejects a bigger one before any of our code runs - no JSON error, nothing in
 * the logs, the page simply hangs. Plans are the likeliest thing in the whole
 * app to be large, so that ceiling hurt most exactly here.
 */
export async function uploadPlan(opts: {
  projectId: string
  file: File
  name: string
  planType: string
  folderId?: string | null
  onStage?: (stage: 'signing' | 'uploading' | 'saving') => void
}): Promise<{ plan: any }> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const auth = session?.access_token ?? ''
  const type = opts.file.type || 'application/octet-stream'

  opts.onStage?.('signing')
  const urlRes = await fetch(`/api/projects/${opts.projectId}/plans/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
    body: JSON.stringify({ name: opts.file.name, size: opts.file.size, folder_id: opts.folderId ?? null }),
  })
  const urlJson = await readJson(urlRes)
  if (!urlRes.ok) throw new Error(urlJson.error ?? `Could not start the upload (${urlRes.status})`)

  opts.onStage?.('uploading')
  const { error: upErr } = await supabase.storage
    .from(urlJson.bucket)
    .uploadToSignedUrl(urlJson.path, urlJson.token, opts.file, { contentType: type })
  if (upErr) throw new Error(upErr.message || 'The upload did not finish')

  opts.onStage?.('saving')
  const saveRes = await fetch(`/api/projects/${opts.projectId}/plans/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
    body: JSON.stringify({
      storage_path: urlJson.path,
      name: opts.name,
      plan_type: opts.planType,
      folder_id: opts.folderId ?? null,
    }),
  })
  const saveJson = await readJson(saveRes)
  if (!saveRes.ok) throw new Error(saveJson.error ?? `Could not save the plan (${saveRes.status})`)
  return saveJson
}

/** A non-JSON body here is a platform error page, so surface a readable slice. */
async function readJson(res: Response): Promise<any> {
  const text = await res.text()
  try { return JSON.parse(text) } catch { return { error: text.slice(0, 200) } }
}

/** Guess the drawing type from the file name, so five files are not five dropdowns. */
export function guessPlanType(fileName: string): string {
  const n = fileName.toLowerCase()
  if (/\b(a-?\d|arch|floor|elev|plan set)/.test(n)) return 'architectural'
  if (/\b(s-?\d|struct|framing|found)/.test(n)) return 'structural'
  if (/\b(m-?\d|e-?\d|p-?\d|mep|mech|elec|plumb|hvac)/.test(n)) return 'mep'
  if (/\b(c-?\d|civil|grading|site|survey|util)/.test(n)) return 'civil'
  if (/\b(l-?\d|landscap|planting|irrig)/.test(n)) return 'landscape'
  return 'architectural'
}

/** Strip the extension for the display name. */
export function baseName(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '')
}
