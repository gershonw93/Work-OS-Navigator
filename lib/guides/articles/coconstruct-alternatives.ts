import type { Guide } from '../schema'
import { SYTENAV_FIT, PLANS_SENTENCE, plansLink, QBO_ONE_WAY } from '../sytenav'

export const guide: Guide = {
  slug: 'coconstruct-alternatives',
  title: 'CoConstruct alternatives: what to do now CoConstruct is becoming Buildertrend',
  cardTitle: 'CoConstruct alternatives (2026)',
  metaTitle: 'CoConstruct Alternatives (2026): Moving Off CoConstruct | SyteNav',
  description:
    'CoConstruct is being folded into Buildertrend. What the migration means, when moving to Buildertrend is the right call, and how to evaluate a CoConstruct alternative.',
  keyword: 'coconstruct alternative',
  keywords: [
    'coconstruct alternative', 'coconstruct alternatives', 'coconstruct shutting down', 'coconstruct migration',
    'coconstruct to buildertrend', 'replace coconstruct', 'coconstruct end of life', 'coconstruct replacement',
  ],
  category: 'compare',
  published: '2026-10-20',
  lede:
    'If you run on CoConstruct, the decision has been made for you in one sense: CoConstruct is becoming part of Buildertrend, and new projects will have to go somewhere else. The useful question is not whether to move but where, and the migration is the cheapest moment you will ever get to ask it.',
  takeaways: [
    'Buildertrend announced its acquisition of CoConstruct in 2021, and says CoConstruct is now fully part of Buildertrend rather than a separate platform.',
    'CoConstruct’s migration page says projects can be added to CoConstruct until a published cut-off date; after that new projects go in Buildertrend, and existing project history stays accessible.',
    'Moving to Buildertrend is the designed path and the least disruption for a builder who liked CoConstruct’s homeowner and selections workflow.',
    'If CoConstruct was never a perfect fit - most often on job cost and sub billing - a forced move is the right time to look further.',
  ],
  blocks: [
    { type: 'p', text: 'This guide is written by SyteNav, which competes with Buildertrend. Statements about CoConstruct and Buildertrend link to their own pages and say what those pages say, as of October 2026. We have tried to be fair to the obvious answer, which is to move to Buildertrend.' },

    { type: 'h2', text: 'What is happening to CoConstruct' },
    { type: 'p', text: 'Buildertrend announced its acquisition of CoConstruct in February 2021. Buildertrend’s CoConstruct comparison page now says CoConstruct is fully part of Buildertrend, no longer a separate platform, and the CoConstruct homepage describes the transition to Buildertrend as entering its final phase.' },
    { type: 'p', text: 'CoConstruct’s migration page sets out the timeline: projects can still be added to CoConstruct through March 31, 2027, after which new projects go into Buildertrend. It says no project data will be lost and that CoConstruct stays accessible for historical project information. We have not found a date for CoConstruct being switched off, and we will not guess one.' },

    { type: 'h2', text: 'Option one: move to Buildertrend' },
    { type: 'p', text: 'For most CoConstruct customers this is the right answer, and it is worth saying plainly. CoConstruct was built for custom home builders, remodelers and design-build firms: estimating that carried through to selections, specs and proposals, selections with deadlines and client sign-off, and a client portal. Buildertrend is built for the same customers, and the migration has been designed by the people who own both products.' },
    { type: 'list', items: [
      'Your history is preserved on the path the vendor designed, and support for the move comes from the company that owns both systems.',
      'The homeowner side - selections, allowances, a client portal, warranty - is Buildertrend’s strength, and it is what CoConstruct customers chose CoConstruct for.',
      'Your team learns one new tool rather than evaluating several under deadline.',
    ] },
    { type: 'p', text: 'The cost to check is price. Buildertrend’s pricing page describes a custom quote based on builder type, annual revenue and business needs, which may land differently from what you pay today. Get the quote early, while you still have time to act on it.' },

    { type: 'h2', text: 'Option two: use the move to re-evaluate' },
    { type: 'p', text: 'A forced migration is the one time switching costs are the same whichever system you pick, because you are moving anyway. It is worth a look elsewhere if any of these were true on CoConstruct:' },
    { type: 'list', items: [
      'JOB COST NEVER QUITE RECONCILED. If you checked real costs in QuickBooks because the job cost screen could not be trusted, a new system should be judged on that first.',
      'SUB BILLS WERE CHECKED BY HAND. If nobody compared a sub’s bill to their quote before it was paid, that is money a system could have caught.',
      'YOU HAVE MOVED AWAY FROM CUSTOM HOMES. Builders who have grown into spec, multifamily or light commercial work may need less homeowner tooling and more subcontract control.',
      'THE PRICE CHANGES. If the Buildertrend quote is a step up, it is a reasonable moment to compare.',
    ] },

    { type: 'callout', tone: 'tip', title: 'Do not migrate a half-built job twice', text: 'Whatever you choose, finish existing CoConstruct jobs where they are if you can, and start new jobs in the new system. Re-entering a job at 60% complete - its budget, awarded subs, spent costs and open change orders - is the most expensive part of any move.' },

    { type: 'compare', title: 'Which way to go', left: {
      label: 'Move to Buildertrend',
      items: [
        'Custom homes and remodels are still the core',
        'Selections and the client portal matter most',
        'You want the vendor-designed migration path',
        'The Buildertrend quote works for you',
      ],
    }, right: {
      label: 'Evaluate an alternative',
      items: [
        'Job cost and sub billing were the weak spot',
        'Your work has shifted toward subcontracted jobs',
        'You want pricing by jobs rather than revenue',
        'You are starting enough new jobs to move cleanly',
      ],
    } },

    { type: 'h2', text: 'How to evaluate an alternative in the time you have' },
    { type: 'steps', items: [
      'Export what you can from CoConstruct now - budgets, selections, documents, photos - so the decision is not made under deadline.',
      'Pick one new job and run it in the candidate system from day one.',
      'Enter real sub quotes and bills from that job and see what the system checks before you approve.',
      'Approve one change order and confirm the budget, the sub’s contract and the client invoice all moved.',
      'Ask your bookkeeper to confirm what reaches QuickBooks and in which direction, before you commit.',
    ] },

    { type: 'h2', text: 'Where SyteNav fits' },
    { type: 'p', text: `SyteNav is built for ${SYTENAV_FIT}. For a CoConstruct customer the honest comparison is this: SyteNav has selections and a client portal, but the homeowner experience is not where it is deepest. Its depth is the money - quotes scanned into the budget, sub bills checked against what each sub quoted, change orders that raise the budget line and the subcontract together, and client invoices built from approved costs. ${PLANS_SENTENCE}` },
    { type: 'p', text: `What it does not do: there is no import from CoConstruct, no warranty module and no sales pipeline, and ${QBO_ONE_WAY}. If CoConstruct’s homeowner workflow is what you valued, Buildertrend is the closer match.` },
  ],
  links: [
    { text: 'Buildertrend announced its acquisition of CoConstruct in February 2021', href: 'https://buildertrend.com/press-releases/coconstruct-acquisition/' },
    { text: 'Buildertrend’s CoConstruct comparison page', href: 'https://buildertrend.com/buildertrend-vs-coconstruct/' },
    { text: 'CoConstruct’s migration page sets out the timeline', href: 'https://www.coconstruct.com/migration' },
    { text: 'Buildertrend’s pricing page describes a custom quote', href: 'https://buildertrend.com/pricing/' },
    { text: 'sub bills checked against what each sub quoted', href: '/guides/construction-invoice-verification' },
    { text: 'Buildertrend is the closer match', href: '/guides/buildertrend-alternatives' },
    { text: 'the CoConstruct homepage describes the transition', href: 'https://www.coconstruct.com/' },
    { text: 'CoConstruct was built for custom home builders, remodelers and design-build firms', href: 'https://www.coconstruct.com/why-choose-us' },
    { text: 'Buildertrend’s own pages answer no', href: 'https://buildertrend.com/integration/quickbooks/' },
    plansLink,
  ],
  faqs: [
    { q: 'Is CoConstruct shutting down?', a: 'Buildertrend says CoConstruct is now fully part of Buildertrend. CoConstruct’s migration page says projects can be added until March 31, 2027, after which new projects go in Buildertrend, and that historical project information stays accessible. We have not seen a published date for CoConstruct being switched off.' },
    { q: 'Can I still buy CoConstruct?', a: 'Buildertrend’s own pages answer no: CoConstruct is now part of Buildertrend and is not sold as a separate product.' },
    { q: 'Will I lose my CoConstruct data?', a: 'CoConstruct’s migration page says no project data will be lost and that CoConstruct remains accessible for historical project information. Export what you rely on regardless, so the decision about where to go next is never made under pressure.' },
    { q: 'What is the best CoConstruct alternative?', a: 'For most custom home builders and remodelers, Buildertrend - it is the designed path and built for the same customers. If your weak spot on CoConstruct was job cost or sub billing, or your work has moved toward subcontracted jobs, the migration is the right moment to compare systems on those instead.' },
  ],
  related: ['buildertrend-alternatives', 'buildertrend-vs-procore', 'construction-job-cost-tracking'],
}
