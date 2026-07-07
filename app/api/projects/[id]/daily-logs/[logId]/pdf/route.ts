import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const SURVEY_QUESTIONS: { key: string; label: string }[] = [
  { key: 'accidents', label: 'Safety incidents' },
  { key: 'scheduled_delays', label: 'Schedule impacts' },
  { key: 'weather_delays', label: 'Weather impacts' },
  { key: 'visitors', label: 'Jobsite visitors' },
  { key: 'areas_blocked', label: 'Blocked / inaccessible areas' },
  { key: 'equipment_rented', label: 'Rental equipment on site' },
]

export async function GET(request: Request, { params }: { params: { id: string; logId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    || new URL(request.url).searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: log }, { data: project }, { data: projectSubs }] = await Promise.all([
    db.from('daily_logs')
      .select('*, daily_log_photos(*), daily_log_updates(*), daily_log_attachments(*)')
      .eq('id', params.logId).eq('project_id', params.id).single(),
    db.from('projects').select('name, address, gc_company_id').eq('id', params.id).single(),
    db.from('subcontracts').select('id, trade, companies(name)').eq('project_id', params.id),
  ])
  if (!log) return NextResponse.json({ error: 'Log not found' }, { status: 404 })
  const subNameById = new Map((projectSubs ?? []).map((s: any) => [s.id, s.companies?.name ?? s.trade ?? 'Sub']))

  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0.09, 0.094, 0.106)
  const muted = rgb(0.42, 0.44, 0.46)
  const accent = rgb(0.36, 0.55, 0.07)
  const margin = 50
  const width = 612
  const pageHeight = 792

  let page = pdf.addPage([width, pageHeight])
  let y = pageHeight - margin

  function ensure(space: number) {
    if (y - space < margin) { page = pdf.addPage([width, pageHeight]); y = pageHeight - margin }
  }
  function wrap(text: string, f: typeof font, size: number, maxW: number): string[] {
    const words = (text || '').split(/\s+/)
    const lines: string[] = []
    let cur = ''
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w
      if (f.widthOfTextAtSize(test, size) > maxW && cur) { lines.push(cur); cur = w }
      else cur = test
    }
    if (cur) lines.push(cur)
    return lines.length ? lines : ['']
  }
  function text(s: string, opts: { size?: number; f?: typeof font; color?: typeof ink; indent?: number } = {}) {
    const size = opts.size ?? 10
    const f = opts.f ?? font
    const color = opts.color ?? ink
    const x = margin + (opts.indent ?? 0)
    for (const line of wrap(s, f, size, width - margin * 2 - (opts.indent ?? 0))) {
      ensure(size + 4)
      page.drawText(line, { x, y, size, font: f, color })
      y -= size + 4
    }
  }
  function heading(s: string) {
    ensure(24)
    y -= 8
    page.drawText(s, { x: margin, y, size: 12, font: bold, color: accent })
    y -= 6
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.84) })
    y -= 12
  }
  function gap(n = 6) { y -= n }

  async function drawImage(url: string, maxW: number, maxH: number) {
    try {
      const res = await fetch(url)
      if (!res.ok) return
      const bytes = new Uint8Array(await res.arrayBuffer())
      const ct = res.headers.get('content-type') || ''
      const img = ct.includes('png') || url.toLowerCase().includes('.png')
        ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
      const scale = Math.min(maxW / img.width, maxH / img.height, 1)
      const w = img.width * scale, h = img.height * scale
      ensure(h + 6)
      page.drawImage(img, { x: margin, y: y - h, width: w, height: h })
      y -= h + 6
    } catch { /* skip unreadable images */ }
  }

  // Load + embed an image, return the pdf-lib image (or null)
  async function loadImg(url: string) {
    try {
      const res = await fetch(url)
      if (!res.ok) return null
      const bytes = new Uint8Array(await res.arrayBuffer())
      const ct = res.headers.get('content-type') || ''
      return ct.includes('png') || url.toLowerCase().includes('.png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
    } catch { return null }
  }

  // Grid of small thumbnails (6 per row) with a tag under each
  async function photoGrid(items: { url: string; tag?: string | null }[]) {
    const cols = 6
    const gap = 8
    const cellW = (width - margin * 2 - gap * (cols - 1)) / cols
    const imgH = cellW * 0.75
    const rowH = imgH + 14
    for (let i = 0; i < items.length; i += cols) {
      const row = items.slice(i, i + cols)
      const imgs = await Promise.all(row.map(it => loadImg(it.url)))
      ensure(rowH)
      const top = y
      row.forEach((it, c) => {
        const x = margin + c * (cellW + gap)
        const img = imgs[c]
        if (img) {
          const s = Math.min(cellW / img.width, imgH / img.height)
          const w = img.width * s, h = img.height * s
          page.drawImage(img, { x: x + (cellW - w) / 2, y: top - h, width: w, height: h })
        } else {
          page.drawRectangle({ x, y: top - imgH, width: cellW, height: imgH, color: rgb(0.93, 0.93, 0.92) })
        }
        if (it.tag) {
          let t = it.tag
          while (font.widthOfTextAtSize(t, 6) > cellW && t.length > 3) t = t.slice(0, -2)
          page.drawText(t, { x, y: top - imgH - 9, size: 6, font, color: muted })
        }
      })
      y = top - rowH
    }
    gap2(2)
  }
  function gap2(n: number) { y -= n }

  const dateStr = new Date(log.log_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  // Header — company logo top-right when the company has one uploaded
  if (project?.gc_company_id) {
    try {
      const { data: co } = await db.from('companies').select('logo_url').eq('id', project.gc_company_id).single()
      if (co?.logo_url) {
        const res = await fetch(co.logo_url)
        if (res.ok) {
          const bytes = new Uint8Array(await res.arrayBuffer())
          const ct = res.headers.get('content-type') || ''
          const img = ct.includes('png') || co.logo_url.toLowerCase().includes('.png')
            ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
          const maxH = 40, maxW = 140
          const scale = Math.min(maxH / img.height, maxW / img.width, 1)
          const w = img.width * scale, h = img.height * scale
          page.drawImage(img, { x: width - margin - w, y: y - h + 16, width: w, height: h })
        }
      }
    } catch { /* logo is decorative — never block the PDF */ }
  }
  page.drawText('Daily Log', { x: margin, y, size: 22, font: bold, color: ink }); y -= 26
  text(project?.name ?? 'Project', { size: 12, f: bold })
  if (project?.address) text(project.address, { size: 10, color: muted })
  text(dateStr, { size: 10, color: muted })
  if (log.weather) text(`Weather: ${log.weather}`, { size: 10, color: muted })
  text(`Workers on site: ${log.workers_onsite ?? 0}`, { size: 10, color: muted })

  // Subs on site + worker counts
  const subs = Array.isArray(log.subs_on_site) ? log.subs_on_site : []
  if (subs.length) {
    heading('Subcontractors On Site')
    for (const s of subs) {
      text(`${s.name}${s.workers ? ` — ${s.workers} worker${s.workers !== 1 ? 's' : ''}` : ''}`, { size: 10 })
    }
  }

  // General notes
  if (log.notes) { heading('General Notes'); text(log.notes) }

  // Daily survey
  heading('Daily Survey')
  for (const q of SURVEY_QUESTIONS) {
    const ans = (log.survey ?? {})[q.key] || {}
    const a = (ans.answer ?? 'na').toUpperCase()
    ensure(16)
    page.drawText(`${q.label}:`, { x: margin, y, size: 10, font: bold, color: ink })
    page.drawText(a === 'NA' ? 'N/A' : a, { x: margin + 200, y, size: 10, font, color: a === 'YES' ? accent : muted })
    y -= 14
    if (ans.description) text(ans.description, { size: 9, color: muted, indent: 12 })
  }

  if (log.safety_observation) { heading('Site Safety Observation'); text(log.safety_observation) }
  if (log.quality_observation) { heading('Quality Control Observation'); text(log.quality_observation) }

  // Updates timeline
  const updates = (log.daily_log_updates ?? []).sort((a: any, b: any) => a.created_at.localeCompare(b.created_at))
  if (updates.length) {
    heading('Updates Through the Day')
    for (const u of updates) {
      const t = new Date(u.created_at).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' })
      text(`${t}${u.created_by_name ? ' · ' + u.created_by_name : ''}`, { size: 9, f: bold, color: muted })
      text(u.body, { indent: 12 })
      gap(2)
    }
  }

  // Photos
  const photos = log.daily_log_photos ?? []
  if (photos.length) {
    heading(`Photos (${photos.length})`)
    // Group by subcontractor (then a General group for untagged)
    const groups = new Map<string, any[]>()
    for (const p of photos) {
      const key = p.subcontract_id ? (subNameById.get(p.subcontract_id) ?? 'Subcontractor') : 'General / Site'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(p)
    }
    for (const [groupName, groupPhotos] of Array.from(groups.entries())) {
      ensure(20)
      text(groupName, { size: 10, f: bold, color: ink })
      gap(2)
      await photoGrid(groupPhotos.map((p: any) => ({ url: p.photo_url, tag: [p.category, p.caption].filter(Boolean).join(' · ') || null })))
      gap(6)
    }
  }

  // Attachments
  const attachments = log.daily_log_attachments ?? []
  if (attachments.length) {
    heading('Attachments')
    for (const a of attachments) text(`• ${a.file_name ?? a.file_url}`, { size: 9, color: muted })
  }

  // Signature
  heading('Signature')
  if (log.signature_url) await drawImage(log.signature_url, 240, 90)
  if (log.signed_by_name) text(`Signed by: ${log.signed_by_name}`, { f: bold })
  if (log.signed_at) text(`Date: ${new Date(log.signed_at).toLocaleString('en-US')}`, { size: 9, color: muted })
  if (!log.signature_url && !log.signed_by_name) text('Not signed', { size: 9, color: muted })

  const bytes = await pdf.save()
  const fileName = `daily-log-${log.log_date}.pdf`
  return new NextResponse(bytes as any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}
