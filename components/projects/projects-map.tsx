'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import 'leaflet/dist/leaflet.css'
import { cn } from '@/lib/utils'
import { projectSite } from '@/lib/project-site'

interface MapProject {
  id: string; name: string; status: string; address: string | null
  client?: string | null; lat?: number | null; lng?: number | null
  geocoded_address?: string | null
  is_site?: boolean | null; parent_project_id?: string | null
}

const STATUS_COLOR: Record<string, string> = {
  active: '#16A34A', planning: '#2563EB', on_hold: '#D97706', completed: '#64748B', cancelled: '#DC2626',
}

// Free map view: Leaflet + OpenStreetMap tiles (no API key). Coordinates are
// geocoded once server-side and cached on the project.
//
// THE LIST IS THE PAGE'S LIST. It used to keep its own copy and, after looking
// up addresses, replace it with EVERY project the account has - so a
// development's thirty houses, which the Projects list deliberately folds into
// one row, came back as thirty rows across the top of the list, and the status
// and type filters stopped applying. The page owns the list and re-reads it;
// a development's houses are PINS (`houses`), not rows, and choosing the
// development flies to them.
export function ProjectsMap({ projects, houses = [], childCount = {}, onRefresh }: {
  projects: MapProject[]
  /** The houses of the developments listed - drawn on the map, never listed. */
  houses?: MapProject[]
  childCount?: Record<string, number>
  /** Re-read the page's list after addresses were looked up. */
  onRefresh?: () => Promise<void> | void
}) {
  const router = useRouter()
  const supabase = createClient()
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<Record<string, any>>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const items = projects
  const pins = useMemo(() => [...projects, ...houses], [projects, houses])

  // Kick off geocoding for projects that are not on the map, then refresh.
  //
  // "Not on the map" is not the same as "has no coordinates". A pin resolved
  // from an address the job has since changed is still a pin, so this trigger
  // never fired for one - and the route behind it has always been willing to
  // replace them. Fourteen of a hundred jobs were drawn at an address they no
  // longer have, one of them two hundred miles out, and nothing ever asked.
  useEffect(() => {
    const missing = pins.filter(p => p.address && projectSite(p).state !== 'mapped').length
    if (!missing) return
    setNote(`Locating ${missing} project${missing !== 1 ? 's' : ''}…`)
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        await fetch('/api/projects/geocode', { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token}` } })
        await onRefresh?.()
      } finally { setNote('') }
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

      const located = pins.filter(p => p.lat != null && p.lng != null)
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
  }, [pins, router])

  useEffect(() => () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null } }, [])

  function focus(p: MapProject) {
    setActiveId(p.id)
    // A development is its houses on the map: fly to all of them.
    const its = houses.filter(h => h.parent_project_id === p.id && h.lat != null && h.lng != null)
    if (its.length && mapRef.current) {
      mapRef.current.flyToBounds(its.map(h => [h.lat!, h.lng!]), { padding: [40, 40], maxZoom: 15, duration: 0.6 })
      return
    }
    if (p.lat != null && p.lng != null && mapRef.current) {
      mapRef.current.flyTo([p.lat, p.lng], 14, { duration: 0.6 })
      markersRef.current[p.id]?.openPopup()
    }
  }

  const unlocated = pins.filter(p => p.address && p.lat == null).length

  return (
    <div className="flex flex-col-reverse gap-3 lg:flex-row">
      {/* Side list of projects */}
      <div className="lg:w-72 shrink-0 rounded-xl border border-line bg-panel overflow-hidden">
        <div className="border-b border-line-soft px-3 py-2 text-xs font-semibold uppercase tracking-wide text-faint">
          {items.length} project{items.length !== 1 ? 's' : ''}
        </div>
        <div className="max-h-[62vh] overflow-y-auto divide-y divide-line-soft">
          {items.map(p => {
            const locatable = (p.lat != null && p.lng != null) || houses.some(h => h.parent_project_id === p.id && h.lat != null)
            return (
              <button key={p.id}
                onClick={() => focus(p)}
                className={cn('flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-surface transition-colors',
                  activeId === p.id && 'bg-surface')}>
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLOR[p.status] ?? '#2563EB' }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{p.name}</span>
                  <span className="block truncate text-xs text-muted-fg">
                    {p.is_site
                      ? `Development · ${childCount[p.id] ?? 0} job${(childCount[p.id] ?? 0) !== 1 ? 's' : ''}`
                      : <>{p.address || 'No address'}{!locatable && p.address ? ' · not located' : ''}</>}
                  </span>
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
