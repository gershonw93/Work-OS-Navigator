'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { MapPin, Crosshair, X } from 'lucide-react'
import { projectSite, siteLabel, siteAdvice, type ProjectSiteRow } from '@/lib/project-site'
import { getPosition, geoFailureMessage } from '@/lib/geo-position'
import 'leaflet/dist/leaflet.css'

// ─────────────────────────────────────────────────────────────────────────────
// Where the job site is, said out loud, with a way to fix it.
//
// Two things this screen never had. It never SAID that a job had no place on
// the map - which is what the clock-in geofence measures against, so every
// punch came back flagged and the only explanation was a message on the punch
// itself, seen by the worker and nobody who could act on it. And there was no
// way to correct a pin: coordinates arrived only as a side effect of picking an
// address suggestion, so a geocoder's wrong answer was wrong for good.
//
// The pin saves on its own, immediately, and the button says so. It is not part
// of the settings form's Save - "a verb on a button is a promise about what
// happens when it is pressed", and a map you have just dragged is a change you
// have already made.
// ─────────────────────────────────────────────────────────────────────────────

const TONE: Record<string, string> = {
  mapped: 'border-line bg-surface text-ink-soft',
  stale: 'border-warn/40 bg-warn-tint text-ink',
  unmapped: 'border-line bg-surface text-ink-soft',
}

