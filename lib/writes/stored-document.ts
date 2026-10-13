import type { SupabaseClient } from '@supabase/supabase-js'
import { appOrigin } from '@/lib/app-url'

// ─────────────────────────────────────────────────────────────────────────────
// A document handed over through Claude, checked and stored the way the place
// it is going to stores its own uploads.
//
// The same rules `create_sub_bill` has carried since phase 3 (its copy lives
// in lib/mcp/write-tools.ts): a PDF or a photo, no more than 3MB once decoded -
// Vercel refuses a request body near 4.5MB before any of our code runs, and
// base64 adds a third - and a SENTENCE when it is too big that says where the
// person can drop the original instead. Every destination differs only in the
// bucket and the path, and those are the destination's own upload route's
// choices, copied rather than invented:
//
//   compliance     submittals/compliance/<company>/<type>-<ts>-<name>   (the sub's upload link)
//   company files  company-files/<company>/<ts>-<name>                   (Files -> Upload)
//   plans          plans/<project>/[<folder>/]<ts>-<name>                (Plans -> Upload)
//
// The attachment is ALWAYS optional at the tool: Claude often cannot hand over
// the bytes of a file it was shown, so every tool that takes one also answers
// with the in-app page where the person can drop it (`attachUrl`).
// ─────────────────────────────────────────────────────────────────────────────

/** Vercel caps a request body near 4.5MB; base64 adds a third. */
export const MAX_DOCUMENT_BYTES = 3 * 1024 * 1024
export const DOCUMENT_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic']

/** Ten years, the lifetime every upload route in the app signs its URL for. */
const SIGNED_FOR = 60 * 60 * 24 * 365 * 10

/** The JSON schema for a `document` argument - one spelling for every tool. */
export const DOCUMENT_ARG = {
  type: 'object',
  description: 'The original file, when you have its bytes (PDF, PNG, JPEG, WebP or HEIC, 3MB at most). Optional: leave it out and the answer says where in SyteNav the person can drop the file.',
  properties: {
    filename: { type: 'string' },
    content_type: { type: 'string', enum: DOCUMENT_TYPES },
    data_base64: { type: 'string' },
  },
  required: ['filename', 'content_type', 'data_base64'],
  additionalProperties: false,
}

export interface ReadDocument {
  filename: string
  contentType: string
  bytes: Buffer
}

/**
 * Check a `document` argument WITHOUT storing it. Null when none was given -
 * that is the normal case, never an error. `where` names the page the person
 * can use instead, so the too-big sentence ends with somewhere to go. `allowed`
 * narrows the types where the destination's own screen takes fewer (Plans
 * reads PDF, PNG and JPEG).
 */
export function readDocument(
  doc: unknown, where: string, allowed: string[] = DOCUMENT_TYPES,
): ReadDocument | { problem: string } | null {
  if (doc == null) return null
  if (typeof doc !== 'object' || Array.isArray(doc)) return { problem: 'document must be an object with filename, content_type and data_base64.' }
  const d = doc as Record<string, unknown>
  const filename = (typeof d.filename === 'string' && d.filename.trim()) ? d.filename.trim() : 'document'
  const contentType = typeof d.content_type === 'string' ? d.content_type.trim().toLowerCase() : ''
  if (!allowed.includes(contentType)) {
    return { problem: allowed === DOCUMENT_TYPES ? 'Attach a PDF or a photo (PNG, JPEG, WebP or HEIC).' : `Attach one of: ${allowed.join(', ')}.` }
  }
  const b64 = typeof d.data_base64 === 'string' ? d.data_base64.replace(/^data:[^,]*,/, '') : ''
  const bytes = Buffer.from(b64, 'base64')
  if (!bytes.length) return { problem: 'The attached document is empty.' }
  if (bytes.length > MAX_DOCUMENT_BYTES) {
    return {
      problem: `That document is over ${MAX_DOCUMENT_BYTES / 1024 / 1024}MB, too big to send through Claude. ` +
        `Leave the document out and drop the file in on SyteNav instead: ${where}`,
    }
  }
  return { filename, contentType, bytes }
}

/** The leaf every upload route writes: unsafe characters out, the tail kept. */
export const safeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)

export type StoredDocument = { bucket: string; path: string; url: string }

/**
 * Put checked bytes where the destination keeps its files and sign the URL the
 * way it does. A failed upload is a sentence, never a record pointing at
 * nothing.
 */
export async function storeDocument(
  db: SupabaseClient, bucket: string, path: string, doc: ReadDocument,
): Promise<StoredDocument | { problem: string }> {
  const { error } = await db.storage.from(bucket).upload(path, doc.bytes, { contentType: doc.contentType, upsert: false })
  if (error) {
    console.error(`[writes] document upload to ${bucket}:`, error.message)
    return { problem: 'SyteNav could not store the document, so nothing was filed. Try again, or file it without the document.' }
  }
  const { data: signed, error: signError } = await db.storage.from(bucket).createSignedUrl(path, SIGNED_FOR)
  if (signError || !signed?.signedUrl) {
    console.error(`[writes] signing ${bucket}/${path}:`, signError?.message)
    await db.storage.from(bucket).remove([path])
    return { problem: 'SyteNav could not store the document, so nothing was filed. Try again, or file it without the document.' }
  }
  return { bucket, path, url: signed.signedUrl }
}

/** A stored file whose record was then refused goes too - an orphan is a file nobody can find. */
export async function discardDocument(db: SupabaseClient, stored: StoredDocument): Promise<void> {
  const { error } = await db.storage.from(stored.bucket).remove([stored.path])
  if (error) console.error(`[writes] removing an orphaned ${stored.bucket} document:`, error.message)
}

// ── where each destination keeps its files ──────────────────────────────────

export const compliancePath = (companyId: string, type: string, filename: string, now = Date.now()) =>
  `compliance/${companyId}/${type}-${now}-${safeFileName(filename)}`

export const companyFilePath = (companyId: string, filename: string, now = Date.now()) =>
  `${companyId}/${now}-${safeFileName(filename)}`

export const planPath = (projectId: string, folderId: string | null, filename: string, now = Date.now()) =>
  folderId ? `${projectId}/${folderId}/${now}-${safeFileName(filename)}` : `${projectId}/${now}-${safeFileName(filename)}`

// ── where the PERSON can drop the original ──────────────────────────────────

/**
 * The in-app page for a destination. Absolute, because it is read out of a
 * chat with Claude rather than clicked inside the app.
 */
export function attachUrl(path: string): string {
  return `${appOrigin()}${path.startsWith('/') ? path : `/${path}`}`
}
