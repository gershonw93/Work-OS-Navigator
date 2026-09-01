// ─────────────────────────────────────────────────────────────────────────────
// The activation gate, wired to the database.
//
// lib/activation.ts holds the RULE and stays pure so it can be tested without a
// server. This is the thin part that reads a job's facts and turns a refusal
// into a response - shared by every door that can set a project Active, so they
// cannot drift apart the way the pre-flight and the Edit dialog did.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'
import { asContractType } from './contract-type'
import { type ActivationFacts, acknowledgedAll, activationRefusal } from './activation'

/**
 * Read what the gate needs to judge this job.
 *
 * Every column here was checked against the live schema - `projects` really does
 * carry contract_type, contractor_fee_pct, sellout_amount and billing_mode.
 * Supabase answers `data: null` for an unknown column rather than erroring, so a
 * typo would read as "job not found" and quietly let everything through.
 */
export async function activationFacts(db: any, projectId: string): Promise<ActivationFacts> {
  const [{ data: project }, { count }] = await Promise.all([
    db.from('projects')
      .select('contract_type, contractor_fee_pct, sellout_amount, billing_mode')
      .eq('id', projectId)
      .maybeSingle(),
    db.from('budget_line_items')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId),
  ])

  const p: any = project ?? {}
  return {
    contractType: asContractType(p.contract_type),
    budgetLines: count ?? 0,
    contractorFeePct: Number(p.contractor_fee_pct ?? 0) || 0,
    // null and 0 are different facts: "no figure yet" versus "it is zero".
    // Both fail the gate, but only one of them is somebody's answer.
    selloutAmount: p.sellout_amount == null ? null : Number(p.sellout_amount),
    billingMode: p.billing_mode ?? 'simple',
  }
}

/**
 * Refuse an unacknowledged activation, or return null to let it through.
 *
 * Only ever consulted on planning -> active. Every other transition is one
 * click, as it always was: On hold and Completed do not put a number in front of
 * anybody, and a job that has to be paused should never need a budget first.
 */
export async function guardActivation(
  db: any,
  projectId: string,
  acknowledge: unknown,
): Promise<NextResponse | null> {
  const facts = await activationFacts(db, projectId)
  if (acknowledgedAll(facts, acknowledge)) return null
  return NextResponse.json({ error: activationRefusal(facts), needsAcknowledgement: true }, { status: 400 })
}
