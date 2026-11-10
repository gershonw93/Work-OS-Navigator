import { NEARBY_KM, nearbyAreas, ringPoints, type Area, type AreaKind, type JobAreas } from './permit-jurisdiction'

// The map-service half of lib/permit-jurisdiction.ts: what township and county
// an address is in, and a search for townships and counties by name. Google
// when GOOGLE_MAPS_API_KEY is set (the same key the address search uses),
// Photon (OpenStreetMap) otherwise - and a lookup that finds nothing answers
// null, which suggests nothing rather than guessing.

const STATES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT',
  delaware: 'DE', 'district of columbia': 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT',
  nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA',
  'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
}
export const stateCode = (s: string | null | undefined): string | null => {
  const t = String(s ?? '').trim()
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase()
  return STATES[t.toLowerCase()] ?? null
}

/** The state named anywhere in "Ocean County, NJ, USA". */
export const stateIn = (text: string | null | undefined): string | null => {
  for (const part of String(text ?? '').split(',').map(x => x.trim())) {
    if (/^usa?$/i.test(part)) continue
    const code = stateCode(part)
    if (code) return code
  }
  return null
}

/** The township, postal town, county and state an address is in, or null. */
export async function jobAreas(address: string | null | undefined): Promise<JobAreas | null> {
  const q = String(address ?? '').trim()
  if (q.length < 5) return null
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (key) {
    try {
      const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${key}`)
      const d = await res.json()
      const comps: any[] = d?.results?.[0]?.address_components ?? []
      if (d?.status === 'OK' && comps.length) {
        const get = (t: string) => comps.find(c => (c.types ?? []).includes(t))
        return {
          municipality: get('administrative_area_level_3')?.long_name ?? null,
          locality: get('locality')?.long_name ?? get('postal_town')?.long_name ?? null,
          county: get('administrative_area_level_2')?.long_name ?? null,
          state: get('administrative_area_level_1')?.short_name ?? null,
        }
      }
    } catch { /* fall through */ }
  }
  try {
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1&lang=en`)
    const p = (await res.json())?.features?.[0]?.properties
    if (p) {
      return {
        municipality: p.district ?? null,
        locality: p.city ?? p.town ?? p.village ?? null,
        county: p.county ?? null,
        state: stateCode(p.state),
      }
    }
  } catch { /* nothing */ }
  return null
}

/** Townships and counties matching what was typed - for "Towns it covers". */
export async function searchAreas(q: string): Promise<Area[]> {
  const text = q.trim()
  if (text.length < 2) return []
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (key) {
    try {
      const res = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(text)}&types=(regions)&components=country:us&key=${key}`)
      const d = await res.json()
      if (d.status === 'OK' || d.status === 'ZERO_RESULTS') {
        const out: Area[] = []
        for (const p of d.predictions ?? []) {
          const types: string[] = p.types ?? []
          const kind: AreaKind | null = types.includes('administrative_area_level_2') ? 'county'
            : (types.includes('administrative_area_level_3') || types.includes('locality') || types.includes('sublocality')) ? 'municipality' : null
          if (!kind) continue
          const name = p.structured_formatting?.main_text ?? String(p.description ?? '').split(',')[0]
          // "NJ, USA" or "Ocean County, NJ, USA": the state is whichever part IS one.
          // Reading only the first part saved Toms River twice, once with no state.
          const state = stateIn(p.structured_formatting?.secondary_text ?? p.description)
          if (name) out.push({ name, kind, state, placeId: p.place_id ?? null })
        }
        return out
      }
    } catch { /* fall through */ }
  }
  try {
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(text)}&limit=8&lang=en&layer=city&layer=county&layer=district`)
    const d = await res.json()
    const out: Area[] = []
    for (const f of d?.features ?? []) {
      const p = f.properties ?? {}
      if (p.countrycode && p.countrycode !== 'US') continue
      const kind: AreaKind = p.type === 'county' ? 'county' : 'municipality'
      if (p.name) out.push({ name: p.name, kind, state: stateCode(p.state), placeId: null })
    }
    return out
  } catch { return [] }
}

type Point = { lat: number; lng: number }

/** Where a picked township or county is: its place id with Google, else its name. */
async function centreOf(a: Area, key: string | undefined): Promise<Point | null> {
  if (key) {
    try {
      const url = a.placeId
        ? `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(a.placeId)}&fields=geometry&key=${key}`
        : `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(`${a.name}${a.kind === 'county' && !/county/i.test(a.name) ? ' County' : ''}, ${a.state ?? ''}`)}&components=country:US&key=${key}`
      const d = await (await fetch(url)).json()
      const loc = d?.result?.geometry?.location ?? d?.results?.[0]?.geometry?.location
      if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) return { lat: loc.lat, lng: loc.lng }
    } catch { /* fall through */ }
  }
  try {
    const layer = a.kind === 'county' ? 'county' : 'city&layer=district'
    const d = await (await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(`${a.name} ${a.state ?? ''}`)}&limit=1&lang=en&layer=${layer}`)).json()
    const c = d?.features?.[0]?.geometry?.coordinates
    if (Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])) return { lat: c[1], lng: c[0] }
  } catch { /* nothing */ }
  return null
}

/** The township and county a point falls in. */
async function areasAt(p: Point, key: string | undefined): Promise<{ town: Area | null; county: Area | null }> {
  if (key) {
    try {
      const d = await (await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${p.lat},${p.lng}&result_type=administrative_area_level_3|locality|administrative_area_level_2&key=${key}`)).json()
      if (d?.status === 'OK' || d?.status === 'ZERO_RESULTS') {
        const comps: any[] = (d.results ?? []).flatMap((r: any) => r.address_components ?? [])
        const get = (t: string) => comps.find(c => (c.types ?? []).includes(t))
        const state = get('administrative_area_level_1')?.short_name ?? null
        const town = get('administrative_area_level_3') ?? get('locality')
        const county = get('administrative_area_level_2')
        return {
          town: town ? { name: town.long_name, kind: 'municipality', state, placeId: null } : null,
          county: county ? { name: county.long_name, kind: 'county', state, placeId: null } : null,
        }
      }
    } catch { /* fall through */ }
  }
  try {
    const d = await (await fetch(`https://photon.komoot.io/reverse?lat=${p.lat}&lon=${p.lng}&lang=en`)).json()
    const q = d?.features?.[0]?.properties
    if (q && (!q.countrycode || q.countrycode === 'US')) {
      const state = stateCode(q.state)
      const name = q.district ?? q.city ?? q.town ?? q.village ?? null
      return {
        town: name ? { name, kind: 'municipality', state, placeId: null } : null,
        county: q.county ? { name: q.county, kind: 'county', state, placeId: null } : null,
      }
    }
  } catch { /* nothing */ }
  return { town: null, county: null }
}

/** Townships (or counties) around one just picked, for "Towns it covers". */
export async function searchNearby(picked: Area): Promise<Area[]> {
  const key = process.env.GOOGLE_MAPS_API_KEY
  const centre = await centreOf(picked, key)
  if (!centre) return []
  const ring = ringPoints(centre.lat, centre.lng, NEARBY_KM[picked.kind])
  const [here, ...around] = await Promise.all([centre, ...ring].map(p => areasAt(p, key)))
  const found = around.map(r => (picked.kind === 'county' ? r.county : r.town))
  return nearbyAreas(picked, found, here.county)
}
