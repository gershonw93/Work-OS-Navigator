// ─────────────────────────────────────────────────────────────────────────────
// The flows, for the marketing site.
//
// The site sells AREAS - money, AI, features - which is what every competitor
// does and why they all read the same. A feature list says "we have change
// orders"; so does everyone. A flow says what actually happens on a Tuesday,
// and nobody can claim it without having built it.
//
// EVERY STEP CARRIES A WIN AND A LOSS. The loss is the point: it is the money
// or the argument you are already eating today, written plainly. A flow with
// only the happy path is a feature list with arrows drawn on it.
//
// ACCURACY RULE: this is a public promise, so nothing here describes something
// the app does not do. Where the app produces a link for you to send rather
// than sending it itself, the copy says so - a reader who assumes we email the
// sub finds out the hard way, and that costs more trust than the sentence buys.
// ─────────────────────────────────────────────────────────────────────────────

export interface FlowStep {
  /** What happens, in the builder's words. */
  act: string
  /** What you get out of it. Green. */
  win?: string
  /** What it costs you when this does not happen. Red. */
  loss?: string
}

export interface Flow {
  slug: string
  /** Tile title. Short enough to scan a grid of them. */
  title: string
  /** Tile description. One sentence, no jargon. */
  short: string
  /** Who recognises themselves in this one. */
  who: string
  /** The single number or fact this flow is really about. */
  stake: string
  steps: FlowStep[]
  /** The one-line summary of the whole thing, once it works. */
  outcome: string
}

