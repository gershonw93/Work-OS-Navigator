'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, X, RefreshCw, AlertTriangle } from 'lucide-react'

/**
 * Live camera capture (no file upload). Streams the device camera via
 * getUserMedia and captures a still frame to a Blob. Used for clock-in
 * selfies so the photo must be taken live, not chosen from the gallery.
 */
export function CameraCapture({
  onCapture,
  onClose,
  facing = 'user',
}: {
  onCapture: (blob: Blob) => void
  onClose: () => void
  facing?: 'user' | 'environment'
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [capturing, setCapturing] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera not supported on this device/browser.')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing }, audio: false,
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
          setReady(true)
        }
      } catch (err: any) {
        setError(err?.name === 'NotAllowedError'
          ? 'Camera permission denied. Enable it to clock in.'
          : 'Could not start the camera.')
      }
    }
    start()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [facing])

  function stop() {
    streamRef.current?.getTracks().forEach(t => t.stop())
  }

  function capture() {
    const video = videoRef.current
    if (!video || !ready) return
    setCapturing(true)
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 720
    canvas.height = video.videoHeight || 960
    const ctx = canvas.getContext('2d')!
    // Mirror the front camera so the still matches the live preview
    if (facing === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1) }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(blob => {
      setCapturing(false)
      if (blob) { stop(); onCapture(blob) }
    }, 'image/jpeg', 0.85)
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-4">
      <div className="bg-panel rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line-soft">
          <span className="text-sm font-semibold text-ink-soft flex items-center gap-2"><Camera className="h-4 w-4" /> Take a live photo</span>
          <button onClick={() => { stop(); onClose() }} className="text-faint hover:text-ink"><X className="h-5 w-5" /></button>
        </div>

        {error ? (
          <div className="p-8 text-center space-y-3">
            <AlertTriangle className="h-8 w-8 text-warn mx-auto" />
            <p className="text-sm text-muted-fg">{error}</p>
            <button onClick={() => { stop(); onClose() }} className="text-sm text-accent-fg hover:underline">Close</button>
          </div>
        ) : (
          <>
            <div className="relative bg-black aspect-[3/4]">
              <video ref={videoRef} autoPlay playsInline muted
                className="h-full w-full object-cover" style={{ transform: facing === 'user' ? 'scaleX(-1)' : undefined }} />
              {!ready && <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">Starting camera…</div>}
            </div>
            <div className="p-4 flex items-center justify-center">
              <button onClick={capture} disabled={!ready || capturing}
                className="inline-flex items-center gap-2 rounded-xl bg-accent text-accent-ink font-bold px-8 py-3 hover:bg-accent/90 disabled:opacity-50">
                {capturing ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                {capturing ? 'Capturing…' : 'Capture'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
