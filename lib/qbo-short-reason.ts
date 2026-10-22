// ─────────────────────────────────────────────────────────────────────────────
// QuickBooks' refusal in a few words, for the row it happened on. Pure.
//
// The full message is two sentences of Intuit's wording - "Invalid Customer -
// The customer you have specified has been deleted. You cannot create or edit
// a transaction with a deleted customer. (QuickBooks code 6250)" - and it sat
// in a hover tooltip, which a phone does not have, so the pilot saw a red chip
// and no reason at all. The row carries the short version; the full one stays
// in the tooltip and in Settings -> Recent sync activity.
//
// QuickBooks says "deleted" for a customer somebody made INACTIVE, which is
// what a person did and what they will look for, so the short version says
// inactive.
// ─────────────────────────────────────────────────────────────────────────────

const RULES: [RegExp, RegExp | null, string][] = [
  [/customer/i, /deleted|inactive/i, 'Customer is inactive in QuickBooks'],
  [/vendor/i, /deleted|inactive/i, 'Sub (vendor) is inactive in QuickBooks'],
  [/payment method/i, /inactive/i, 'Payment method is inactive in QuickBooks'],
  [/account|item/i, /deleted|inactive/i, 'An account or item is inactive in QuickBooks'],
  [/zero balance/i, null, 'That invoice or bill is already settled in QuickBooks'],
  [/duplicate/i, null, 'QuickBooks says this is a duplicate'],
  [/reconnect|not connected|invalid_grant|unauthori[sz]ed/i, null, 'QuickBooks needs reconnecting'],
]

export function qbShortReason(message: string | null | undefined): string {
  const raw = String(message ?? '').replace(/\s*\(QuickBooks code \d+\)\s*/gi, ' ').trim()
  if (!raw) return 'QuickBooks refused it'
  for (const [topic, state, words] of RULES) {
    if (topic.test(raw) && (!state || state.test(raw))) return words
  }
  const head = raw.split(' - ')[0].trim()
  const pick = head.length >= 8 && head.length <= 60 ? head : raw
  return pick.length > 80 ? `${pick.slice(0, 77).trimEnd()}...` : pick
}