export const FLOWS: Flow[] = [
  {
    slug: 'client-picks-over-allowance',
    title: 'The client picks the paint they cannot afford',
    short: 'An upgrade over allowance becomes a signed change order before anyone argues about it.',
    who: 'Anyone who has eaten an upgrade because it never got written up',
    stake: '$3,500',
    steps: [
      {
        act: 'Paint sits on the selections board with an $8,000 allowance and a decide-by date worked back from the lead time.',
        win: 'The deadline comes from how long the order takes, not from when framing happens to end.',
        loss: 'A six-week window order decided the week framing finishes is already late, and nobody notices until it is.',
      },
      {
        act: 'The client opens their portal link - the same one they already have. No account, no app, no password.',
        win: 'One link for everything they owe you an answer on.',
        loss: 'Chasing a client who never installed anything, by text, at nine at night.',
      },
      {
        act: 'They pick the $11,500 one. The screen tells them the allowance is $8,000 and this is $3,500 more - before they commit.',
        win: 'They see the overage themselves, in their own time.',
        loss: 'You having that conversation after the paint is on the wall.',
      },
      {
        act: 'One click raises a change order for the $3,500, against the paint line, already written.',
        win: 'Thirty seconds, and it is on the right line.',
        loss: 'A $3,500 upgrade that never became a change order, because writing one up took twenty minutes you did not have.',
      },
      {
        act: 'The client approves it on the same link.',
      },
      {
        act: 'The paint line goes from $8,000 to $11,500 and says so: "incl. $3,500 CO". Your original estimate is untouched underneath.',
        win: 'At the end of the job you can still tell a bad estimate apart from a client who kept adding.',
        loss: 'Most tools overwrite the budget when a change order lands. That answer is gone for good.',
      },
      {
        act: 'When you order it, the supplier and the real price land on the same line.',
      },
    ],
    outcome: 'A signed change order, on the right line, before the tin is opened.',
  },

  {
    slug: 'bring-a-sub-on',
    title: 'Bringing a sub onto the job',
    short: 'Quote, award, contract, insurance and his first bill - one thread, nothing typed twice.',
    who: 'Whoever does the buy-out and then chases the paperwork',
    stake: 'A week of admin per trade',
    steps: [
      {
        act: 'You raise a quote request from the job. It picks up the plans already on the job - no re-uploading.',
        win: 'The scope and the drawings go out together.',
        loss: 'Emailing a 40MB drawing set to three subs, twice, because one bounced.',
      },
      {
        act: 'You get a private link for each sub to send them. They open it on a phone and price it - no account, no password, nothing to install.',
        win: 'Subs actually respond, because there is nothing to sign up for.',
        loss: 'The best sub not bidding because he could not be bothered making an account.',
      },
      {
        act: 'The quotes come back on the same lines, so you compare like for like instead of squinting at three different PDFs.',
        win: 'You can see who is cheap because they are cheap, and who is cheap because they left something out.',
        loss: 'Awarding the low number and finding the exclusion in month three.',
      },
      {
        act: 'You award one. That second he becomes a subcontract, his price becomes Committed money, and it lands on the right budget line.',
        win: 'Your budget is current before you have put the phone down.',
        loss: 'A signed contract nobody added to the budget, so the job looks like it has money it does not.',
      },
      {
        act: 'One more link collects his insurance and W-9. He uploads them himself, and you are told before the certificate expires - not after.',
        win: 'A lapsed COI turns up on a screen instead of at a claim.',
        loss: 'Finding out his cover expired in March, in July, from an adjuster.',
      },
      {
        act: 'He finishes and emails a bill. You drag the PDF onto the job - it reads who, how much and what for, and checks it against the price he quoted.',
        win: 'A bill that does not match its quote is flagged in red before you approve it.',
        loss: 'Approving $31,400 against a $28,000 quote because nobody had the quote open.',
      },
      {
        act: 'You approve it. The budget line moves. One tap bills the client for it with your markup already on.',
      },
    ],
    outcome: 'Quote to contract to insurance to his bill to your bill, without retyping any of it.',
  },

  {
    slug: 'bill-that-does-not-match',
    title: 'The bill that does not match the quote',
    short: 'He quoted $28,000 and billed $31,400. You find out before you approve it.',
    who: 'Anyone approving invoices faster than they can check them',
    stake: '$3,400, quietly',
    steps: [
      {
        act: 'The sub emails a PDF. You drag it onto the job.',
        win: 'No retyping the number, the date, or what it was for.',
        loss: 'Twenty minutes a bill, or a bookkeeper doing it next month.',
      },
      {
        act: 'It reads the bill and finds the subcontract it belongs to, and the line on his payment schedule.',
      },
      {
        act: 'It compares what he billed against what he quoted, line by line.',
        win: 'The mismatch is on screen in red, before the approve button.',
        loss: 'The overage found at the end of the job, when arguing about it costs you the relationship.',
      },
      {
        act: 'Nothing saves until you confirm it. You approve, and only then does it count as real cost.',
        win: 'Approving is a decision, not a formality.',
      },
    ],
    outcome: 'The difference is caught while it is still a question, not a fight.',
  },

  {
    slug: 'one-bill-two-trades',
    title: 'One supplier bill, two trades',
    short: 'Lumber and windows on the same invoice, split onto the lines they actually belong to.',
    who: 'Anyone whose supplier does not bill the way their budget is organised',
    stake: 'A budget that is wrong in two places at once',
    steps: [
      {
        act: 'A $40,000 supplier invoice arrives covering lumber and windows.',
        loss: 'It lands entirely on one line, so one trade looks over budget and the other looks untouched.',
      },
      {
        act: 'You split it: $30,000 to framing, $10,000 to windows. As many lines as it needs, at whatever amounts.',
        win: 'Both lines tell the truth.',
      },
      {
        act: 'It does not have to add up to the whole invoice. Whatever is left shows as unassigned rather than being quietly sent somewhere.',
        win: 'A half-sorted bill is an honest state, not a hidden one.',
        loss: 'Software that silently dumps the remainder somewhere you did not choose.',
      },
      {
        act: 'It can never add up to more than the invoice. That is refused.',
        win: 'You cannot overstate what has landed on your budget, even by accident.',
      },
    ],
    outcome: 'One bill, two lines, and neither of them lying to you.',
  },

  {
    slug: 'cost-plus-billed-right',
    title: 'Cost-plus, billed right',
    short: 'The electrician bills you $35,000. Your 15% goes on. The client owes $40,250.',
    who: 'Custom home builders billing cost plus a fee',
    stake: 'Your fee, on every single line',
    steps: [
      {
        act: 'You tell the job once that it is cost-plus at 15%.',
        win: 'The budget screen tracks your fee instead of asking for a contract value the job does not have.',
        loss: 'A screen asking what you are charging for a job where the answer is "whatever it costs, plus 15%".',
      },
      {
        act: 'The electrician bills $35,000. It shows cost, markup, and what to bill: $40,250.',
      },
      {
        act: 'The permit fee is a pass-through, so you tick "bill this at cost". The tile guy negotiated 10%, so that one gets its own rate.',
        win: 'Your fee is right per bill, not one percentage smeared over the job total.',
        loss: 'A flat multiply that quietly charges markup on a permit you agreed to pass through.',
      },
      {
        act: 'You raise the client invoice from the costs already recorded. Nothing is retyped, and a cost can only ever go on one invoice.',
        win: 'The same electrician bill cannot go out twice.',
        loss: 'Billing a client twice for the same thing - the mistake that costs a relationship rather than a correction.',
      },
      {
        act: 'One tick decides what they see: cost and your percentage on every line, or a single amount per line.',
        win: 'Open-book when the contract says open-book. Your margin is nobody else’s business when it is not.',
      },
    ],
    outcome: 'Your fee, on the right basis, on a bill the client can open on their phone.',
  },

  {
    slug: 'why-is-this-line-that-number',
    title: 'Why is this line at that number?',
    short: 'Click the budget line. Every bill, change order and receipt behind it.',
    who: 'Whoever gets asked that question in a meeting',
    stake: 'Twenty minutes and three open tabs',
    steps: [
      {
        act: 'A line reads $47,700 and you have no idea why.',
        loss: 'Opening three tabs and matching things up by the sub’s name.',
      },
      {
        act: 'You click it. The contract, every bill against it, every change order, every receipt.',
        win: 'The answer in one place, in one click.',
      },
      {
        act: 'Anything not yet approved is listed too, greyed out, with what it is waiting on.',
        win: 'You see what is coming, not just what has landed.',
        loss: 'Being surprised by a bill that was sitting in someone’s approval queue all along.',
      },
      {
        act: 'It is also where you set the markup for that trade - permits at cost, electrical at 15% - once, instead of on every bill as it arrives.',
      },
    ],
    outcome: 'Every number on the budget can explain itself.',
  },
]

export function flowBySlug(slug: string): Flow | undefined {
  return FLOWS.find(f => f.slug === slug)
}
