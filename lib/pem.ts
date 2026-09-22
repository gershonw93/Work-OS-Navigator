// A private key that survived being pasted into a web form. Shared by the
// Apple sender (lib/push.ts) and the Google one (lib/fcm.ts).

/**
 * A .p8 that survived being pasted into a web form.
 *
 * THE BUG. Send test answered `error:1E08010C:DECODER routines::unsupported`.
 * That is OpenSSL, not Apple - Node could not parse the key, so nothing was
 * ever sent. A PEM is only valid WITH its line breaks, and a dashboard field
 * eats them: paste a .p8 into Vercel and the newlines come back as spaces, or
 * as nothing at all, or as the two characters backslash-n. All three produce
 * that same error, and the codebase already knew it - it is exactly why the
 * Codemagic signing certificate is carried base64-encoded.
 *
 * So the key is rebuilt rather than trusted: take whatever base64 is in there,
 * throw away every character that is not base64, and re-wrap it at 64 columns
 * with its header. Handles escaped newlines, lost newlines, a PEM that has
 * itself been base64'd to get through a form in one line, and a bare body with
 * no header at all.
 *
 * The label is preserved when there is one. An EC key in SEC1 form says
 * "BEGIN EC PRIVATE KEY" and relabelling it PKCS#8 would break it.
 */
export function normalizePrivateKey(raw: string | undefined | null): string {
  let text = String(raw ?? '').trim()
  if (!text) return ''
  text = text.replace(/\\r\\n|\\n|\\r/g, '\n')

  // A whole PEM, base64'd again to get it through a single-line field.
  if (!/-----BEGIN/.test(text) && /^[A-Za-z0-9+/=\s]+$/.test(text)) {
    try {
      const decoded = Buffer.from(text.replace(/\s+/g, ''), 'base64').toString('utf8')
      if (/-----BEGIN/.test(decoded)) text = decoded.replace(/\\n/g, '\n')
    } catch { /* it was not that; carry on with the original */ }
  }

  const m = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/.exec(text)
  const label = m ? m[1] : 'PRIVATE KEY'
  const body = (m ? m[2] : text).replace(/[^A-Za-z0-9+/=]/g, '')
  if (!body) return ''
  return `-----BEGIN ${label}-----\n${(body.match(/.{1,64}/g) ?? []).join('\n')}\n-----END ${label}-----\n`
}

