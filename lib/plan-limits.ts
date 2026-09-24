import { PLANS, planForProjects, planForScans, type Plan } from './plans'
import type { Access } from './billing-state'
import { dateWords } from './dates'

// ─────────────────────────────────────────────────────────────────────────────
// Where a company is against what it bought.
//
// THE SCREEN THIS REPLACES WAS ENTIRELY MADE UP. Settings -> Billing drew three
// progress bars: "Team Members 3 / 5", "Projects 0 / 10", "Storage 0 / 5 GB".
// The 0s were literals, the 5 and the 10 were caps no plan has ever had, and
// the card above it said "Starter Plan" - a tier name that was deleted from
// this product for being invented. Every pixel of it was a claim about a
// customer's account that nothing computed, and a bar at 0% is the most
// convincing way there is to say "you have plenty left".
//
// So: the limits come off the plan, the numbers come off a COUNT, and the two
// meet here. Nothing in this file stores anything.
//
// WHAT COUNTS AS AN ACTIVE PROJECT is the load-bearing decision, because the
// tiers meter exactly that and the answer decides whether somebody is over.
// A job being planned and a job on hold are both jobs you are carrying, so they
// hold a slot; a completed or cancelled one does not. The screen NAMES this
// rather than leaving it to be discovered at the moment a create is refused.
// ─────────────────────────────────────────────────────────────────────────────

/** The statuses that occupy one of the plan's slots. */
export const COUNTED_PROJECT_STATUSES = ['planning', 'active', 'on_hold'] as const

/** Said out loud on the billing screen, so the count can be checked by eye. */
export const COUNTED_PROJECT_LABEL = 'Planning, active and on-hold jobs count. Completed and cancelled ones do not.'

export interface Usage {
  activeProjects: number
  scansThisMonth: number
}

export interface Entitlement {
  /** Active projects allowed, null for no limit. */
  projects: number | null
  /** AI scans a month, null for no limit. */
  scans: number | null
  source: 'plan' | 'trial' | 'comped' | 'none'
}

/**
 * What this company may use right now.
 *
 * A trial is not a stripped-down product - it is "the whole thing on a real
 * job", which is what the website promises - so it runs on the allowance of
 * the plan most people buy rather than the cheapest one. A company we have
 * comped is uncapped on purpose: we turned the meter off for them deliberately,
 * and metering them anyway is how a favour turns into a support ticket.
 */
export function entitlement(access: Access): Entitlement {
  if (access.plan) {
    return { projects: access.plan.projectLimit, scans: access.plan.scans, source: 'plan' }
  }
  if (access.state === 'trial') {
    const trialPlan = PLANS.find(p => p.featured) ?? PLANS[PLANS.length - 1]
    return { projects: trialPlan.projectLimit, scans: trialPlan.scans, source: 'trial' }
  }
  if (access.state === 'comped') return { projects: null, scans: null, source: 'comped' }
  return { projects: null, scans: null, source: 'none' }
}

export interface Meter {
  key: 'projects' | 'scans'
  label: string
  used: number
  /** null means uncapped, which is drawn as a number and no bar. */
  limit: number | null
  /** 0-100, or null when there is nothing to fill. */
  pct: number | null
  tone: 'ok' | 'warn' | 'danger'
  /** What the row says under the numbers. Always present. */
  note: string
}

/** Where a bar turns amber: the last fifth of the allowance. */
export const METER_WARN_AT = 0.8

function meterTone(used: number, limit: number | null): 'ok' | 'warn' | 'danger' {
  if (limit === null || limit === 0) return 'ok'
  if (used >= limit) return 'danger'
  return used / limit >= METER_WARN_AT ? 'warn' : 'ok'
}

/**
 * The two rows the billing screen draws.
 *
 * Storage is deliberately NOT among them. The old card metered it against
 * 5 GB, which is not a number this product sells, meters, or has ever looked
 * up - a bar with no question behind it.
 */
export function usageMeters(usage: Usage, ent: Entitlement, now: Date = new Date()): Meter[] {
  const projects: Meter = {
    key: 'projects',
    label: 'Active projects',
    used: usage.activeProjects,
    limit: ent.projects,
    pct: ent.projects === null ? null : Math.min(100, Math.round((usage.activeProjects / ent.projects) * 100)),
    tone: meterTone(usage.activeProjects, ent.projects),
    note: COUNTED_PROJECT_LABEL,
  }
  const scans: Meter = {
    key: 'scans',
    label: 'AI scans this month',
    used: usage.scansThisMonth,
    limit: ent.scans,
    pct: ent.scans === null ? null : Math.min(100, Math.round((usage.scansThisMonth / ent.scans) * 100)),
    tone: meterTone(usage.scansThisMonth, ent.scans),
    note: `Counted per calendar month. Resets ${dateWords(nextResetIso(now))}.`,
  }
  return [projects, scans]
}

// ── the month window the scan count is taken over ───────────────────────────
// A calendar month, in the reader's own time, because "this month" on a screen
// means the month on the wall behind it. Both ends are computed from one
// function so the number the meter prints and the number the guard counts
// cannot be taken over different windows - which is the failure the inspection
// reminder had when its SQL horizon and its rule counted days differently.

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** First moment of the current calendar month, as a local-midnight ISO date. */
export function scanWindowStart(now: Date = new Date()): string {
  return iso(new Date(now.getFullYear(), now.getMonth(), 1))
}

/** The day the allowance refills. */
export function nextResetIso(now: Date = new Date()): string {
  return iso(new Date(now.getFullYear(), now.getMonth() + 1, 1))
}

// ── the two refusals ────────────────────────────────────────────────────────
// Both NAME the cheapest plan that would fit, because "you have reached your
// limit" tells somebody they are stuck and nothing else. A refusal that does
// not say what to do about it is a disabled button with more words.

/** Why a new active project cannot be added, or null if it can. */
export function projectLimitProblem(ent: Entitlement, activeProjects: number): string | null {
  if (ent.projects === null) return null
  if (activeProjects < ent.projects) return null
  const fits = planForProjects(activeProjects + 1)
  const next = fits ? ` ${fits.name} covers ${activeProjects + 1}.` : ''
  return `You are running ${activeProjects} active ${activeProjects === 1 ? 'job' : 'jobs'}, which is all your plan allows.` +
    ` Close out a finished job or move up a plan - nothing is deleted either way.${next}`
}

/** Why a scan cannot run, or null if it can. */
export function scanLimitProblem(ent: Entitlement, scansThisMonth: number, now: Date = new Date()): string | null {
  if (ent.scans === null) return null
  if (scansThisMonth < ent.scans) return null
  const fits = planForScans(scansThisMonth + 1)
  const next = fits ? ` ${fits.name} includes ${fits.scans.toLocaleString('en-US')} a month.` : ''
  return `You have used all ${ent.scans.toLocaleString('en-US')} AI scans on your plan this month.` +
    ` The allowance refills on ${dateWords(nextResetIso(now))}; everything else in SyteNav keeps working.${next}`
}
