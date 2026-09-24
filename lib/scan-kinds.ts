// The doors an AI scan can come through.
//
// ITS OWN FILE because it is DATA, and `lib/scan-guard.ts` - where it lived
// first - imports `next/server` and the Supabase client. A suite that wants to
// check the list ends up bundling a route runtime, which fails on `__dirname`
// before a single assertion runs. Pure facts live where a test can reach them.
export const SCAN_KINDS = [
  'invoice',
  'quote',
  'quote-comparison',
  'bid-response',
  'estimate',
  'proposal',
  'permit',
  'inspection',
  'inspection-card',
  'compliance',
  'submittal',
  'material',
] as const

export type ScanKind = (typeof SCAN_KINDS)[number]
