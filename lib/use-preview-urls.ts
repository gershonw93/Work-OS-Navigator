import { useEffect, useRef, useState } from 'react'

/**
 * Thumbnail URLs for a set of picked files, without copying the files.
 *
 * WHY THIS EXISTS. Daily Logs previewed photos with FileReader.readAsDataURL,
 * which turns every image into a base64 STRING held in React state. Base64 is
 * about 1.37x the binary, and a JS string is UTF-16, so each photo cost roughly
 * 2.7x its own size in RAM on top of the File itself - and then rendering it as
 * <img src="data:..."> made the browser decode a full-resolution bitmap besides
 * (a 12MP photo is ~48MB decoded).
 *
 * Twenty photos off a phone is comfortably a gigabyte. That thrashes swap, and
 * a machine in swap stops responding - which is why this showed up as "pressing
 * upload freezes my entire computer" rather than as a slow page.
 *
 * An object URL is a pointer to the blob the browser already has. No copy, no
 * base64, no second representation to keep in sync.
 *
 * It also fixes an ordering bug: readAsDataURL results arrived in COMPLETION
 * order and were pushed onto a parallel array, so a big photo finishing after a
 * small one put the wrong thumbnail against the wrong file. Deriving the URLs
 * from the file list means they cannot drift apart.
 */
export function usePreviewUrls(files: File[]): string[] {
  // Keyed by the File object itself, so the same file keeps the same URL across
  // renders and only genuinely-removed ones get revoked.
  const cache = useRef(new Map<File, string>())
  const [, force] = useState(0)

  useEffect(() => {
    const map = cache.current
    let changed = false

    for (const f of files) {
      if (!map.has(f)) {
        map.set(f, URL.createObjectURL(f))
        changed = true
      }
    }
    const live = new Set(files)
    for (const [f, url] of Array.from(map.entries())) {
      if (!live.has(f)) {
        // Without this every removed photo leaks its blob for the life of the
        // page - the original inline URL.createObjectURL(f) in render leaked
        // one per render.
        URL.revokeObjectURL(url)
        map.delete(f)
        changed = true
      }
    }
    if (changed) force(n => n + 1)
  }, [files])

  useEffect(() => {
    const map = cache.current
    return () => {
      for (const url of Array.from(map.values())) URL.revokeObjectURL(url)
      map.clear()
    }
  }, [])

  return files.map(f => cache.current.get(f) ?? '')
}
