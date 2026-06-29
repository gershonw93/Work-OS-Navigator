'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Eraser } from 'lucide-react'

/**
 * Drawn signature pad (finger / mouse). Calls onChange with a PNG Blob when the
 * drawing changes, or null when cleared.
 */
export function SignaturePad({ onChange, className }: { onChange: (blob: Blob | null) => void; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const dirty = useRef(false)
  const [hasInk, setHasInk] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio
    const ctx = canvas.getContext('2d')!
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#16181B'
  }, [])

  function pos(e: React.PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  function start(e: React.PointerEvent) {
    drawing.current = true
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = pos(e)
    ctx.beginPath(); ctx.moveTo(x, y)
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = pos(e)
    ctx.lineTo(x, y); ctx.stroke()
    dirty.current = true
    if (!hasInk) setHasInk(true)
  }
  function end() {
    if (!drawing.current) return
    drawing.current = false
    if (dirty.current) canvasRef.current!.toBlob(b => onChange(b), 'image/png')
  }
  function clear() {
    const canvas = canvasRef.current!
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    dirty.current = false
    setHasInk(false)
    onChange(null)
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="relative rounded-lg border border-muted2 bg-panel">
        <canvas
          ref={canvasRef}
          className="w-full h-36 touch-none rounded-lg"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
        {!hasInk && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-faint">
            Sign here
          </span>
        )}
      </div>
      <button type="button" onClick={clear} className="inline-flex items-center gap-1 text-xs text-muted-fg hover:text-ink">
        <Eraser className="h-3.5 w-3.5" /> Clear
      </button>
    </div>
  )
}
