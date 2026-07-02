import Anthropic from '@anthropic-ai/sdk'

export interface ComplianceFields {
  doc_type?: string
  company_name?: string | null
  expiry_date?: string | null
  status?: string | null
  insurer?: string | null
  policy_number?: string | null
  gl_per_occurrence?: number | null
  gl_aggregate?: number | null
  auto_limit?: number | null
  umbrella_limit?: number | null
  wc_el_accident?: number | null
  additional_insured?: boolean | null
  license_number?: string | null
  license_type?: string | null
  issuing_state?: string | null
  entity_type?: string | null
  ein_last4?: string | null
  wc_carrier?: string | null
  wc_policy_number?: string | null
  wc_el_disease_limit?: number | null
  notes?: string | null
}

const PROMPT = `This is a construction subcontractor compliance document. Identify the document type and extract structured fields. Return ONLY a JSON object:
{
  "doc_type": "one of: coi, license, w9, workers_comp, other",
  "company_name": "the company/insured name on the document or null",
  "expiry_date": "expiry/renewal date as YYYY-MM-DD or null",
  "effective_date": "policy start date as YYYY-MM-DD or null",
  "status": "approved if current and valid, expired if past expiry, pending otherwise",
  "insurer": "insurance company name or null",
  "policy_number": "policy number or null",
  "gl_per_occurrence": "general liability per occurrence limit as a number (e.g. 1000000) or null",
  "gl_aggregate": "general liability aggregate limit as a number or null",
  "auto_limit": "auto liability limit as a number or null",
  "umbrella_limit": "umbrella/excess limit as a number or null",
  "wc_el_accident": "workers comp EL per accident limit as a number or null",
  "additional_insured": true or false or null,
  "license_number": "license number or null",
  "license_type": "type of license e.g. General Contractor, Electrical, Plumbing or null",
  "issuing_state": "2-letter state code or null",
  "entity_type": "one of: individual, llc, corporation, partnership, other or null",
  "ein_last4": "last 4 digits of EIN/SSN or null",
  "wc_carrier": "workers comp carrier name or null",
  "wc_policy_number": "workers comp policy number or null",
  "wc_el_disease_limit": "EL disease per employee limit as a number or null",
  "notes": "any important flags: exclusions, missing coverage, name mismatch, etc. Null if clean."
}
Return ONLY the JSON object.`

// Scan a compliance document with Claude and return the extracted fields.
// Throws on unreadable input — callers should catch and fall back to a plain upload.
export async function extractComplianceFields(file: File): Promise<ComplianceFields> {
  const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  const isPdf = file.type === 'application/pdf'
  if (!imageTypes.includes(file.type) && !isPdf) throw new Error('Unsupported file type')

  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const content: Anthropic.MessageParam['content'] = isPdf
    ? [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: PROMPT },
      ]
    : [
        { type: 'image', source: { type: 'base64', media_type: file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: base64 } },
        { type: 'text', text: PROMPT },
      ]

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    messages: [{ role: 'user', content }],
  })
  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim()
  return JSON.parse(cleaned) as ComplianceFields
}

// Build the same human-readable summary line the manual upload form stores in notes.
export function buildComplianceSummary(type: string, f: ComplianceFields): string {
  const parts: string[] = []
  const money = (n: unknown) => `$${Number(n).toLocaleString()}`
  if (type === 'coi') {
    if (f.gl_per_occurrence) parts.push(`GL ${money(f.gl_per_occurrence)}`)
    if (f.gl_aggregate) parts.push(`Agg ${money(f.gl_aggregate)}`)
    if (f.auto_limit) parts.push(`Auto ${money(f.auto_limit)}`)
    if (f.umbrella_limit) parts.push(`Umbrella ${money(f.umbrella_limit)}`)
    if (f.wc_el_accident) parts.push(`WC/EL ${money(f.wc_el_accident)}`)
    if (f.insurer) parts.push(`Insurer: ${f.insurer}`)
    if (f.policy_number) parts.push(`Policy: ${f.policy_number}`)
    if (f.additional_insured != null) parts.push(`Add'l Insured: ${f.additional_insured ? 'Yes' : 'No'}`)
  } else if (type === 'license') {
    if (f.license_type) parts.push(String(f.license_type))
    if (f.license_number) parts.push(`#${f.license_number}`)
    if (f.issuing_state) parts.push(String(f.issuing_state))
  } else if (type === 'w9') {
    if (f.entity_type) parts.push(String(f.entity_type).replace('_', ' '))
    if (f.ein_last4) parts.push(`EIN …${f.ein_last4}`)
  } else if (type === 'workers_comp') {
    if (f.wc_carrier) parts.push(String(f.wc_carrier))
    if (f.wc_policy_number) parts.push(`Policy: ${f.wc_policy_number}`)
    if (f.wc_el_accident) parts.push(`EL/Accident ${money(f.wc_el_accident)}`)
  }
  return parts.join(' · ')
}
