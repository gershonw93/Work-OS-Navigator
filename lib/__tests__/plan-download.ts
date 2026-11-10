// "how can I download the file from the system" - plans could only be OPENED,
// which hands the PDF to the device's PDF app. The Download button saves the
// original, named after the plan rather than after the stored object.

import { planDownloadName, attachmentHeader, storedExtension } from '../plan-download'
import { ok, done, code } from './_helpers'

// ── the name ─────────────────────────────────────────────────────────────────
ok(planDownloadName('A-101 Floor plan', 'proj/1731247123456-A-101_Floor_plan.pdf') === 'A-101 Floor plan.pdf',
  'the plan\'s own name, with the stored extension')
ok(planDownloadName('A-101.pdf', 'proj/1731247123456-A-101.pdf') === 'A-101.pdf',
  'a name that already ends in the extension does not get it twice')
ok(planDownloadName('', 'proj/folder/1731247123456-Site_survey.PDF') === 'Site_survey.pdf',
  'no plan name falls back to the stored name with the timestamp taken off')
ok(planDownloadName('Level 2: framing / east', 'p/1731247123456-x.pdf') === 'Level 2 framing east.pdf',
  'characters Windows refuses are removed')
ok(planDownloadName('Photo', 'https://x.supabase.co/storage/v1/object/sign/plans/p/17312-a.jpg?token=abc') === 'Photo.jpg',
  'a signed URL\'s query string is not part of the extension')
ok(planDownloadName(null, null) === 'plan', 'nothing at all still downloads as something')
ok(storedExtension('a/b/c') === null, 'no extension is null, not a guess')

// ── the header ───────────────────────────────────────────────────────────────
const h = attachmentHeader('Sótano "B".pdf')
ok(h.startsWith('attachment;'), 'an attachment, so the browser saves rather than opens')
ok(h.includes(`filename*=UTF-8''${encodeURIComponent('Sótano "B".pdf')}`), 'the real name travels in filename*')
ok(!/filename="[^"]*"[^;]*"/.test(h) && !h.includes('ó"'), 'the ASCII fallback has no stray quote or non-ASCII')

// ── the route and the button ─────────────────────────────────────────────────
const route = code('app/api/projects/[id]/plans/[planId]/file/route.ts')
ok(/createSignedUrl\([\s\S]{0,120}download \? \{ download: filename \}/.test(route),
  'a stored plan is signed WITH the download name when one is asked for')
ok(route.includes("'Content-Disposition': attachmentHeader(filename)"),
  'a file from somewhere else is streamed back as an attachment')
ok(!/searchParams\.get\('id'\)/.test(route), 'no ?id= under an [id] folder - Vercel drops it')
ok(route.indexOf('actorJobGate') < route.indexOf("get('download')"),
  'the download is behind the same job gate as viewing')

const page = code('app/(dashboard)/projects/[id]/plans/[planId]/page.tsx')
ok(/href=\{downloadSrc\} download/.test(page), 'the web button is a download link to the route')
ok(page.includes('Browser.open') && page.includes('&link=1'),
  'the iOS app opens the signed link in the system browser, which has somewhere to save it')
ok(/aria-label="Download the file"/.test(page), 'the icon-only button is labelled')

done()