export function SitePinField({
  projectId, address, lat, lng, geocodedAddress, onChange,
}: {
  projectId: string
  /** The address as the form has it NOW, so an unsaved edit reads as stale too. */
  address: string
  lat: number | null
  lng: number | null
  geocodedAddress: string | null
  onChange: (pin: { lat: number; lng: number } | null) => void
}) {
  const supabase = createClient()
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const row: ProjectSiteRow = { address, lat, lng, geocoded_address: geocodedAddress }
  const site = projectSite(row)
  const advice = siteAdvice(site)

  async function token() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function savePin(pin: { lat: number; lng: number }) {
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/projects/${projectId}/pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: JSON.stringify(pin),
      })
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? 'Could not save the pin.')
        return
      }
      onChange(pin)
      setPicking(false)
    } catch {
      setError('Could not save the pin - check your connection.')
    } finally {
      setBusy(false)
    }
  }

  async function clearPin() {
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/projects/${projectId}/pin`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${await token()}` },
      })
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? 'Could not clear the pin.')
        return
      }
      onChange(null)
    } catch {
      setError('Could not clear the pin - check your connection.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className={`rounded-lg border px-3 py-2.5 text-sm ${TONE[site.state]}`}>
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p>{siteLabel(site)}</p>
            {advice && <p className="mt-0.5 text-xs text-muted-fg">{advice}</p>}
          </div>
        </div>
      </div>

      <div className="row-even lg:flex lg:flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => { setError(''); setPicking(true) }}>
          {site.state === 'mapped' ? 'Move the pin' : 'Set the pin'}
        </Button>
        {lat != null && lng != null && (
          <Button type="button" variant="secondary" disabled={busy} onClick={clearPin}>
            Clear the pin
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {picking && (
        <PinPicker
          address={address}
          start={lat != null && lng != null ? { lat, lng } : null}
          busy={busy}
          error={error}
          onCancel={() => setPicking(false)}
          onSave={savePin}
        />
      )}
    </div>
  )
}

/**
 * The map itself.
 *
 * Hoisted out rather than declared inside `SitePinField` - a component declared
 * inside a component is a new type on every render, so React throws the DOM
 * away and builds a new one, which for a Leaflet map means losing the map and
 * the pin the user has just dragged.
 */
function PinPicker({
  address, start, busy, error, onCancel, onSave,
}: {
  address: string
  start: { lat: number; lng: number } | null
  busy: boolean
  error: string
  onCancel: () => void
  onSave: (pin: { lat: number; lng: number }) => void
}) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(start)
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const L = (await import('leaflet')).default
      if (cancelled || !divRef.current || mapRef.current) return
      const map = L.map(divRef.current, { scrollWheelZoom: true })
      mapRef.current = map
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map)

      if (start) {
        map.setView([start.lat, start.lng], 17)
        markerRef.current = L.circleMarker([start.lat, start.lng], {
          radius: 10, color: '#ffffff', weight: 3, fillColor: '#2563EB', fillOpacity: 0.95,
        }).addTo(map)
      } else {
        map.setView([39.8, -98.6], 4) // continental US, same default as the projects map
      }

      // Tap to place. A dragging handle is a nicety; a tap target is the whole
      // map, which is the one interaction that works the same with a thumb.
      map.on('click', (e: any) => {
        const next = { lat: e.latlng.lat, lng: e.latlng.lng }
        setPin(next)
        if (markerRef.current) markerRef.current.setLatLng(e.latlng)
        else markerRef.current = L.circleMarker(e.latlng, {
          radius: 10, color: '#ffffff', weight: 3, fillColor: '#2563EB', fillOpacity: 0.95,
        }).addTo(map)
      })

      // Leaflet measures its container on creation; inside a dialog that has
      // only just been painted it can come out zero-height and render a grey
      // box. One more measurement after the frame settles.
      setTimeout(() => map.invalidateSize(), 60)
    })()
    return () => {
      cancelled = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function useMyLocation() {
    setLocating(true); setGeoError('')
    try {
      const pos = await getPosition()
      if (!pos.ok) { setGeoError(geoFailureMessage(pos.why)); return }
      const next = { lat: pos.fix.lat, lng: pos.fix.lng }
      setPin(next)
      const L = (await import('leaflet')).default
      const map = mapRef.current
      if (map) {
        map.setView([next.lat, next.lng], 18)
        if (markerRef.current) markerRef.current.setLatLng([next.lat, next.lng])
        else markerRef.current = L.circleMarker([next.lat, next.lng], {
          radius: 10, color: '#ffffff', weight: 3, fillColor: '#2563EB', fillOpacity: 0.95,
        }).addTo(map)
      }
    } finally {
      setLocating(false)
    }
  }

  return (
    <div className="overlay items-center justify-center bg-black/50" data-overlay onClick={() => !busy && onCancel()}>
      <div className="w-full max-w-lg rounded-xl bg-panel shadow-xl overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line-soft px-5 py-4">
          <h2 className="min-w-0 truncate text-base font-semibold text-ink">Where is this job?</h2>
          <button type="button" onClick={onCancel} aria-label="Close" title="Close" className="shrink-0 text-faint hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 p-5">
          <p className="text-sm text-muted-fg">
            Tap the map where the site entrance is, or use your current location if you are standing
            on it. This is the point clock-ins are measured against{address ? `, for ${address}` : ''}.
          </p>

          <div ref={divRef} className="h-64 w-full overflow-hidden rounded-lg border border-line" />

          <Button type="button" variant="secondary" disabled={locating} onClick={useMyLocation}>
            <Crosshair className="mr-1.5 h-4 w-4" />
            {locating ? 'Finding you…' : 'Use my current location'}
          </Button>

          {geoError && <p className="text-sm text-warn">{geoError}</p>}
          {error && <p className="text-sm text-danger">{error}</p>}
          <p className="text-xs text-faint">
            {pin
              ? `Pin at ${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}.`
              : 'No pin placed yet.'}
          </p>

          <div className="row-even lg:flex lg:justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
            {/* Disabled only for IN FLIGHT. Pressing it with no pin answers with
                the field it is waiting on, rather than sitting there greyed
                out with nothing to say. */}
            <Button
              type="button"
              disabled={busy}
              onClick={() => pin ? onSave(pin) : setGeoError('Tap the map to place the pin first.')}
            >
              {busy ? 'Saving…' : 'Save this location'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
