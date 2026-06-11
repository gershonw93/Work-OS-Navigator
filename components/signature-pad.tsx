'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface SignaturePadProps {
  onSign: (dataUrl: string, name: string) => void
  onCancel: () => void
}

export function SignaturePad({ onSign, onCancel }: SignaturePadProps) {
  const [tab, setTab] = useState<'type' | 'draw'>('type')
  const [typedName, setTypedName] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)

  // ── Draw tab helpers ──────────────────────────────────────────
  const getCanvas = () => canvasRef.current
  const getCtx = () => canvasRef.current?.getContext('2d') ?? null

  function setupCanvas() {
    const canvas = getCanvas()
    if (!canvas) return
    const ctx = getCtx()
    if (!ctx) return
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }

  useEffect(() => { setupCanvas() }, [tab])

  function posFromEvent(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null {
    const canvas = getCanvas()
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      const touch = e.touches[0]
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    const pos = posFromEvent(e)
    if (!pos) return
    setIsDrawing(true)
    lastPos.current = pos
    const ctx = getCtx()
    if (ctx) {
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
    }
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    if (!isDrawing) return
    const pos = posFromEvent(e)
    if (!pos) return
    const ctx = getCtx()
    if (!ctx || !lastPos.current) return
    ctx.beginPath()
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPos.current = pos
    setHasDrawn(true)
  }

  function endDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    setIsDrawing(false)
    lastPos.current = null
  }

  function clearCanvas() {
    const canvas = getCanvas()
    const ctx = getCtx()
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
    setupCanvas()
  }

  // ── Sign ─────────────────────────────────────────────────────
  function handleDone() {
    if (tab === 'type') {
      if (!typedName.trim()) return
      // Render typed name to canvas
      const offscreen = document.createElement('canvas')
      offscreen.width = 600
      offscreen.height = 160
      const ctx = offscreen.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, offscreen.width, offscreen.height)
      ctx.fillStyle = '#1e293b'
      ctx.font = '64px cursive'
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'center'
      ctx.fillText(typedName, offscreen.width / 2, offscreen.height / 2)
      onSign(offscreen.toDataURL('image/png'), typedName)
    } else {
      const canvas = getCanvas()
      if (!canvas || !hasDrawn) return
      onSign(canvas.toDataURL('image/png'), 'drawn-signature')
    }
  }

  const typeReady = tab === 'type' && typedName.trim().length > 0
  const drawReady = tab === 'draw' && hasDrawn

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {(['type', 'draw'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-5 py-2.5 text-sm font-medium transition-colors capitalize',
              tab === t
                ? 'border-b-2 border-orange-500 text-orange-600'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {t === 'type' ? 'Type' : 'Draw'}
          </button>
        ))}
      </div>

      {/* Type tab */}
      {tab === 'type' && (
        <div className="space-y-3 px-1">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Your full name</label>
            <input
              autoFocus
              type="text"
              placeholder="e.g. Jane Smith"
              value={typedName}
              onChange={e => setTypedName(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
          {/* Signature preview */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 min-h-[80px] flex items-center justify-center px-4 py-3">
            {typedName.trim() ? (
              <span
                className="text-slate-800 text-4xl leading-none select-none"
                style={{ fontFamily: 'cursive' }}
              >
                {typedName}
              </span>
            ) : (
              <span className="text-slate-300 text-sm">Your signature will appear here</span>
            )}
          </div>
        </div>
      )}

      {/* Draw tab */}
      {tab === 'draw' && (
        <div className="space-y-2 px-1">
          <p className="text-xs text-slate-500">Draw your signature below using mouse or touch.</p>
          <div className="rounded-lg border-2 border-slate-300 bg-white overflow-hidden touch-none">
            <canvas
              ref={canvasRef}
              width={600}
              height={160}
              className="w-full block"
              style={{ height: '120px', cursor: 'crosshair' }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={clearCanvas}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!typeReady && !drawReady}
          onClick={handleDone}
        >
          Sign
        </Button>
      </div>
    </div>
  )
}
