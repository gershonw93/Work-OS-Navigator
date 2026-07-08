'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import 'leaflet/dist/leaflet.css'
import { cn } from '@/lib/utils'

interface MapProject {
  id: string; name: string; status: string; address: string | null
  client?: string | null; lat?: number | null; lng?: number | null
}

const STATUS_COLOR: Record<string, string> = {
  active: '#16A34A', planning: '#2563EB', on_hold: '#D97706', completed: '#64748B', cancelled: '#DC2626',
}

// Free map view: Leaflet + OpenStreetMap tiles (no API key). Coordinates are
// geocoded once server-side and cached on the project.
export function ProjectsMap({ projects }: { projects: MapProject[] }) {
  const router = useRouter()
  const supabase = createClient()
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<Record<string, any>>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const [items, setItems] = useState(projects)
  const [note, setNote] = useState('')

  // Kick off geocoding for projects that don't have coordinates yet, then refresh.
  useEffect(() => {
    const missing = projects.filter(p => p.address && p.lat == null).length
    if (!missing) return
    setNote(`Locating ${missing} project${missing !== 1 ? 's' : ''}…`)
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('/api/projects/geocode', { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token}` } })
      const res = await fetch('/api/projects', { headers: { Authorization: `Bearer ${session?.access_token}` } })
      if (res.ok) setItems(((await res.json()).projects ?? []))
      setNote('')
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const L = (await import('leaflet')).default
      if (cancelled || !divRef.current) return
      if (!mapRef.current) {
        mapRef.current = L.map(divRef.current, { scrollWheelZoom: true })
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
        }).addTo(mapRef.current)
      }
      const map = mapRef.current
      // Clear old markers
      map.eachLayer((l: any) => { if (l.options?.pane === 'markerPane' || l instanceof L.CircleMarker) map.removeLayer(l) })
      markersRef.current = {}

      const located = items.filter(p => p.lat != null && p.lng != null)
      const bounds: [number, number][] = []
      for (const p of located) {
        const color = STATUS_COLOR[p.status] ?? '#2563EB'
        const marker = L.circleMarker([p.lat!, p.lng!], {
          radius: 9, color: '#ffffff', weight: 2, fillColor: color, fillOpacity: 0.95,
        }).addTo(map)
        markersRef.current[p.id] = marker
        marker.bindPopup(
          `<strong>${p.name}</strong><br/>${p.address ?? ''}${p.client ? `<br/>${p.client}` : ''}<br/><em>${p.status.replace('_', ' ')}</em>`,
        )
        marker.on('dblclick', () => router.push(`/projects/${p.id}/plans`))
        marker.on('popupopen', (e: any) => {
          const el = e.popup.getElement()
          if (el) { el.style.cursor = 'pointer'; el.onclick = () => router.push(`/projects/${p.id}/plans`) }
        })
        bounds.push([p.lat!, p.lng!])
      }
      if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 })
      else map.setView([39.8, -98.6], 4) // continental US default
    })()
    return () => { cancelled = true }
  }, [items, router])

  useEffect(() => () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null } }, [])

  function focus(p: MapProject) {
    setActiveId(p.id)
    if (p.lat != null && p.lng != null && mapRef.current) {
      mapRef.current.flyTo([p.lat, p.lng], 14, { duration: 0.6 })
      markersRef.current[p.id]?.openPopup()
    }
  }

  const unlocated = items.filter(p => p.address && p.lat == null).length

  return (
    <div className="flex flex-col-reverse gap-3 lg:flex-row">
      {/* Side list of projects */}
      <div className="lg:w-72 shrink-0 rounded-xl border border-line bg-panel overflow-hidden">
        <div className="border-b border-line-soft px-3 py-2 text-xs font-semibold uppercase tracking-wide text-faint">
          {items.length} project{items.length !== 1 ? 's' : ''}
        </div>
        <div className="max-h-[62vh] overflow-y-auto divide-y divide-line-soft">
          {items.map(p => {
            const locatable = p.lat != null && p.lng != null
            return (
              <button key={p.id}
                onClick={() => focus(p)}
                className={cn('flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-surface transition-colors',
                  activeId === p.id && 'bg-surface')}>
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLOR[p.status] ?? '#2563EB' }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{p.name}</span>
                  <span className="block truncate text-xs text-muted-fg">{p.address || 'No address'}{!locatable && p.address ? ' · not located' : ''}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Map + legend */}
      <div className="min-w-0 flex-1 space-y-2">
        <div ref={divRef} className="h-[62vh] w-full rounded-xl border border-line overflow-hidden z-0" />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-fg">
          {Object.entries(STATUS_COLOR).map(([k, c]) => (
            <span key={k} className="inline-flex items-center gap-1.5 capitalize">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c }} /> {k.replace('_', ' ')}
            </span>
          ))}
          <span className="ml-auto">
            {note || (unlocated > 0 ? `${unlocated} project${unlocated !== 1 ? 's' : ''} couldn't be located from their address` : 'Click a project or pin, then the popup to open it')}
          </span>
        </div>
      </div>
    </div>
  )
}
