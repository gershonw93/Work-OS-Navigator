'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Plus, Trash2, Loader2, ChevronLeft, ChevronRight, Type, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  baselineFor, leftFor, sanitizeForPdf, hasUnsupportedChars, filledName,
  LINE_HEIGHT_RATIO, type FillBox,
} from '@/lib/pdf-fill'

interface PageInfo { width: number; height: number; rotation: number }

let boxSeq = 0
const nextId = () => `b${++boxSeq}`

/**
 * Type text onto a PDF and save a filled copy.
 *
 * For the pile of one-page forms that currently get printed, filled by hand and
 * rescanned - permit applications, supplier credit apps, W-9s.
 *
 * This is not a signature tool and offers nothing shaped like one. See the note
 * at the top of lib/pdf-fill.ts for why that line is worth holding.
 */
export function PdfFiller({
  fileUrl,
  fileName,
  onCancel,
  onSave,
}: {
  fileUrl: string
  fileName: string
  onCancel: () => void
  /** Given the filled bytes and a suggested name; resolves when stored. */
  onSave: (bytes: Uint8Array, name: string) => Promise<void>
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const docRef = useRef<any>(null)
  const bytesRef = useRef<ArrayBuffer | null>(null)

  const [pageIndex, setPageIndex] = useState(0)
  const [pageCount, setPageCount] = useState(0)
  const [pages, setPages] = useState<PageInfo[]>([])
  const [boxes, setBoxes] = useState<FillBox[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [size, setSize] = useState(11)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [rendering, setRendering] = useState(false)
  /** Live pixel size of the rendered page, for placing the overlay. */
  const [stage, setStage] = useState({ w: 0, h: 0 })

  // Load the document once. The bytes are kept because pdf-lib needs them
  // again at save time and re-fetching a signed URL can fail later.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(fileUrl)
        if (!res.ok) throw new Error(`Could not load the file (${res.status})`)
        const buf = await res.arrayBuffer()
        if (cancelled) return
        bytesRef.current = buf
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        // pdfjs takes ownership of the buffer it is given, so hand it a copy
        // and keep ours intact for pdf-lib.
        const doc = await pdfjs.getDocument({ data: buf.slice(0) }).promise
        if (cancelled) return
        docRef.current = doc
        const infos: PageInfo[] = []
        for (let i = 1; i <= doc.numPages; i++) {
          const p = await doc.getPage(i)
          const vp = p.getViewport({ scale: 1 })
          infos.push({ width: vp.width, height: vp.height, rotation: p.rotate ?? 0 })
        }
        if (cancelled) return
        setPages(infos)
        setPageCount(doc.numPages)
        setLoading(false)
      } catch (e: any) {
        if (!cancelled) { setError(e?.message ?? 'Could not open this PDF'); setLoading(false) }
      }
    })()
    return () => { cancelled = true }
  }, [fileUrl])

  // Draw the current page, sized to fit the stage.
  const draw = useCallback(async () => {
    const doc = docRef.current
    const canvas = canvasRef.current
    const holder = stageRef.current
    if (!doc || !canvas || !holder) return
    setRendering(true)
    try {
      const page = await doc.getPage(pageIndex + 1)
      const base = page.getViewport({ scale: 1 })
      const avail = holder.clientWidth || 800
      // Fit the width, and never blow past a sensible height on a phone.
      const scale = Math.min(avail / base.width, (window.innerHeight * 0.72) / base.height)
      const vp = page.getViewport({ scale: Math.max(scale, 0.2) })
      canvas.width = Math.floor(vp.width * (window.devicePixelRatio || 1))
      canvas.height = Math.floor(vp.height * (window.devicePixelRatio || 1))
      canvas.style.width = `${Math.floor(vp.width)}px`
      canvas.style.height = `${Math.floor(vp.height)}px`
      const ctx = canvas.getContext('2d')!
      ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0)
      await page.render({ canvasContext: ctx, viewport: vp }).promise
      setStage({ w: Math.floor(vp.width), h: Math.floor(vp.height) })
    } finally {
      setRendering(false)
    }
  }, [pageIndex])

  useEffect(() => { if (!loading && !error) draw() }, [loading, error, draw])
  useEffect(() => {
    const onResize = () => { if (!loading && !error) draw() }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [loading, error, draw])

  const info = pages[pageIndex]
  // A rotated page would need its coordinates mapped through the rotation, and
  // placing text a quarter-turn out is worse than saying so. Rare on the forms
  // this is for; noted rather than silently wrong.
  const rotated = !!info && info.rotation % 360 !== 0

  const pageBoxes = boxes.filter(b => b.page === pageIndex)
  const active = boxes.find(b => b.id === activeId) ?? null
  const lostChars = boxes.some(b => hasUnsupportedChars(b.text))

  /** Screen pixels per PDF point on the page as currently drawn. */
  const pxPerPt = info && stage.w ? stage.w / info.width : 1

  function addBoxAt(clientX: number, clientY: number) {
    const canvas = canvasRef.current
    if (!canvas || rotated) return
    const r = canvas.getBoundingClientRect()
    const x = (clientX - r.left) / r.width
    const y = (clientY - r.top) / r.height
    if (x < 0 || x > 1 || y < 0 || y > 1) return
    const box: FillBox = { id: nextId(), page: pageIndex, x, y, text: '', size }
    setBoxes(prev => [...prev, box])
    setActiveId(box.id)
  }

  function update(id: string, patch: Partial<FillBox>) {
    setBoxes(prev => prev.map(b => (b.id === id ? { ...b, ...patch } : b)))
  }
  function remove(id: string) {
    setBoxes(prev => prev.filter(b => b.id !== id))
    setActiveId(null)
  }

  // Dragging a box. Pointer events cover mouse and touch with one path.
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null)
  function onHandleDown(e: React.PointerEvent, box: FillBox) {
    e.preventDefault(); e.stopPropagation()
    const canvas = canvasRef.current
    if (!canvas) return
    const r = canvas.getBoundingClientRect()
    drag.current = {
      id: box.id,
      dx: (e.clientX - r.left) / r.width - box.x,
      dy: (e.clientY - r.top) / r.height - box.y,
    }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    setActiveId(box.id)
  }
  function onHandleMove(e: React.PointerEvent) {
    const d = drag.current
    const canvas = canvasRef.current
    if (!d || !canvas) return
    const r = canvas.getBoundingClientRect()
    const x = Math.min(Math.max((e.clientX - r.left) / r.width - d.dx, 0), 1)
    const y = Math.min(Math.max((e.clientY - r.top) / r.height - d.dy, 0), 1)
    update(d.id, { x, y })
  }
  function onHandleUp() { drag.current = null }

  async function save() {
    const bytes = bytesRef.current
    if (!bytes) return
    const filled = boxes.filter(b => b.text.trim())
    if (!filled.length) { setError('Add some text first - click the page where you want it.'); return }
    setSaving(true); setError('')
    try {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
      const pdf = await PDFDocument.load(bytes.slice(0))
      const font = await pdf.embedFont(StandardFonts.Helvetica)
      const docPages = pdf.getPages()

      for (const box of filled) {
        const page = docPages[box.page]
        if (!page) continue
        const { width, height } = page.getSize()
        const lines = sanitizeForPdf(box.text).split('\n')
        lines.forEach((line, i) => {
          if (!line) return
          page.drawText(line, {
            x: leftFor(box, width),
            y: baselineFor(box, height, i),
            size: box.size,
            font,
            color: rgb(0, 0, 0),
          })
        })
      }

      const out = await pdf.save()
      await onSave(out, filledName(fileName))
    } catch (e: any) {
      setError(e?.message ?? 'Could not save the filled copy')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/85">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-panel border-b border-line">
        <p className="text-sm font-semibold text-ink truncate flex-1 min-w-0">
          Fill in <span className="text-muted-fg font-normal">{fileName}</span>
        </p>

        <div className="flex items-center gap-1 rounded-lg border border-line px-1.5 py-1">
          <Type className="h-3.5 w-3.5 text-faint" />
          <button type="button" onClick={() => { setSize(s => Math.max(6, s - 1)); if (active) update(active.id, { size: Math.max(6, active.size - 1) }) }}
            className="px-1.5 text-sm text-muted-fg hover:text-ink" aria-label="Smaller text">−</button>
          <span className="text-xs tabular-nums text-ink-soft w-5 text-center">{active?.size ?? size}</span>
          <button type="button" onClick={() => { setSize(s => Math.min(48, s + 1)); if (active) update(active.id, { size: Math.min(48, active.size + 1) }) }}
            className="px-1.5 text-sm text-muted-fg hover:text-ink" aria-label="Bigger text">+</button>
        </div>

        {pageCount > 1 && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setPageIndex(i => Math.max(0, i - 1))} disabled={pageIndex === 0}
              className="p-1.5 rounded text-muted-fg hover:text-ink disabled:opacity-30" aria-label="Previous page">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-muted-fg tabular-nums">{pageIndex + 1} / {pageCount}</span>
            <button type="button" onClick={() => setPageIndex(i => Math.min(pageCount - 1, i + 1))} disabled={pageIndex >= pageCount - 1}
              className="p-1.5 rounded text-muted-fg hover:text-ink disabled:opacity-30" aria-label="Next page">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        <button type="button" onClick={onCancel} disabled={saving}
          className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-muted-fg hover:bg-surface disabled:opacity-50">
          Cancel
        </button>
        <button type="button" onClick={save} disabled={saving || loading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink hover:opacity-90 disabled:opacity-50">
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Save filled copy'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className="p-1.5 text-faint hover:text-ink" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="px-3 py-1.5 bg-panel border-b border-line-soft space-y-1">
        <p className="text-xs text-faint">
          Click anywhere on the page to add text. Drag the handle to move it. This types text onto the
          document - it is not a signature.
        </p>
        {lostChars && (
          <p className="text-xs text-warn flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Some characters can&apos;t be written into a PDF (emoji or non-Latin text) and will be left out.
          </p>
        )}
        {rotated && (
          <p className="text-xs text-warn flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            This page is rotated, so text can&apos;t be placed on it accurately yet. Other pages are fine.
          </p>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>

      <div ref={stageRef} className="flex-1 overflow-auto p-3 flex justify-center items-start">
        {loading ? (
          <p className="text-sm text-white/70 py-16 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Opening…</p>
        ) : (
          <div className="relative" style={{ width: stage.w || undefined }}>
            <canvas
              ref={canvasRef}
              onClick={e => addBoxAt(e.clientX, e.clientY)}
              className={cn('block rounded shadow-lg bg-white', !rotated && 'cursor-text')}
            />
            {rendering && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50">
                <Loader2 className="h-5 w-5 animate-spin text-ink" />
              </div>
            )}

            {pageBoxes.map(box => (
              <div
                key={box.id}
                className={cn('absolute group', activeId === box.id ? 'z-20' : 'z-10')}
                style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%` }}
              >
                <textarea
                  value={box.text}
                  onChange={e => update(box.id, { text: e.target.value })}
                  onFocus={() => setActiveId(box.id)}
                  rows={Math.max(1, box.text.split('\n').length)}
                  placeholder="Type…"
                  spellCheck={false}
                  className={cn(
                    'resize-none overflow-hidden bg-transparent text-black outline-none px-0 py-0 border',
                    activeId === box.id ? 'border-accent bg-accent-tint/40' : 'border-transparent hover:border-line',
                  )}
                  style={{
                    // Matches lib/pdf-fill: no half-leading, 1.2 line spacing.
                    fontFamily: 'Helvetica, Arial, sans-serif',
                    fontSize: `${box.size * pxPerPt}px`,
                    lineHeight: LINE_HEIGHT_RATIO,
                    width: `${Math.max(6, ...box.text.split('\n').map(l => l.length + 3)) * box.size * pxPerPt * 0.55}px`,
                  }}
                />
                <button
                  type="button"
                  onPointerDown={e => onHandleDown(e, box)}
                  onPointerMove={onHandleMove}
                  onPointerUp={onHandleUp}
                  title="Drag to move"
                  className="absolute -left-4 top-0 h-4 w-4 rounded-full bg-accent text-accent-ink text-[9px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-move touch-none"
                >
                  ✥
                </button>
                <button
                  type="button"
                  onClick={() => remove(box.id)}
                  title="Remove this text"
                  className="absolute -right-4 top-0 h-4 w-4 rounded-full bg-danger text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100"
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-3 py-2 bg-panel border-t border-line flex items-center justify-between gap-3">
        <p className="text-xs text-faint">
          {boxes.filter(b => b.text.trim()).length} block{boxes.filter(b => b.text.trim()).length === 1 ? '' : 's'} of text
        </p>
        <p className="text-xs text-faint flex items-center gap-1.5">
          <Plus className="h-3 w-3" /> Saves as a new file - the original is left as it is
        </p>
      </div>
    </div>
  )
}
