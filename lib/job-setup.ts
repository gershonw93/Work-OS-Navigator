// ─────────────────────────────────────────────────────────────────────────────
// Setting up a job that already exists.
//
// Not the same question as the Active pre-flight (api/.../readiness), which
// asks "is this safe to mark under contract". This asks "what have I not put in
// yet", in the order you would actually do it, on a job you are adding to
// SyteNav after the work has already been won.
//
// ORDER IS THE POINT. Each step exists because the ones after it are worse
// without it: a budget with no contract type tracks the wrong thing, a sub with
// no budget line has nowhere for its bills to land, and asking for insurance
// before you have named the sub is asking about nobody.
// ─────────────────────────────────────────────────────────────────────────────

export interface SetupFacts {
  hasAddress: boolean
  hasContractType: boolean
  hasClient: boolean
  budgetLines: number
  plans: number
  teamMembers: number
  subcontracts: number
  complianceDocs: number
  scheduleItems: number
  /** The client portal has been shared at least once. */
  shared: boolean
  /** AIA jobs bill by pay application, so some copy changes. */
  billingMode: string
  /**
   * 'cost_plus' | 'fixed_price' | 'spec', or null if not answered yet.
   *
   * A SPEC BUILD HAS NO CLIENT - the card that offers it says so in as many
   * words: "No client - you are building it to sell." Without this the
   * checklist listed "Put the client on the job" as ESSENTIAL on such a job,
   * which can never be done, so the setup could never finish and the count
   * read "1 still needed" forever. Same contradiction #344 fixed on the
   * project form, in the one place that had not heard about it.
   */
  contractType?: string | null
}

export interface SetupStep {
  key: string
  /** What you are doing, as an instruction. */
  label: string
  /** Why it comes here rather than later. */
  why: string
  done: boolean
  /** What is there now, or what is missing. */
  detail: string
  /** Tab slug to send them to. */
  href: string
  cta: string
  /** True when the job cannot really function without it. */
  essential: boolean
}

const plural = (n: number, one: string, many = one + 's') =>
  `${n} ${n === 1 ? one : many}`

export function setupSteps(f: SetupFacts): SetupStep[] {
  return [
    {
      key: 'details',
      label: 'Fill in the job details',
      why: 'The address puts it on the map, and the dates drive the schedule and every "is this late" answer.',
      done: f.hasAddress,
      detail: f.hasAddress ? 'Address is set' : 'No address yet',
      href: 'plans',
      cta: 'Open project settings',
      essential: true,
    },
    {
      key: 'contract',
      label: 'Say how the job pays you',
      why: 'Cost-plus, fixed price or building to sell. Do this BEFORE the budget - it decides whether the budget tracks your markup or a contract value, and a budget built against the wrong one has to be re-read later.',
      done: f.hasContractType,
      detail: f.hasContractType ? 'Answered' : 'Not answered - the Budget tab will ask',
      href: 'budget',
      cta: 'Answer it on the Budget tab',
      essential: true,
    },
    // Dropped entirely on a spec build rather than marked done: it is not a
    // step somebody completed, it is a step that does not apply.
    ...(f.contractType === 'spec' ? [] : [{
      key: 'client',
      label: 'Put the client on the job',
      why: 'They are who the invoices and the portal are for. Adding them now means you never retype the name onto a document later.',
      done: f.hasClient,
      detail: f.hasClient ? 'Client is set' : 'No client on this job',
      href: 'plans',
      cta: 'Add in project settings',
      essential: true,
    }]),
    {
      key: 'budget',
      label: 'Bring the budget in',
      why: 'Everything money-related hangs off these lines - what a sub is committed to, where their bills land, what is left. Import the sheet you already have rather than retyping it.',
      done: f.budgetLines > 0,
      detail: f.budgetLines > 0 ? plural(f.budgetLines, 'line') : 'Nothing budgeted yet',
      href: 'budget',
      cta: 'Add or import the budget',
      essential: true,
    },
    {
      key: 'plans',
      label: 'Upload the drawings',
      why: 'Drop the whole set at once. Subs quote off these, and you can send them with a request without re-uploading.',
      done: f.plans > 0,
      detail: f.plans > 0 ? plural(f.plans, 'plan') : 'No drawings yet',
      href: 'plans',
      cta: 'Drop the drawings in',
      essential: false,
    },
    {
      key: 'team',
      label: 'Add the people on this job',
      why: 'Your own crew and the client contacts. Anyone here can be assigned a task, and only people on the job see it.',
      done: f.teamMembers > 0,
      detail: f.teamMembers > 0 ? plural(f.teamMembers, 'person', 'people') : 'Nobody added yet',
      href: 'team',
      cta: 'Add people',
      essential: false,
    },
    {
      key: 'subs',
      label: 'Record the subs you have already awarded',
      why: 'A subcontract is what makes money Committed, and it is what a bill attaches to. On a job already under way this is usually the biggest catch-up - each sub, their trade, and what they are contracted for.',
      done: f.subcontracts > 0,
      detail: f.subcontracts > 0 ? plural(f.subcontracts, 'subcontract') : 'None recorded yet',
      href: 'team',
      cta: 'Add subcontracts',
      essential: true,
    },
    {
      key: 'compliance',
      label: 'Collect insurance and W-9s',
      why: 'After the subs are named, because you are requesting from THEM. Send one link and they upload it themselves - no account needed at their end.',
      done: f.complianceDocs > 0,
      detail: f.complianceDocs > 0 ? plural(f.complianceDocs, 'document') : 'Nothing collected yet',
      href: 'compliance',
      cta: 'Request documents',
      essential: false,
    },
    {
      key: 'schedule',
      label: 'Lay out the schedule',
      why: 'Even roughly. It drives what shows as late, what the client sees on their portal, and the decide-by dates on selections.',
      done: f.scheduleItems > 0,
      detail: f.scheduleItems > 0 ? plural(f.scheduleItems, 'item') : 'Nothing scheduled yet',
      href: 'schedule',
      cta: 'Build the schedule',
      essential: false,
    },
    {
      key: 'share',
      label: 'Give the client their link',
      why: 'Last, once there is something worth looking at. One link, no account, and it covers progress, selections and their invoices.',
      done: f.shared,
      detail: f.shared ? 'Shared' : 'Not shared yet',
      href: 'sharing',
      cta: 'Share the portal',
      essential: false,
    },
  ]
}

export interface SetupProgress {
  steps: SetupStep[]
  done: number
  total: number
  /** Essentials outstanding - the ones worth nagging about. */
  essentialsLeft: number
  /** The step to do next: first unfinished, essentials first. */
  next: SetupStep | null
  complete: boolean
}

export function setupProgress(f: SetupFacts): SetupProgress {
  const steps = setupSteps(f)
  const done = steps.filter(s => s.done).length
  const outstanding = steps.filter(s => !s.done)
  // Essentials first, but otherwise in the order above - the order IS the
  // advice, so "next" must not jump around as things get ticked off.
  const next = outstanding.find(s => s.essential) ?? outstanding[0] ?? null
  return {
    steps,
    done,
    total: steps.length,
    essentialsLeft: outstanding.filter(s => s.essential).length,
    next,
    complete: done === steps.length,
  }
}
