/**
 * Shared demo-account seeding logic, used by both scripts/seed-demo.ts (CLI)
 * and app/api/dev/seed-demo (browser-triggered). Fills 12 projects with data
 * on every tab. See scripts/README.md.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export const DEMO_EMAIL = 'demo@sytenav.com'
export const DEFAULT_DEMO_PASSWORD = 'SyteNavDemo2026!'

const SAMPLE_PDF = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
const img = (seed: string) => `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/600`

const rid = () => (globalThis.crypto as Crypto).randomUUID()
const pick = <T,>(arr: T[], i: number): T => arr[i % arr.length]
const round2 = (n: number) => Math.round(n * 100) / 100
const daysFromNow = (d: number) => { const t = new Date(); t.setDate(t.getDate() + d); return t }
const iso = (d: Date) => d.toISOString()
const ymd = (d: Date) => d.toISOString().slice(0, 10)

const CREW = [
  { name: 'Mike Torres', role: 'Superintendent', phone: '(917) 555-0201' },
  { name: 'Danny Cole', role: 'Foreman', phone: '(917) 555-0202' },
  { name: 'Luis Ramirez', role: 'Laborer', phone: '(917) 555-0203' },
  { name: 'Sam Patel', role: 'Laborer', phone: '(917) 555-0204' },
  { name: 'Chris Nguyen', role: 'Safety Officer', phone: '(917) 555-0205' },
  { name: 'Ava Bennett', role: 'Project Engineer', phone: '(917) 555-0206' },
]
const VENDORS = [
  { name: 'BoroFlow Plumbing & Heating LLC', trade: 'Plumbing', type: 'subcontractor', email: 'office@boroflowph.com', phone: '(718) 555-0148' },
  { name: 'Brookstone Flooring & Design LLC', trade: 'Flooring', type: 'subcontractor', email: 'jobs@brookstonefloors.com', phone: '(718) 555-0166' },
  { name: 'Apex Electric Co.', trade: 'Electrical', type: 'subcontractor', email: 'dispatch@apexelectric.com', phone: '(212) 555-0110' },
  { name: 'Ironclad Framing Inc.', trade: 'Framing', type: 'subcontractor', email: 'build@ironcladframing.com', phone: '(347) 555-0193' },
  { name: 'Summit HVAC Services', trade: 'HVAC', type: 'subcontractor', email: 'service@summithvac.com', phone: '(646) 555-0177' },
  { name: 'Precision Drywall LLC', trade: 'Drywall', type: 'subcontractor', email: 'est@precisiondrywall.com', phone: '(929) 555-0122' },
  { name: 'Keystone Roofing', trade: 'Roofing', type: 'subcontractor', email: 'office@keystoneroof.com', phone: '(718) 555-0140' },
  { name: 'GreenScape Site Works', trade: 'Site Work', type: 'subcontractor', email: 'ops@greenscapesw.com', phone: '(631) 555-0155' },
  { name: 'Certified Lumber & Home Center', trade: 'Materials', type: 'supplier', email: 'sales@certifiedlumber.com', phone: '(718) 555-0101' },
  { name: 'MetroTile Supply', trade: 'Tile & Stone', type: 'supplier', email: 'orders@metrotile.com', phone: '(718) 555-0102' },
  { name: 'City Inspections Bureau', trade: 'Inspections', type: 'inspector', email: 'schedule@cityinspect.gov', phone: '(212) 555-0199' },
]
const CUSTOMERS = [
  { name: 'Symcha Realty Co LLC', contact_name: 'David Klein', email: 'david@symcharealty.com', phone: '(718) 555-0301', billing_address: '55 Water St, Brooklyn, NY' },
  { name: 'Tekton Builders', contact_name: 'Rachel Adler', email: 'rachel@tektonbuilders.com', phone: '(212) 555-0302', billing_address: '900 Broadway, New York, NY' },
  { name: 'Hudson Yards Holdings', contact_name: 'Marcus Lee', email: 'marcus@hudsonyh.com', phone: '(646) 555-0303', billing_address: '20 Hudson Yards, New York, NY' },
  { name: 'Bergen Property Group', contact_name: 'Nora Simmons', email: 'nora@bergenpg.com', phone: '(201) 555-0304', billing_address: '110 Main St, Hackensack, NJ' },
]
const PROJECTS = [
  { name: 'Maple Street Residences', city: 'Brooklyn, NY', addr: '420 Maple Street', type: 'residential', status: 'active', lat: 40.6782, lng: -73.9442, iSq: 8400, eSq: 2100, budget: 1_200_000 },
  { name: 'Linden Ave Remodel', city: 'Linden, NJ', addr: '77 Linden Ave', type: 'renovation', status: 'active', lat: 40.6220, lng: -74.2446, iSq: 3200, eSq: 600, budget: 420_000 },
  { name: 'Princeton Commercial Center', city: 'Princeton, NJ', addr: '300 Nassau St', type: 'commercial', status: 'planning', lat: 40.3573, lng: -74.6672, iSq: 24000, eSq: 4000, budget: 3_100_000 },
  { name: 'Oak Park Townhomes', city: 'Newark, NJ', addr: '15 Oak Park Dr', type: 'residential', status: 'active', lat: 40.7357, lng: -74.1724, iSq: 11200, eSq: 3300, budget: 880_000 },
  { name: 'Harborview Lofts', city: 'Jersey City, NJ', addr: '88 Harborside', type: 'mixed_use', status: 'active', lat: 40.7178, lng: -74.0431, iSq: 18600, eSq: 2400, budget: 2_400_000 },
  { name: 'Cedar Lane Duplex', city: 'Edison, NJ', addr: '210 Cedar Lane', type: 'residential', status: 'on_hold', lat: 40.5187, lng: -74.4121, iSq: 2600, eSq: 500, budget: 310_000 },
  { name: 'Summit Office Fit-out', city: 'Summit, NJ', addr: '5 Summit Plaza', type: 'commercial', status: 'active', lat: 40.7155, lng: -74.3574, iSq: 9400, eSq: 0, budget: 640_000 },
  { name: 'Garden State Plaza Unit 4', city: 'Paramus, NJ', addr: '1 Garden State Plaza', type: 'commercial', status: 'planning', lat: 40.9187, lng: -74.0759, iSq: 17000, eSq: 1200, budget: 1_700_000 },
  { name: 'Riverside Kitchen Reno', city: 'Hoboken, NJ', addr: '412 River St', type: 'renovation', status: 'active', lat: 40.7439, lng: -74.0324, iSq: 1900, eSq: 0, budget: 190_000 },
  { name: 'Bergen Point Warehouse', city: 'Bayonne, NJ', addr: '600 Port Rd', type: 'industrial', status: 'active', lat: 40.6687, lng: -74.1143, iSq: 29000, eSq: 8000, budget: 2_900_000 },
  { name: 'Palisade Ave Brownstone', city: 'Weehawken, NJ', addr: '33 Palisade Ave', type: 'residential', status: 'active', lat: 40.7690, lng: -74.0207, iSq: 5300, eSq: 900, budget: 530_000 },
  { name: 'Montclair Dental Fit-out', city: 'Montclair, NJ', addr: '120 Bloomfield Ave', type: 'commercial', status: 'planning', lat: 40.8259, lng: -74.2090, iSq: 7600, eSq: 0, budget: 760_000 },
  { name: 'Hackensack Medical Suite', city: 'Hackensack, NJ', addr: '30 Prospect Ave', type: 'commercial', status: 'active', lat: 40.8859, lng: -74.0435, iSq: 9400, eSq: 600, budget: 940_000 },
]
const BUDGET_LINES = [
  { cat: 'General Conditions', desc: 'Mobilization, supervision, temp facilities', space: null },
  { cat: 'Site Work', desc: 'Excavation, grading, utilities tie-in', space: 'exterior' },
  { cat: 'Concrete', desc: 'Foundations, slab on grade', space: 'exterior' },
  { cat: 'Framing', desc: 'Wood/metal framing, sheathing', space: 'interior' },
  { cat: 'Roofing', desc: 'Tear-off and architectural shingle', space: 'exterior' },
  { cat: 'Plumbing', desc: 'Rough-in and fixtures', space: 'interior' },
  { cat: 'Electrical', desc: 'Rough-in, panel, devices', space: 'interior' },
  { cat: 'HVAC', desc: 'Ductwork, equipment, controls', space: 'interior' },
  { cat: 'Drywall', desc: 'Hang, tape, level 4 finish', space: 'interior' },
  { cat: 'Flooring', desc: 'LVT, tile, and hardwood', space: 'interior' },
  { cat: 'Painting', desc: 'Prime and two finish coats', space: 'interior' },
  { cat: 'Landscaping', desc: 'Plantings, walkways, restoration', space: 'exterior' },
]
const TASK_TITLES = ['Order long-lead HVAC equipment', 'Confirm framing inspection date', 'Submit electrical panel cut sheet', 'Coordinate concrete pour', 'Punch list walkthrough', 'Update as-built drawings', 'Verify fire-stopping at penetrations', 'Schedule final grading', 'Review shop drawings for millwork', 'Close out permit with city']
const RFI_Q = ['Confirm ceiling height at corridor B - plans conflict with structural.', 'Which fixture spec applies to the second-floor baths?', 'Is the north retaining wall in this scope or by others?', 'Provide detail for the roof-to-parapet flashing.', 'Clarify concrete PSI for the loading dock slab.']
const CO_TITLES = ['Added recessed lighting in lobby', 'Upgrade to porcelain tile in restrooms', 'Additional footing at soft soil area', 'Owner-requested millwork upgrade']
const PERMIT_TYPES = ['Building', 'Plumbing', 'Electrical', 'Mechanical', 'Demolition']
const INSPECTION_TYPES = ['Framing', 'Rough Electrical', 'Rough Plumbing', 'Insulation', 'Final']
const SUBMITTAL_TITLES = ['HVAC Equipment', 'Light Fixtures', 'Windows & Glazing', 'Millwork', 'Flooring Samples']

export async function runSeed(
  db: SupabaseClient,
  opts: { password?: string; log?: (m: string) => void } = {},
): Promise<{ email: string; password: string; projects: number }> {
  const log = opts.log ?? (() => {})
  const password = opts.password || DEFAULT_DEMO_PASSWORD

  // If the live DB is missing a column this seed sets (production schemas can
  // drift from the migration files), drop that column and retry instead of
  // failing the whole seed.
  function missingColumn(error: any): string | null {
    const msg = String(error?.message ?? '')
    const m1 = /Could not find the '([^']+)' column/.exec(msg)
    if (m1) return m1[1]
    if (error?.code === '42703') {
      const m2 = /column "([^"]+)"/.exec(msg)
      if (m2) return m2[1]
    }
    return null
  }
  async function insert(table: string, rows: any[] | any) {
    let payload = Array.isArray(rows) ? rows : [rows]
    if (payload.length === 0) return []
    for (let attempt = 0; attempt < 8; attempt++) {
      const { data, error } = await db.from(table).insert(payload).select()
      if (!error) return data ?? []
      const col = missingColumn(error)
      if (col && payload.some(r => col in r)) {
        payload = payload.map(r => { const c = { ...r }; delete c[col]; return c })
        continue
      }
      throw new Error(`insert into ${table} failed: ${error.message}`)
    }
    return []
  }
  async function insertSoft(table: string, row: any, dropKeys: string[]) {
    const { data, error } = await db.from(table).insert(row).select().single()
    if (!error) return data
    if ((error as any).code === '42703') {
      const clean = { ...row }
      for (const k of dropKeys) delete clean[k]
      const retry = await db.from(table).insert(clean).select().single()
      if (retry.error) throw retry.error
      return retry.data
    }
    throw error
  }

  log(`ensuring demo login ${DEMO_EMAIL}`)
  let userId: string | null = null
  for (let page = 1; page <= 10 && !userId; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const users = (data.users ?? []) as Array<{ id: string; email?: string | null }>
    const found = users.find(u => u.email?.toLowerCase() === DEMO_EMAIL)
    if (found) userId = found.id
    if (users.length < 200) break
  }
  if (userId) {
    await db.auth.admin.updateUserById(userId, { password, email_confirm: true })
  } else {
    const { data, error } = await db.auth.admin.createUser({ email: DEMO_EMAIL, password, email_confirm: true })
    if (error) throw error
    userId = data.user.id
  }

  const { data: existingProfile } = await db.from('profiles').select('company_id').eq('id', userId).maybeSingle()
  if (existingProfile?.company_id) {
    log('clearing previous demo data')
    await db.from('equipment').delete().eq('company_id', existingProfile.company_id)
    await db.from('companies').delete().eq('added_by_company_id', existingProfile.company_id).then(() => {}, () => {})
    await db.from('companies').delete().eq('id', existingProfile.company_id)
  }

  const companyId = rid()
  await insert('companies', {
    id: companyId, name: 'SyteNav Demo Construction', type: 'gc',
    contact_email: DEMO_EMAIL, contact_name: 'Demo Admin', phone: '(212) 555-0100',
    address: '1 Demo Plaza, New York, NY', insurance_status: 'active', license_number: 'GC-DEMO-0001',
  })
  await db.from('profiles').upsert({ id: userId, company_id: companyId, email: DEMO_EMAIL, full_name: 'Demo Admin', role: 'admin', phone: '(212) 555-0100' })

  const vendorIds: Record<string, string> = {}
  for (const v of VENDORS) {
    const id = rid()
    await insertSoft('companies', { id, name: v.name, type: v.type, trade: v.trade, contact_email: v.email, phone: v.phone, insurance_status: 'active', added_by_company_id: companyId }, ['added_by_company_id'])
    vendorIds[v.name] = id
  }
  const subVendors = VENDORS.filter(v => v.type === 'subcontractor')

  const customerIds: string[] = []
  for (const c of CUSTOMERS) {
    const row = await insert('customers', { gc_company_id: companyId, ...c })
    customerIds.push(row[0].id)
  }

  const EQUIP = [
    { name: 'DeWalt Table Saw', category: 'Power Tools', asset_tag: 'TS-014' },
    { name: 'Bobcat E35 Excavator', category: 'Heavy Equipment', asset_tag: 'EX-002' },
    { name: 'Hilti Rotary Hammer', category: 'Power Tools', asset_tag: 'RH-021' },
    { name: 'Genie Scissor Lift', category: 'Access', asset_tag: 'SL-007' },
    { name: 'Honda Generator 7000W', category: 'Power', asset_tag: 'GN-011' },
    { name: 'Laser Level Kit', category: 'Layout', asset_tag: 'LL-030' },
  ]
  const equipIds: string[] = []
  for (const e of EQUIP) {
    const row = await insert('equipment', { company_id: companyId, status: 'available', ...e })
    equipIds.push(row[0].id)
  }

  let p = 0
  for (const proj of PROJECTS) {
    p++
    const start = daysFromNow(-90 + p * 3)
    const end = daysFromNow(120 + p * 5)
    const projectId = rid()
    await insert('projects', {
      id: projectId, gc_company_id: companyId, name: proj.name, address: `${proj.addr}, ${proj.city}`,
      client: pick(CUSTOMERS, p).name, customer_id: pick(customerIds, p), start_date: ymd(start), end_date: ymd(end),
      type: proj.type, status: proj.status, latitude: proj.lat, longitude: proj.lng, lat: proj.lat, lng: proj.lng,
      interior_sqft: proj.iSq, exterior_sqft: proj.eSq, contractor_fee_pct: 0.15,
    })

    const teamCount = 3 + (p % 3)
    await insert('project_team_members', CREW.slice(0, teamCount).map(m => ({ project_id: projectId, name: m.name, role: m.role, phone: m.phone, email: `${m.name.split(' ')[0].toLowerCase()}@sytenavdemo.com`, profile_id: null })))

    const planTypes = ['architectural', 'structural', 'mep', 'civil'] as const
    await insert('project_plans', planTypes.slice(0, 3 + (p % 2)).map((t, i) => ({ project_id: projectId, name: `${proj.name.split(' ')[0]}_${t}_set_R${i + 1}`, plan_type: t, file_url: SAMPLE_PDF })))
    await insert('company_files', [
      { company_id: companyId, name: `${proj.name} - Contract.pdf`, category: 'Contracts', file_url: SAMPLE_PDF, file_type: 'application/pdf', size_bytes: 284000 },
      { company_id: companyId, name: `${proj.name} - Insurance COI.pdf`, category: 'Compliance', file_url: SAMPLE_PDF, file_type: 'application/pdf', size_bytes: 156000 },
    ])

    const subCount = 4 + (p % 3)
    const subcontractIds: { id: string; trade: string; amount: number; companyId: string }[] = []
    for (let s = 0; s < subCount; s++) {
      const v = pick(subVendors, p + s)
      const amount = round2(proj.budget * (0.06 + (s % 4) * 0.03))
      const row = await insert('subcontracts', { project_id: projectId, company_id: vendorIds[v.name], scope: `${v.trade} scope per plans`, trade: v.trade, contract_amount: amount, status: s === 0 ? 'completed' : 'active' })
      const scId = row[0].id
      subcontractIds.push({ id: scId, trade: v.trade, amount, companyId: vendorIds[v.name] })
      await insert('payment_schedule_items', [
        { subcontract_id: scId, label: 'Deposit', type: 'percent', percentage: 20, amount: round2(amount * 0.2), status: 'paid', order_index: 0 },
        { subcontract_id: scId, label: 'Rough complete', type: 'percent', percentage: 40, amount: round2(amount * 0.4), status: s === 0 ? 'paid' : 'invoiced', order_index: 1 },
        { subcontract_id: scId, label: 'Final', type: 'percent', percentage: 40, amount: round2(amount * 0.4), status: 'pending', order_index: 2 },
      ])
    }

    for (let b = 0; b < BUDGET_LINES.length; b++) {
      const bl = BUDGET_LINES[b]
      const budgeted = round2(proj.budget / BUDGET_LINES.length * (0.7 + (b % 5) * 0.12))
      const linkedSub = subcontractIds.find(sc => sc.trade === bl.cat || bl.cat.includes(sc.trade))
      await insert('budget_line_items', { project_id: projectId, cost_code: `${(b + 1) * 100}`, category: bl.cat, description: bl.desc, budgeted_amount: budgeted, committed_amount: linkedSub ? linkedSub.amount : round2(budgeted * 0.6), actual_amount: round2(budgeted * (0.2 + (b % 4) * 0.15)), sort_order: b, subcontract_id: linkedSub?.id ?? null, space_type: bl.space, progress_pct: (b * 8) % 100 })
    }

    const invStatuses = ['paid', 'approved', 'sent', 'pending_approval', 'draft']
    let invNo = 0
    for (const sc of subcontractIds) {
      const n = 1 + (invNo % 3)
      for (let k = 0; k < n; k++) {
        invNo++
        const status = pick(invStatuses, invNo)
        const amount = round2(sc.amount * (0.2 + (k * 0.2)))
        const v = VENDORS.find(x => vendorIds[x.name] === sc.companyId)
        await insert('invoices', {
          project_id: projectId, subcontract_id: sc.id, company_id: sc.companyId, company_name: v?.name ?? sc.trade,
          invoice_number: `INV-${proj.name.slice(0, 3).toUpperCase()}-${String(invNo).padStart(3, '0')}`, amount,
          description: `${sc.trade} - progress billing ${k + 1}`, status, due_date: ymd(daysFromNow(15 + invNo)),
          submitted_at: iso(daysFromNow(-20 + invNo)),
          approved_at: ['approved', 'sent', 'paid'].includes(status) ? iso(daysFromNow(-15 + invNo)) : null,
          paid_at: status === 'paid' ? iso(daysFromNow(-10 + invNo)) : null,
          client_paid: status === 'paid' ? round2(amount * 0.5) : 0, escrow_paid: status === 'paid' ? round2(amount * 0.5) : 0,
        })
      }
    }

    await insert('client_payments', [
      { project_id: projectId, paid_date: ymd(daysFromNow(-60)), amount: round2(proj.budget * 0.1), method: 'Wire', memo: 'Deposit', retainer: true, qb_entered: true, created_by: userId },
      { project_id: projectId, paid_date: ymd(daysFromNow(-30)), amount: round2(proj.budget * 0.25), method: 'Check', memo: 'Draw #1', retainer: false, qb_entered: true, created_by: userId },
      { project_id: projectId, paid_date: ymd(daysFromNow(-5)), amount: round2(proj.budget * 0.2), method: 'Wire', memo: 'Draw #2', retainer: false, qb_entered: false, created_by: userId },
    ])

    let sIdx = 0
    for (const sc of subcontractIds) {
      await insert('schedule_items', { project_id: projectId, subcontract_id: sc.id, start_date: ymd(daysFromNow(-30 + sIdx * 10)), end_date: ymd(daysFromNow(-10 + sIdx * 10 + 8)) })
      sIdx++
    }
    await insert('schedule_items', { project_id: projectId, subcontract_id: null, label: 'Substantial Completion', color: '#C9F24A', start_date: ymd(end), end_date: ymd(end) })

    await insert('project_tasks', TASK_TITLES.slice(0, 5 + (p % 4)).map((t, i) => ({ project_id: projectId, title: t, description: 'Auto-seeded demo task.', due_date: ymd(daysFromNow(3 + i * 4)), priority: pick(['low', 'medium', 'high'], i), status: pick(['open', 'in_progress', 'open', 'completed'], i), assigned_to_name: pick(CREW, i).name, created_by: 'Demo Admin', completed_at: i % 4 === 3 ? iso(daysFromNow(-2)) : null })))

    for (let d = 0; d < 4; d++) {
      const logRow = await insert('daily_logs', {
        project_id: projectId, log_date: ymd(daysFromNow(-2 - d * 2)), workers_onsite: 4 + (d % 5),
        notes: pick(['Framing continued on the second floor. Deliveries on schedule.', 'Rough plumbing inspection passed. Started electrical rough-in.', 'Concrete pour for the rear slab completed. Cured overnight.', 'Drywall hung on levels 1-2. Punch list started in unit A.'], d),
        weather: pick(['Sunny', 'Cloudy', 'Rain', 'Windy'], d), created_by: userId,
        safety_observation: d % 2 === 0 ? 'Toolbox talk held. All PPE compliant.' : null,
        quality_observation: d % 2 === 1 ? 'Verified fire-caulk at penetrations.' : null,
        survey: { safety_incident: { answer: 'no' }, schedule_impact: { answer: d % 2 === 0 ? 'no' : 'yes' } },
        subs_on_site: subcontractIds.slice(0, 2).map(sc => ({ company_id: sc.companyId, name: VENDORS.find(v => vendorIds[v.name] === sc.companyId)?.name ?? sc.trade, workers: 2 + (d % 3) })),
      })
      await insert('daily_log_photos', [0, 1].map(n => ({ daily_log_id: logRow[0].id, photo_url: img(`${projectId}-${d}-${n}`), caption: `Site photo ${n + 1}`, category: 'progress' })))
    }

    for (let t = 0; t < 6; t++) {
      const m = pick(CREW, t)
      const inAt = daysFromNow(-1 - (t % 4)); inAt.setHours(7, 0, 0, 0)
      const outAt = new Date(inAt); outAt.setHours(15, 30, 0, 0)
      await insert('time_entries', { project_id: projectId, profile_id: null, worker_name: m.name, clock_in_at: iso(inAt), clock_out_at: iso(outAt), clock_in_lat: proj.lat, clock_in_lng: proj.lng, clock_in_distance_m: 20 + t, clock_in_flagged: t % 5 === 4, clock_in_selfie_url: img(`clock-${projectId}-${t}`), approval_status: pick(['approved', 'pending', 'approved'], t), reviewed_by_name: t % 3 === 0 ? 'Demo Admin' : null })
    }

    await insert('rfis', RFI_Q.slice(0, 2 + (p % 3)).map((q, i) => ({ project_id: projectId, rfi_number: i + 1, subject: q.length > 60 ? q.slice(0, 57) + '...' : q, description: q, response: i % 2 === 0 ? 'See revised detail A-501, issued in latest set.' : null, status: i % 2 === 0 ? 'answered' : 'open', submitted_by_name: 'Mike Torres' })))

    await insert('change_orders', CO_TITLES.slice(0, 2 + (p % 2)).map((t, i) => ({ project_id: projectId, subcontract_id: pick(subcontractIds, i).id, title: t, description: 'Owner-directed scope change.', amount: round2(3000 + i * 2500), reason: 'Owner request', requested_by_type: 'gc', status: pick(['approved', 'pending', 'approved', 'rejected'], i) })))

    await insert('permits', PERMIT_TYPES.slice(0, 3 + (p % 2)).map((t, i) => ({ project_id: projectId, permit_type: t, type: t, permit_number: `PB-${20000 + p * 100 + i}`, description: `${t} permit`, status: pick(['approved', 'pending', 'active', 'approved'], i), expiry_date: ymd(daysFromNow(120 + i * 30)) })))

    await insert('inspections', INSPECTION_TYPES.slice(0, 3 + (p % 3)).map((t, i) => ({ project_id: projectId, type: t, trade: t, status: pick(['passed', 'scheduled', 'requested', 'passed'], i), scheduled_date: ymd(daysFromNow(-10 + i * 7)), completed_date: i % 4 === 0 ? ymd(daysFromNow(-9 + i * 7)) : null, inspector_name: 'City Inspections Bureau', inspector_phone: '(212) 555-0199', requested_by_name: 'Mike Torres', notes: i % 3 === 0 ? 'Passed with no comments.' : null })))

    await insert('submittals', SUBMITTAL_TITLES.slice(0, 3 + (p % 2)).map((t, i) => ({ project_id: projectId, title: t, type: 'Product Data', trade: pick(subVendors, i).trade, spec_section: `0${9 + i} 00 00`, manufacturer: pick(['Kohler', 'Lutron', 'Andersen', 'Armstrong'], i), model_number: `M-${1000 + i}`, status: pick(['approved', 'pending', 'in_review'], i), submitted_by_company_id: vendorIds[pick(subVendors, i).name], file_url: SAMPLE_PDF })))

    for (let c = 0; c < subcontractIds.length; c++) {
      const sc = subcontractIds[c]
      await insert('compliance_documents', { company_id: sc.companyId, project_id: projectId, type: pick(['coi', 'license', 'w9', 'workers_comp'], c), status: pick(['approved', 'pending', 'expiring_soon', 'approved'], c), expiry_date: ymd(daysFromNow(30 + c * 40)), file_url: SAMPLE_PDF })
    }

    const { data: someLines } = await db.from('budget_line_items').select('id, category').eq('project_id', projectId).limit(4)
    await insert('material_purchases', (someLines ?? []).map((bl: any, i: number) => ({ project_id: projectId, company_id: vendorIds['Certified Lumber & Home Center'], budget_line_id: i % 2 === 0 ? bl.id : null, store_name: pick(['Certified Lumber & Home Center', 'MetroTile Supply'], i), amount: round2(450 + i * 380), tax: round2((450 + i * 380) * 0.08875), purchase_date: ymd(daysFromNow(-7 - i)), category: bl.category, notes: 'Job materials', receipt_url: img(`receipt-${projectId}-${i}`), client_paid: i % 2 === 0, created_by: userId })))

    if (p <= EQUIP.length) {
      const eqId = equipIds[p - 1]
      await insert('equipment_assignments', { equipment_id: eqId, company_id: companyId, project_id: projectId, holder_name: pick(CREW, p).name, checked_out_at: iso(daysFromNow(-6)), note: 'On site', created_by: userId })
      await db.from('equipment').update({ status: 'checked_out' }).eq('id', eqId)
    }

    const brRow = await insert('bid_requests', { project_id: projectId, title: `${pick(subVendors, p).trade} package`, trade: pick(subVendors, p).trade, description: `${pick(subVendors, p).trade} for ${proj.name} per attached plans.`, due_date: ymd(daysFromNow(10)), status: 'open', created_by: userId })
    const brId = brRow[0].id
    await insert('bid_request_attachments', { bid_request_id: brId, file_url: SAMPLE_PDF, file_name: `${proj.name.replace(/ /g, '_')}_RFQ_Plan_Set.pdf` })
    const compId = rid()
    await insert('quote_comparisons', { id: compId, project_id: projectId, title: `${pick(subVendors, p).trade} package`, trade: pick(subVendors, p).trade, bid_request_id: brId, created_by: userId, requirements: 'Full scope per RFQ drawings.' })
    for (let q = 0; q < 3; q++) {
      const v = pick(subVendors, p + q)
      const inviteRow = await insert('bid_invites', { bid_request_id: brId, token: rid().replace(/-/g, ''), vendor_company_id: vendorIds[v.name], vendor_name: v.name, vendor_email: v.email, status: q < 2 ? 'submitted' : 'invited' })
      const total = round2(proj.budget * (0.08 + q * 0.03))
      if (q < 2) {
        await insert('bid_submissions', { bid_request_id: brId, bid_invite_id: inviteRow[0].id, amount: total, notes: `${v.trade} proposal - includes testing and closeout.`, file_url: SAMPLE_PDF, file_name: `${v.name.split(' ')[0]}_Proposal.pdf`, submitted_by_name: v.name })
        await insert('quotes', { comparison_id: compId, file_url: SAMPLE_PDF, file_name: `${v.name.split(' ')[0]}_Proposal.pdf`, vendor_name: v.name, total_amount: total, valid_until: ymd(daysFromNow(20)), scope_summary: `${v.trade} full scope per RFQ.` })
      }
    }

    await insert('project_activity', [
      { project_id: projectId, actor_name: 'Demo Admin', actor_id: userId, type: 'invoice_approved', message: 'Approved an invoice', metadata: {} },
      { project_id: projectId, actor_name: 'Mike Torres', type: 'daily_log_submitted', message: 'Filed a daily log', metadata: {} },
      { project_id: projectId, actor_name: 'Demo Admin', actor_id: userId, type: 'quote_awarded', message: 'Awarded a quote', metadata: {} },
      { project_id: projectId, actor_name: 'Chris Nguyen', type: 'inspection_added', message: 'Passed an inspection', metadata: {} },
    ])

    log(`seeded ${p}/${PROJECTS.length}  ${proj.name}`)
  }

  return { email: DEMO_EMAIL, password, projects: PROJECTS.length }
}
