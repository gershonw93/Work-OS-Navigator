/**
 * What a downloaded plan is called on somebody's computer.
 *
 * WHY IT IS A MODULE. Asked as "how can I download the file from the system" -
 * the only way out was "Open the file", which hands the PDF to whatever the
 * device thinks opens PDFs (Adobe, usually), and a copy then has to be saved
 * from inside that app. A Download button saves the original instead, and the
 * one thing it has to get right is the NAME: the stored object is called
 * `1731247123456-A-101_Floor_plan.pdf` (a timestamp so two uploads of one name
 * cannot collide, and characters a URL dislikes replaced), which is ours, not
 * theirs. The name the person gave the plan in SyteNav is what they will look
 * for in Downloads, and the extension comes off the stored file because a name
 * like "Foundation" says nothing about whether it is a PDF or a photo.
 */

/** The extension of the stored file, lower-cased, without the dot. Null if none. */
export function storedExtension(pathOrUrl: string | null | undefined): string | null {
  const bare = String(pathOrUrl ?? '').split(/[?#]/)[0]
  const last = bare.split('/').pop() ?? ''
  const m = /\.([a-z0-9]{1,8})$/i.exec(last)
  return m ? m[1].toLowerCase() : null
}

/** The stored basename with the upload timestamp taken back off. */
function storedBase(pathOrUrl: string | null | undefined): string {
  const bare = String(pathOrUrl ?? '').split(/[?#]/)[0]
  let last = bare.split('/').pop() ?? ''
  try { last = decodeURIComponent(last) } catch { /* leave it as it is */ }
  return last.replace(/^\d{10,}-/, '')
}

/**
 * The filename for a download: the plan's own name, made safe for every file
 * system a GC might be on (Windows refuses `\ / : * ? " < > |`), with the
 * stored file's extension. Falls back to the stored name, then to "plan".
 */
export function planDownloadName(planName: string | null | undefined, pathOrUrl: string | null | undefined): string {
  const ext = storedExtension(pathOrUrl)
  const clean = (s: string) => s
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 120)
    .trim()

  let base = clean(String(planName ?? ''))
  if (!base) base = clean(storedBase(pathOrUrl).replace(/\.[a-z0-9]{1,8}$/i, ''))
  if (!base) base = 'plan'
  if (!ext) return base
  // A plan named "A-101.pdf" should not download as "A-101.pdf.pdf".
  return base.toLowerCase().endsWith(`.${ext}`) ? base : `${base}.${ext}`
}

/**
 * A Content-Disposition header for that name. `filename` is the ASCII
 * fallback older clients read; `filename*` carries the real name in UTF-8, so
 * "Sótano" is not mangled for everybody else.
 */
export function attachmentHeader(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}
