'use client'

// ─────────────────────────────────────────────────────────────────────────────
// A phone photo, made small enough to send.
//
// Reported as "the save button took a while" on Add Permit. Nothing was being
// re-cached: a phone camera picture is 3-6 MB, and the permit form sent the
// SAME full-size picture twice - once for the AI to read it, and again on Save
// to store it - over a cellular connection, with the dialog waiting on the
// second trip. A permit, a letter or a receipt reads perfectly at 2000px on
// its long side, which is a few hundred KB as a JPEG.
//
// Images only. A PDF is passed through untouched - it is usually small, and
// re-encoding one would mean rasterising it. Anything the browser cannot
// decode (an odd format, a corrupt file) also comes back as it was: a slow
// upload is better than a lost one.
// ─────────────────────────────────────────────────────────────────────────────

/** Long side, in pixels, after shrinking. Readable for a permit or a letter, and by the AI reader. */
export const MAX_IMAGE_SIDE = 2000
/** Below this a file is sent as it is - shrinking a small image saves nothing worth the work. */
export const SHRINK_ABOVE_BYTES = 600 * 1024

const SHRINKABLE = /^image\/(jpeg|jpg|png|webp|heic|heif)$/i

/** The size a picture should be drawn at: the long side capped, the shape kept. */
export function fitWithin(width: number, height: number, max = MAX_IMAGE_SIDE): { width: number; height: number } {
  const long = Math.max(width, height)
  if (long <= max) return { width, height }
  const scale = max / long
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

export async function shrinkImage(file: File): Promise<File> {
  if (typeof window === 'undefined') return file
  if (!SHRINKABLE.test(file.type) || file.size <= SHRINK_ABOVE_BYTES) return file
  try {
    // `from-image` applies the camera's rotation, or a portrait permit is
    // stored on its side.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
    const { width, height } = fitWithin(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) { bitmap.close(); return file }
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.82))
    if (!blob || blob.size >= file.size) return file
    const name = file.name.replace(/\.(heic|heif|png|webp|jpe?g)$/i, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    return file
  }
}

export function shrinkImages(files: File[]): Promise<File[]> {
  return Promise.all(files.map(shrinkImage))
}
