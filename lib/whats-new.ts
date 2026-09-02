// ─────────────────────────────────────────────────────────────────────────────
// SyteNav - What's new
//
// IMPORTANT (working agreement): when you ship something a user would notice,
// add an entry here in the SAME change. Same rule as the Help Center. A feature
// nobody knows about may as well not exist, and a tester who has to guess what
// changed since last week will stop looking.
//
// Not everything belongs here. Internal refactors, build fixes, and anything a
// user could not possibly observe do not go in - this is a list of things that
// changed for THEM, not a commit log.
//
// Newest first. `date` is ISO (YYYY-MM-DD) and drives the "new since you last
// looked" badge, so keep it accurate.
// ─────────────────────────────────────────────────────────────────────────────

export type ReleaseKind = 'new' | 'improved' | 'fixed'

export interface ReleaseItem {
  kind: ReleaseKind
  title: string
  /** Plain-language: what it does for them, not how it was built. */
  text: string
  /** Slug of the Help article that explains it in full. */
  help?: string
  /** Where to go and try it. */
  href?: string
}

export interface Release {
  date: string
  /** The headline for the batch. */
  title: string
  items: ReleaseItem[]
}

export const KIND_LABEL: Record<ReleaseKind, string> = {
  new: 'New',
  improved: 'Improved',
  fixed: 'Fixed',
}

export const KIND_TINT: Record<ReleaseKind, string> = {
  new: 'bg-accent-tint text-accent-fg',
  improved: 'bg-info-tint text-info',
  fixed: 'bg-success-tint text-success',
}

export const RELEASES: Release[] = [
  {
    date: '2026-09-03',
    title: 'Raise a change order straight from the pay application',
    items: [
      {
        kind: 'new',
        title: '"Raise it with a change order" is now a link that does it',
        text: 'When a pay-app line is billed past its scheduled value, the words "change order" are a link. It opens the Change Orders screen with the change order already filled in - the exact overage, the line it belongs to, and a note saying which application it came from. Approve it and the draft offers to bring it in, and the line stops being over.',
        help: 'pay-applications',
        href: '/projects',
      },
      {
        kind: 'fixed',
        title: 'Change orders can now raise a specific budget line',
        text: 'A change order raised on the Change Orders screen never attached to a budget line, so it showed as its own "Approved change orders" row instead of raising the line it was for. That meant approving one to fix an overbilled line did not actually fix it. Change orders now carry the line they raise, and the form says which one so it is not a hidden setting.',
        help: 'change-order-basics',
        href: '/projects',
      },
      {
        kind: 'fixed',
        title: 'Subcontractor pay applications pick up change orders too',
        text: 'The "these approved change orders are not on this schedule yet" prompt only appeared on applications you send to the owner. It now appears on a subcontractor application as well, so approving a change order for their work updates their schedule the same way.',
        help: 'pay-applications',
        href: '/projects',
      },
    ],
  },
  {
    date: '2026-09-03',
    title: 'Screens that said "nothing here" when they meant "this did not load"',
    items: [
      {
        kind: 'fixed',
        title: 'The dashboard invited you to create your first job when you already had one',
        text: 'A change to the database made several queries fail, and the screens that used them quietly showed an empty state instead of an error. The dashboard offered to set up your first job on a company with a live job on it, and the admin Users list read "No users found" beside a count of 27. The queries are fixed, and those screens now tell you when something did not load instead of reporting that you have nothing.',
        href: '/dashboard',
      },
    ],
  },
  {
    date: '2026-09-03',
    title: 'Pay Apps opens again',
    items: [
      {
        kind: 'fixed',
        title: 'Opening a pay application showed a blank error page',
        text: 'Opening any pay application - or creating a new one - blanked out with "a client-side exception has occurred". It was every application, not a particular one: the screen broke on the changeover from loading to loaded. Fixed, and the check that catches this class of fault now runs before anything ships.',
        href: '/projects',
      },
    ],
  },
  {
    date: '2026-09-03',
    title: 'A job cannot go live without a budget or a price',
    items: [
      {
        kind: 'fixed',
        title: 'Setting a job Active checked nothing, from two of the three ways in',
        text: 'A job could be set to Active with no budget lines and no price at all, and nothing said a word. There is a pre-flight, but it only ever ran from the status badge in the project header - the Status dropdown in the Edit Project dialog and Quote → Convert both went straight through. All three now run the same check, and a job missing its budget or its price needs a tick in a box before it goes live. Nothing is refused outright: jobs do go under contract before the budget is typed up, and some really are at cost.',
        href: '/projects',
      },
      {
        kind: 'fixed',
        title: 'Building to sell was asked for a markup it does not have',
        text: 'The pre-flight asked every job for a markup percentage. On a building-to-sell or a fixed-price job the markup is not what you are paid - the sale price or the agreed price is - so it complained about a number that does not matter and never asked for the one that does. It now asks each job the question it actually has: "What will this job sell for?", "What are you charging for this job?", or the markup on cost-plus. If your spec jobs have never shown a profit figure, this is why.',
        href: '/projects',
      },
      {
        kind: 'improved',
        title: 'A draft pay application tells you when a change order came in late',
        text: 'Approving a change order after starting a draft used to leave that draft billing against the old contract sum. The draft now says how much approved change-order money is missing from its schedule, with a button to bring it in. It only raises scheduled values and adds the change-order row - anything you have already typed into this period is left alone. Certified and funded applications are never touched.',
        href: '/projects',
      },
    ],
  },
  {
    date: '2026-09-02',
    title: 'Approved change orders now reach the pay application',
    items: [
      {
        kind: 'fixed',
        title: 'A $50,000 approved change order never showed on the G702',
        text: 'A change order could be approved, show as Approved on the Change Orders tab, and the next pay application would still bill against the original contract sum - so approved extra work was money left on the table. The schedule of values now includes approved change orders: one against a budget line raises that line, and an owner-side one with no line gets a row of its own to bill against.',
        href: '/projects',
      },
      {
        kind: 'fixed',
        title: 'The escrow warning said you were short more than you were',
        text: 'With $25,000 owed to vendors and $10,000 already paid out, the banner said you were short $35,000 - it was adding the money you had already paid back on. It now says $25,000, and the two halves of that sentence use the same figure.',
        href: '/projects',
      },
    ],
  },
  {
    date: '2026-09-02',
    title: 'A pay application is checked before it goes to the bank',
    items: [
      {
        kind: 'fixed',
        title: 'Retainage can no longer be set above 100%',
        text: 'A pay app took 105% retainage - holding back $189,000 on $180,000 earned, which made "total earned less retainage" a negative number and the balance to finish larger than the contract. Retainage is now 0 to 100, and typing in the box replaces the default instead of appending to it: changing 10 to 5 was giving 105.',
        href: '/projects',
      },
      {
        kind: 'fixed',
        title: 'A line cannot be billed past its scheduled value, or below zero',
        text: 'Lines could be billed to 110% complete, showing negative balances, and a line with no scheduled value took -$1,000. A line now has to stay between nothing and its scheduled value. A negative amount that corrects an earlier overbill is still allowed - what is refused is a total below zero.',
        href: '/projects',
      },
      {
        kind: 'fixed',
        title: 'Submit, certify and fund now check the numbers first',
        text: 'None of them looked. An application with 105% retainage and lines at 110% was submitted, certified and funded. A draft can still hold an overbilled line while you sort out the change order - but it cannot leave in that state, and the reason appears beside the button rather than after you press it.',
        href: '/projects',
      },
    ],
  },
  {
    date: '2026-09-02',
    title: 'Hiding a screen is not the same as locking it',
    items: [
      {
        kind: 'fixed',
        title: 'A Field Supervisor could open your budget by pasting the URL',
        text: 'The Budget, Bills, Billing, Pay Apps, Change Orders, Summary and Estimate tabs were hidden from roles without access - but typing the address opened them anyway, margins and all. Every one of those screens now refuses at the server, and a tab you cannot see says so instead of showing an empty version of itself.',
        help: 'permissions',
        href: '/settings?tab=permissions',
      },
      {
        kind: 'fixed',
        title: 'Master Money briefly showed itself to people who cannot use it',
        text: 'The admin-only check ran a moment after the page drew, so Office Staff saw the Master Money layout before being told it was not for them. No figures were ever exposed - the server refused the data, which is why it showed zeros - but the screen should not have appeared at all. It now waits.',
        href: '/master-money',
      },
      {
        kind: 'fixed',
        title: '"No projects yet" when the list simply failed to load',
        text: 'If the projects list could not be loaded, the page said you had none and offered to create your first - on a company with four. A failure now says it failed, and offers to try again.',
        href: '/projects',
      },
    ],
  },
  {
    date: '2026-09-02',
    title: 'A spec build stops being asked for a client',
    items: [
      {
        kind: 'fixed',
        title: 'The setup checklist no longer demands a client on a "Building to sell" job',
        text: 'The checklist listed "Put the client on the job" as an essential step even on a job you are building to sell - which by definition has no client - so setup could never finish and it read "1 still needed" forever. That step no longer appears on a spec build. Every other kind of job still asks for one.',
        href: '/projects',
      },
    ],
  },
  {
    date: '2026-09-02',
    title: 'Committed means one thing now',
    items: [
      {
        kind: 'fixed',
        title: 'Budget, Summary and Master Money agree on what you have committed',
        text: 'The three screens showed three different Committed figures - on one job, $776,621 against $534,101. Each was counting a different half: the Budget tab ignored contracts nobody had tied to a budget line, while Summary and Master Money ignored money committed without a contract, like a materials order or an equipment hire. Committed now means everything you have promised to pay, counted once, and every screen reads the same number.',
        href: '/master-money',
      },
    ],
  },
  {
    date: '2026-09-02',
    title: 'Your account has an owner, and nobody can remove them',
    items: [
      {
        kind: 'new',
        title: 'One person owns the account and cannot be removed or demoted',
        text: 'Every admin could remove or demote every other admin - including whoever set the company up. The person who created the company is now marked Owner, and no admin can remove them, change their role, or take their access away. Everything else about admins is unchanged.',
        help: 'permissions',
        href: '/settings?tab=team',
      },
      {
        kind: 'new',
        title: 'Ownership can be handed over',
        text: 'Only the owner can do it, and only to somebody who is already an admin. Use it if the owner is leaving the company - once handed over, they become a normal admin and can be removed like anyone else.',
        help: 'permissions',
        href: '/settings?tab=team',
      },
    ],
  },
  {
    date: '2026-09-02',
    title: 'Password reset emails come from SyteNav now too',
    items: [
      {
        kind: 'fixed',
        title: 'Reset emails go out on the same sender as everything else',
        text: 'Resetting a password was the last flow still handed to a separate mail service to deliver, so it could fail while every other email in the app kept working. It now sends the same way client portal links and invites do. Locking yourself out was the worst place for that to go wrong - there is no way to ask somebody else to re-send it.',
        href: '/forgot-password',
      },
      {
        kind: 'improved',
        title: 'The reset page no longer says whether an address has an account',
        text: 'It used to be possible to learn whether an email address was registered by watching how the form responded. It now gives the same answer either way.',
        href: '/forgot-password',
      },
    ],
  },
  {
    date: '2026-09-02',
    title: 'Team invites now send the same way everything else does',
    items: [
      {
        kind: 'fixed',
        title: 'Invite emails go out through SyteNav\'s own sender',
        text: 'Team invites were the only emails handed to a separate mail service to deliver, which meant they could fail while every other email in the app kept working - and nothing on screen could tell you which. They now go out the same way client portal links and quote requests do. If one still fails, the message says exactly why instead of guessing.',
        href: '/settings?tab=team',
      },
    ],
  },
  {
    date: '2026-09-02',
    title: 'Copy an invite link instead of waiting on email',
    items: [
      {
        kind: 'new',
        title: 'Copy link on a pending invite',
        text: 'Every pending invite now has a Copy link button. Paste it into your own email, a text or a chat and the person can set up their account - no waiting on the invite email to arrive. Same escape hatch the client portal has always had beside Send.',
        help: 'invite-team-member',
        href: '/settings?tab=team',
      },
      {
        kind: 'fixed',
        title: 'Dropdowns on Settings had their arrow outside the box',
        text: 'Five dropdowns on the Settings screen - Company Type, Role, and the three project defaults - drew their arrow below and to the left of the box, with the text centred. They now look like every other dropdown in the app.',
        href: '/settings',
      },
    ],
  },
  {
    date: '2026-09-02',
    title: 'Resend tells you whether it actually resent',
    items: [
      {
        kind: 'fixed',
        title: 'Resend on a pending invite always said it worked',
        text: 'Resend reported "Invite resent" the moment the request came back, without checking whether anything was sent - so a resend that sent nothing said it had. It now says when the email did not go out, and that message stays on screen instead of clearing itself after three seconds.',
        href: '/settings?tab=team',
      },
    ],
  },
  {
    date: '2026-09-02',
    title: 'A budget line can no longer hold a negative cost',
    items: [
      {
        kind: 'fixed',
        title: 'Negative committed and actual amounts were saved, and came off your totals',
        text: 'A budget line accepted a Committed of -1 and an Actual of -2.50, saved them, and subtracted them from the job\'s committed and spent figures - so a total could be talked down by typing a minus. Every place a budget amount is written now refuses a negative and says which field it means: adding a line, editing one, applying a template, and importing a scanned quote. Zero is still allowed, because a line with nothing on it yet is normal.',
        href: '/projects',
      },
      {
        kind: 'fixed',
        title: 'A budget line that will not save now tells you why',
        text: 'Adding or editing a line quietly did nothing when the save was refused - the button stopped and the row sat there unchanged, which reads as saved. The reason now appears next to the buttons.',
        href: '/projects',
      },
    ],
  },
  {
    date: '2026-09-02',
    title: 'A spec build no longer needs a client',
    items: [
      {
        kind: 'fixed',
        title: '"Building to sell" would not let you create the project',
        text: 'Picking "Building to sell" showed a card saying "No client - you are building it to sell", and then Create Project refused with "Pick or enter a client." The only way through was to invent an owner for a job that has none, which then followed the job onto the proposal and the client portal. A spec build no longer asks for one, and the field says so. The other two pay models still require a client.',
        href: '/projects/new',
      },
    ],
  },
  {
    date: '2026-09-02',
    title: 'Job margin is its own permission now',
    items: [
      {
        kind: 'new',
        title: 'Costs and margin can be granted separately',
        text: 'Seeing the Budget tab used to mean seeing the job\'s markup, contract value and projected profit - there was no way to let a project manager run a budget without showing them what you make on it. Margin is now its own permission. Project Manager and Office Staff keep the full budget and lose the margin figures; Admin and Manager keep both. Grant it back to anyone you like under Team & Users.',
        help: 'permissions',
        href: '/settings?tab=permissions',
      },
      {
        kind: 'fixed',
        title: 'The Company Settings, Team and Billing switches now do something',
        text: 'Those three permissions sat in the grid and could be ticked and unticked, but nothing read them - the Settings screen decided access from the role name alone. So customising a role changed what someone saw everywhere except Settings. It now uses the same permissions as the rest of the app, and every standard role keeps exactly the tabs it had.',
        help: 'permissions',
        href: '/settings?tab=permissions',
      },
    ],
  },
  {
    date: '2026-09-02',
    title: 'Who sees the money, and forms that say what is wrong',
    items: [
      {
        kind: 'fixed',
        title: 'The activity feed no longer showed the whole company to some people',
        text: 'Everyone except an admin is meant to see only their own actions in the dashboard feed. The check was skipped for anyone whose profile had no name filled in - so they saw every action on every job, including budget changes with amounts on them. Anyone invited who never finished their profile was affected. It now matches on who you actually are, and shows nothing rather than everything if it cannot tell.',
        href: '/dashboard',
      },
      {
        kind: 'fixed',
        title: 'Role preview now hides the Master money views too',
        text: 'Previewing a role showed you that role\'s screens but kept your own Master Calendar and Master Money links in the sidebar - so checking what a Field Supervisor sees suggested they could see company-wide money. They could not: the server always refused them the data. The preview was wrong, not the permission.',
        href: '/settings?tab=permissions',
      },
      {
        kind: 'fixed',
        title: 'A blank required field says so, instead of glowing green',
        text: 'Leaving the Start Date empty on a new project gave no message at all - just the field\'s green outline, which looks like approval. Every required field on the project form now shows a red message under it saying what is missing, and an end date before the start date is caught.',
        href: '/projects/new',
      },
    ],
  },
  {
    date: '2026-09-01',
    title: 'Your data is closed off at the database, not just in the app',
    items: [
      {
        kind: 'fixed',
        title: 'Client portal links can no longer be read out of the database',
        text: 'Eight tables - including the one holding client invoices and their portal share links - were readable by anyone who knew the project address, without signing in. Nothing suggests this was used, but it was possible: someone could have listed every invoice share link, and those links open a portal showing invoices and payment history. Every table in the database is now closed by default, and only the app itself can reach them.',
      },
      {
        kind: 'improved',
        title: 'A new company can no longer be set up with the doors open',
        text: 'The protection above was switched on by hand for most tables, so it was never written down anywhere. A brand-new SyteNav environment would have been built without it. It is now part of the setup itself, and a check refuses any future table that forgets it.',
      },
    ],
  },
  {
    date: '2026-09-01',
    title: 'Fields tell you what is wrong instead of saving it anyway',
    items: [
      {
        kind: 'fixed',
        title: 'The deposit box says what is wrong, under the box',
        text: 'A rejected amount put a red message at the top of the card while the amount that caused it sat in the field looking fine. The message is now under the field itself, and Request stays greyed out until the amount is one the app will accept - so nothing is sent only to bounce back.',
        href: '/projects',
      },
      {
        kind: 'fixed',
        title: 'A money box can no longer show the word "undefined"',
        text: 'Where an amount was missing, some boxes were filled with the word "undefined" instead of being left empty. Typing into one left something like "undefined-500", which the app then refused - for a reason that had nothing to do with what you typed. Missing amounts now leave the box empty, and a value that is not a number is called exactly that instead of being reported as a negative.',
        href: '/projects',
      },
      {
        kind: 'fixed',
        title: 'A negative amount no longer turns into a positive one',
        text: 'Asking a client for -$500 raised a request for $500. The app was cleaning the number before checking it, and the clean removed the minus sign - so the check that would have caught it never saw a negative. Fixed everywhere it happened: payment requests, subcontract amounts, selection allowances. A negative is now refused with a message that says so.',
        href: '/projects',
      },
      {
        kind: 'fixed',
        title: 'Dates no longer shift by a day',
        text: 'A job entered Sep 1 - Dec 31 showed as Aug 31 - Dec 30 on the project list. Dates with no time on them were being read as UTC midnight, which is the evening before in every US timezone. There is now one date formatter for the whole app, so a date shows the day you typed.',
        href: '/projects',
      },
      {
        kind: 'fixed',
        title: '"New York" is no longer saved as Nebraska',
        text: 'The state field accepted two characters, so typing "New York" left "NE". Not blank, not an error - a different real state. It is a picker now, and existing addresses with a full state name are read correctly.',
        href: '/projects',
      },
      {
        kind: 'improved',
        title: 'Going Active with no markup says what that costs you',
        text: 'The setup checklist listed it alongside five other items. It now says plainly that at 0% you will bill the job at cost and earn nothing on it. It still lets you through - some jobs genuinely are at cost.',
        help: 'add-project-budget',
        href: '/projects',
      },
      {
        kind: 'improved',
        title: 'A new account gets a starting point, not empty boxes',
        text: 'The dashboard showed a grid of zeroes on day one. It now offers to set up your first job.',
        href: '/dashboard',
      },
    ],
  },
  {
    date: '2026-09-01',
    title: 'Your client sees the real progress, and Reports fills in',
    items: [
      {
        kind: 'fixed',
        title: 'The client portal showed 0% on every trade',
        text: 'It was reading a field that only gets filled in when a sub bills by percentage - so on a job visibly underway, your client saw zeroes on everything. It now shows the same figure your Progress tab does, weighted by what each budget line is worth. And a trade nobody has marked up reads "In progress" rather than asserting 0%, because "not measured" and "nothing done" are different things to say to a customer.',
        href: '/projects',
      },
      {
        kind: 'fixed',
        title: 'Reports header was blank on every job',
        text: 'Project, Client and Status all printed a dash. The page was asking for a project from an address that had no answer to give, and underneath that it was reading two column names that do not exist. Both fixed - it now shows the job, the client (the linked customer where there is one) and the status.',
        href: '/projects',
      },
      {
        kind: 'improved',
        title: 'Schedule opens on the month you are in',
        text: 'It used to jump to the earliest thing on the calendar, so an active job opened months in the past and the first thing you did was navigate back. It now opens on today - unless the whole schedule is ahead of you or behind you, in which case it opens where the work actually is.',
        href: '/projects',
      },
      {
        kind: 'improved',
        title: 'Left to spend says why it differs from Committed',
        text: 'It showed the subtraction but not the reason the subtracted figure is bigger than what you have signed. It now says: using actual where it exceeds committed.',
        help: 'add-project-budget',
        href: '/projects',
      },
    ],
  },
  {
    date: '2026-09-01',
    title: 'Money screens now enforce who is allowed to change them',
    items: [
      {
        kind: 'fixed',
        title: 'View-only roles can no longer edit budgets, bills or payments',
        text: 'A Field Supervisor could open a budget and change it. The screen hid the buttons from them, but hiding a button is not the same as refusing the change - and the server was not refusing. Every money screen now checks your role before it writes: budgets, bills from subs, billing the client, change orders, subcontracts, pay apps and materials. Nothing changes for admins, managers, PMs or office staff, and field crews can still log materials and file daily logs as before.',
        help: 'permissions',
        href: '/settings',
      },
    ],
  },
  {
    date: '2026-09-01',
    title: 'The budget numbers explain themselves',
    items: [
      {
        kind: 'improved',
        title: 'Actual Spent and Left to spend show their working',
        text: 'Somebody checked the arithmetic and could not make it close. THREE different things add into Actual Spent - bills from subs, actuals typed straight onto a budget line, and material receipts - and the screen showed only the total. It now prints the split underneath. If it looks bigger than your Bills tab, that tab is filtered to one status; this counts approved, released and paid. Left to spend prints the subtraction it did rather than a total you have to work backwards from. The maths never changed - it just refused to show itself.',
        help: 'add-project-budget',
        href: '/projects',
      },
      {
        kind: 'new',
        title: 'Choose whether your fee applies to materials',
        text: 'Some contracts mark up everything the job costs; some pass materials through at cost. It is now a tick next to your markup rate, per job, and individual receipts can be set at cost from the Materials tab. It is off unless you turn it on - the same as every job worked before - so nothing you have already earned has moved.',
        help: 'add-project-budget',
        href: '/projects',
      },
      {
        kind: 'fixed',
        title: 'The fee line says what it was earned on',
        text: 'It read "Earned so far $20,792 of $428,615 spent" - but the fee is worked out on your bills, while that larger figure was bills plus materials. Two different piles of money in one sentence, which read as a bug whether or not the number was right. It now names the actual basis.',
        help: 'add-project-budget',
        href: '/projects',
      },
    ],
  },
  {
    date: '2026-08-30',
    title: 'Correcting or deleting a sub bill now reaches QuickBooks',
    items: [
      {
        kind: 'fixed',
        title: 'Correcting a bill\'s amount corrects it in QuickBooks',
        text: 'Approve a $5,000 bill, then correct it to $4,000, and QuickBooks went on saying $5,000 - forever, and without a word. The correction now updates the bill already in QuickBooks, in place. If it cannot - you have already marked the bill paid, or your bookkeeper split it across several lines over there - it says which, and what to do about it, instead of leaving the two quietly disagreeing.',
        help: 'connect-quickbooks',
        href: '/projects',
      },
      {
        kind: 'fixed',
        title: 'Deleting a bill voids it in QuickBooks too',
        text: 'It used to delete here and leave the bill standing there, so QuickBooks kept showing money owed for a bill that no longer existed - and, if you had marked it paid, a payment for it as well. Deleting now voids both, the payment first. The confirmation says so before you press it, and if QuickBooks cannot be reached you are told, rather than finding out at month end.',
        help: 'approve-invoice',
        href: '/projects',
      },
    ],
  },
  {
    date: '2026-08-29',
    title: 'Faster pages, and a clearer bills tab',
    items: [
      {
        kind: 'fixed',
        title: 'The app tells you when something fails to load',
        text: 'If your permissions could not be fetched, the sidebar quietly dropped every menu item and the dashboard sat on grey placeholders - no message, no retry, no way to tell a slow connection from a broken one. Both now say what went wrong and offer Try again, and a session that has ended sends you to sign in instead of leaving a shell you cannot use.',
        href: '/dashboard',
      },
      {
        kind: 'fixed',
        title: 'Project pages load quickly again',
        text: 'They had got noticeably slower, and creating a bill from a sub could feel like it froze. The customer name added to the job header yesterday was fetching data the app had already loaded a moment earlier - three extra round trips on every single project page, before anything appeared. It now asks once and reuses the answer.',
        href: '/projects',
      },
      {
        kind: 'improved',
        title: '"Sent for Payment" is now "Queued for payment"',
        text: 'The old name made everyone ask "sent to who?" - and the answer was nobody. Nothing goes to the sub. It records that the bill has gone to bookkeeping or into the next payment run, with the money not moved yet, and it is entirely optional: you can mark a bill paid straight from Approved. That is now written on the screen instead of hidden in a tooltip.',
        help: 'approve-invoice',
        href: '/projects',
      },
      {
        kind: 'improved',
        title: 'Billing the client for a sub\'s bill is one click',
        text: '"Bill the client for this" was green text among other green text on an approved bill - easy to miss, and the most useful thing on the row. It is now a proper button showing the amount. And it carries what you picked: the invoice composer opens showing that one cost and its total, instead of the full pick-your-costs list for you to choose all over again.',
        help: 'money-overview',
        href: '/projects',
      },
    ],
  },
  {
    date: '2026-08-28',
    title: 'The right invoice, and the right people',
    items: [
      {
        kind: 'new',
        title: 'Paying a sub now shows in QuickBooks',
        text: 'Approving a bill from a sub put it in QuickBooks as money you owe. Marking it PAID did nothing over there - so the bill sat open in QuickBooks after the cash had gone out, and your accounts payable overstated by every bill you had actually settled. Paying one now records the payment against that bill, exactly as a client payment settles a client invoice. Bills you paid before today are caught up with Sync bill payments in Settings.',
        help: 'connect-quickbooks',
        href: '/settings',
      },
      {
        kind: 'fixed',
        title: 'You are told when a sub submits a bill',
        text: 'The "pending approval" notification went to whoever created the bill - so a sub submitting their own from My Jobs was told to approve it themselves, and you heard nothing until you happened to open the tab. It now goes to everyone on your team who can approve a bill, and says who submitted it and for how much. People who cannot open the bills tab are not notified, because a notification you cannot act on is just noise.',
        help: 'approve-invoice',
        href: '/projects',
      },
      {
        kind: 'improved',
        title: 'The check number you type is the Reference no. in QuickBooks',
        text: 'The payment form asked for "Memo / check #" in one box, so your check number went across as the QuickBooks MEMO and its Reference no. - the column your bookkeeper matches against a bank statement - got SyteNav\'s own tracking id instead. There are now two boxes, Reference / check # and Memo, the same two QuickBooks has. Your reference goes in the reference field. Payments recorded before today keep their memo as it is; put the number in the new box and press Update formatting in Settings to correct them in QuickBooks.',
        help: 'connect-quickbooks',
        href: '/projects',
      },
      {
        kind: 'fixed',
        title: 'Update formatting works on invoice payments',
        text: 'It assumed every payment in QuickBooks was a sales receipt, which was true until money started settling invoices directly. On those newer payments it reported the record as missing. It now handles both.',
        help: 'connect-quickbooks',
        href: '/settings',
      },
      {
        kind: 'improved',
        title: 'Issue & get link shows that it is working',
        text: 'The button was already ignoring a second click while it saved, but nothing on screen changed, so it read as unresponsive. It now dims and says "Issuing…". Same for Mark paid.',
        help: 'money-overview',
        href: '/projects',
      },
      {
        kind: 'improved',
        title: 'The job header says who the job is for',
        text: 'It showed the project name and the address and never once named the client - the thing you sort a job by in your head. The customer now sits in small type above the project name. Subcontractors working the job do not see it.',
        help: 'money-overview',
        href: '/projects',
      },
      {
        kind: 'fixed',
        title: 'A payment QuickBooks half-refuses still goes across',
        text: 'If QuickBooks will not accept how a payment was made - usually because that method was made inactive over there - the payment used to fail outright and the invoice stayed showing as owed. It now goes across anyway and settles the invoice, with how it was paid written into the memo instead: "Hackensack Medical Suite - check1005 (paid by Check)". Money in the right place beats a tidy column.',
        help: 'connect-quickbooks',
        href: '/settings',
      },
      {
        kind: 'improved',
        title: 'A failed sync now says what QuickBooks refused',
        text: 'QuickBooks answers a bad reference with "Object Not Found" and a sentence that lists every field it might be and names none of them - which told you nothing. SyteNav now asks QuickBooks about each thing it sent, and Recent sync activity in Settings names the one that was refused and what is wrong with it.',
        help: 'connect-quickbooks',
        href: '/settings',
      },
      {
        kind: 'fixed',
        title: 'Marking an invoice paid settles THAT invoice in QuickBooks',
        text: 'When you pressed Mark paid, the payment went across to QuickBooks against "the oldest invoice still open" rather than the one you were looking at. Issue two invoices on the same day and which one got settled was a coin toss, so QuickBooks could show the wrong invoice paid and the right one still owing. The payment now carries the invoice you marked, and settles exactly that one.',
        help: 'connect-quickbooks',
        href: '/projects',
      },
      {
        kind: 'fixed',
        title: 'Sync now cannot book the same sale twice',
        text: 'The Sync client payments button in Settings recorded every unsynced payment as a straight sale, even when that money was settling an invoice already in QuickBooks - which would have counted the same job twice in your income. It now applies the payment against the invoice, exactly as the automatic sync does.',
        help: 'connect-quickbooks',
        href: '/settings',
      },
      {
        kind: 'improved',
        title: 'The QuickBooks tick tells you about the money, not just the invoice',
        text: 'An invoice could sit here marked paid, wearing a green QuickBooks tick, while in QuickBooks it was still money owed - the invoice had gone across but the payment settling it had not. The tick now says which: "QB ✓" for sent, "QB ✓ paid" once the money is over there too, and an amber warning when the payment has not made it.',
        help: 'connect-quickbooks',
        href: '/projects',
      },
      {
        kind: 'improved',
        title: 'See how often your client opened an invoice',
        text: 'It used to say "opened by the client" and nothing more, however many times they looked. Each invoice now shows how many times it has been opened and when they last did - "opened 4 times, last Aug 27" - which is a different phone call from "not opened yet".',
        help: 'money-overview',
        href: '/projects',
      },
      {
        kind: 'improved',
        title: 'Fewer buttons on each invoice',
        text: 'A sent invoice had seven controls in a row, all the same size, with Mark paid sitting next to Void. Now there is one action - Issue, or Mark paid - and everything else (the client link, emailing it, printing, voiding) is behind the ... menu at the end of the row.',
        help: 'money-overview',
        href: '/projects',
      },
    ],
  },
  {
    date: '2026-08-27',
    title: 'A double-press cannot double-bill your client',
    items: [
      {
        kind: 'fixed',
        title: '"Already in QuickBooks" now actually stops the sync',
        text: 'That tick box on the payment form was left over from before the QuickBooks connection existed, and once payments started syncing themselves it stopped meaning anything - tick it and the payment went across anyway, so a payment you had already typed into QuickBooks would land there twice. It is now honoured, and relabelled so it reads as an instruction rather than a note to yourself. Nothing in your books was affected: every ticked payment so far was ticked by the sync itself.',
        help: 'connect-quickbooks',
        href: '/projects',
      },
      {
        kind: 'new',
        title: 'Void an invoice you sent by mistake',
        text: 'A sent invoice could not be deleted, edited or cancelled - it was permanent. You can now Void one: it stays on the list with its number for the record, the costs on it become billable again so you can raise a corrected invoice, and the QuickBooks invoice is voided so it stops counting as money owed. Drafts are still simply deleted.',
        help: 'money-overview',
        href: '/projects',
      },
      {
        kind: 'improved',
        title: 'Invoices show whether they reached QuickBooks',
        text: 'The payments list had a QB tick and the invoice list did not, even though invoices sync too. Now both show it.',
        help: 'connect-quickbooks',
      },
      {
        kind: 'new',
        title: 'New customers reach QuickBooks straight away',
        text: 'A customer you added only turned up in QuickBooks when you first invoiced them, or when somebody remembered the Sync customers button - so the two lists drifted, and an address you corrected here never reached the books. Adding or editing a customer now pushes them immediately.',
        help: 'connect-quickbooks',
        href: '/customers',
      },
      {
        kind: 'fixed',
        title: 'Marking an invoice paid records the money',
        text: 'Mark paid on a client invoice used to just tick it off - no amount, no date, no method, nothing in Funds Received, and the QuickBooks invoice stayed open so it still counted as owed. It now opens the same Record a client payment box everything else uses, filled in from the invoice, so the money lands in your ledger with how it was paid and the QuickBooks invoice is settled by it.',
        help: 'money-overview',
        href: '/projects',
      },
      {
        kind: 'fixed',
        title: 'One invoice, one QuickBooks invoice',
        text: 'Pressing Issue twice quickly sent two requests, and both created an invoice in QuickBooks before either finished - so one invoice became two, and the spare sat there as money your client appeared to owe. The push is now claimed atomically: whichever press gets there first does the work, the other is ignored. The buttons also grey out while a change is going through.',
        help: 'connect-quickbooks',
      },
    ],
  },
  {
    date: '2026-08-27',
    title: 'Invoices show up in QuickBooks as money owed to you',
    items: [
      {
        kind: 'new',
        title: 'Sending a client invoice puts it in QuickBooks',
        text: 'Until now QuickBooks only heard about money once it arrived, so an invoice you were waiting on appeared nowhere. Send an invoice and it lands in QuickBooks as an Invoice - money owed to you - with your own invoice number, the due date and the job name on it. Your accountant gets receivables and aging instead of just cash in.',
        help: 'connect-quickbooks',
        href: '/settings',
      },
      {
        kind: 'new',
        title: 'Check, ACH or Wire carries through to QuickBooks',
        text: 'The method you pick when recording a payment now lands on the QuickBooks record - the field your bookkeeper matches against a bank statement. QuickBooks only knows Check, Cash and Credit Card out of the box; ACH, Wire and QuickPay get created in your QuickBooks the first time you use them. Press Update formatting on the Settings card to add the method to payments synced earlier.',
        help: 'connect-quickbooks',
        href: '/settings',
      },
      {
        kind: 'improved',
        title: 'Payments settle the invoice instead of double-counting it',
        text: 'When the client pays, that payment is now applied against the invoice in QuickBooks rather than recorded as a second sale. A deposit taken before any invoice exists still lands as a Sales Receipt, because there is nothing for it to settle. Records synced before today are left as they are.',
        help: 'connect-quickbooks',
      },
    ],
  },
  {
    date: '2026-08-27',
    title: 'QuickBooks keeps itself up to date',
    items: [
      {
        kind: 'new',
        title: 'Payments and approved bills push to QuickBooks by themselves',
        text: 'Syncing was a button in Settings that had not been pressed in six weeks, with 17 payments quietly missing from the books. Now every client payment you record and every sub bill you approve goes straight to QuickBooks when a connection is live. A QuickBooks hiccup never blocks the save - the miss is logged and swept up by the next sync.',
        help: 'connect-quickbooks',
        href: '/settings',
      },
      {
        kind: 'improved',
        title: 'QuickBooks records say which project they belong to',
        text: 'A pushed payment used to arrive in QuickBooks as just a customer, a date and an amount - fine until a customer has two jobs. Every record now carries the project name in its memo and a searchable SN- reference number, and hovering the QB chip in SyteNav shows you that reference. For records pushed before today, press Update formatting on the Settings card - it rewrites them in place, no duplicates.',
        help: 'connect-quickbooks',
      },
      {
        kind: 'fixed',
        title: 'The QB chip tells the truth',
        text: 'The chip on a payment used to be a hand-ticked checkbox with no connection to what was actually in QuickBooks. A solid "QB ✓" now means the sync really pushed it; the clickable tick remains for payments you entered by hand. The Settings card also says plainly how many payments and bills are not in QuickBooks yet, instead of leaving you to wonder.',
        help: 'connect-quickbooks',
        href: '/settings',
      },
    ],
  },
  {
    date: '2026-08-27',
    title: 'Clients see their invoices on the portal',
    items: [
      {
        kind: 'new',
        title: 'The portal says thank you for payments',
        text: 'When a client paid a deposit and you recorded it, their portal went silent - the request disappeared and nothing acknowledged the money ever moved. There is now a green Payments card listing every payment they have made, with dates and a running total. "Did they even get my money?" is the one question a client page must never leave open.',
        help: 'request-deposit',
      },
      {
        kind: 'new',
        title: 'Invoices are on the client portal',
        text: 'The portal showed your client their schedule, permits, selections and any payment requests - but not the invoices they were actually billed. Those only existed inside the email you sent. Every sent and paid invoice is now listed on their portal link, with what is currently due at the top and each one opening to the full breakdown. Drafts never appear.',
        help: 'money-overview',
      },
    ],
  },
  {
    date: '2026-08-27',
    title: 'Jobs open on an Overview now',
    items: [
      {
        kind: 'new',
        title: 'Every job has an Overview',
        text: 'Opening a job used to drop you in Plans - a file list that tells you nothing about where the job stands. It now opens on an Overview: what you have received and what you owe vendors, what is waiting on YOU (bills to approve, RFIs unanswered, inspections to book), what is waiting on SOMEONE ELSE (money requested, certificates lapsing, selections not chosen), and what is on site over the next three weeks. Everything links straight to the tab that deals with it.',
        help: 'job-overview',
        href: '/projects',
      },
      {
        kind: 'improved',
        title: 'It states what is there - it does not tell you your job',
        text: 'This is deliberately not a to-do list. You know how to run a job; what you cannot know without opening six tabs is what has piled up since you last looked. When nothing is outstanding it says so, and then gets out of the way.',
        help: 'job-overview',
      },
    ],
  },
  {
    date: '2026-08-27',
    title: 'Ask your client for a deposit',
    items: [
      {
        kind: 'new',
        title: 'Request a deposit or a stage payment',
        text: 'The app could record a deposit once it landed and bill for work already done - but there was no way to ASK for one, on any job. Billing the client now has a Deposits & stage payments section. Your estimate\'s payment terms appear there already priced, so "50% deposit" becomes a figure you can request in one press and email to your client.',
        help: 'request-deposit',
        href: '/projects',
      },
      {
        kind: 'improved',
        title: 'Mark paid records the payment properly',
        text: 'It used to just tick the request off - a green "Paid" with no date, no method and no cheque number, and nothing in your ledger. It now opens the normal Record a client payment box with the date, amount and memo already filled in and Retainer/deposit ticked. Change anything before saving: if you asked for $5,000 and they sent $4,800, record $4,800 and the request settles against that.',
        help: 'request-deposit',
        href: '/projects',
      },
      {
        kind: 'new',
        title: 'Ask in dollars or as a percentage',
        text: 'A one-off request takes either - $5,000 to start, or 30% up front. Type a percentage and it shows you what it comes to against your estimate before you send it, and the request records how it was worked out so you can check it against the quote later.',
        help: 'request-deposit',
      },
      {
        kind: 'new',
        title: 'Your client sees what is being asked for',
        text: 'A sent request shows on their portal link under "Payment requested", with what it is for and when it was agreed to be due. It only appears once you have actually sent it.',
        help: 'request-deposit',
      },
      {
        kind: 'improved',
        title: 'The go-live checklist says what it is waiting for',
        text: '"Deposit or first payment received" used to just say "Nothing recorded yet" whether you had not started or were waiting on the client. It now says which - and how much is outstanding.',
        help: 'project-status-active',
      },
    ],
  },
  {
    date: '2026-08-27',
    title: 'The app got faster, and saves stop pretending',
    items: [
      {
        kind: 'fixed',
        title: 'AIA jobs can record client payments again',
        text: 'Billing the client was hidden on AIA jobs, and that page is the only place in the app that records money received from a client. So an AIA job had no way to bank a deposit or a draw at all - while the go-live checklist required one before the job could be set Active. The tab is back on AIA jobs for recording money in; raising what the client owes still happens through Pay Apps, and the page now says so and links there.',
        help: 'pay-applications',
        href: '/projects',
      },
      {
        kind: 'fixed',
        title: 'Recording a deposit on a job that has not started yet',
        text: 'The go-live checklist asks for a deposit or first payment before you set a job to Active - but Billing the client was also hidden until the job WAS active. Pressing "Open" on that item flashed the page and then bounced you to Plans. A deposit is money you take before breaking ground, so that tab is now available while a job is still in planning.',
        help: 'project-status-active',
        href: '/projects',
      },
      {
        kind: 'fixed',
        title: 'No more pages with no tab',
        text: 'Opening a link to a tab your job does not have used to render the page anyway, with nothing highlighted and no obvious way back. The rule that hides a tab and the rule that blocks reaching it are now the same rule.',
      },
      {
        kind: 'fixed',
        title: 'Timeouts and stuck "Saving…" buttons',
        text: 'Every request the app made was doing an extra login check against our auth server before it even reached the app - including every save. It was never used for anything, and when it was slow the whole request timed out with a 504 error page. That check is gone from the paths that never needed it, so saving is now one round trip instead of two.',
      },
      {
        kind: 'fixed',
        title: 'Scheduling a vendor tells you if it did not save',
        text: 'If a save failed, the button sat on "Saving…" forever - no error, nothing written, no way to tell. Saves now give up after 20 seconds and say plainly whether anything was saved. Adding a milestone and editing one were worse: they ignored the answer completely, so a failure closed the form and looked exactly like a success.',
        href: '/projects',
      },
    ],
  },
  {
    date: '2026-08-27',
    title: 'Add a sub before you know their price',
    items: [
      {
        kind: 'new',
        title: 'Contract Amount is optional when you add a subcontractor',
        text: 'Adding a sub without a price failed outright - with a database error in a grey browser box. That was backwards: lining up who is doing the work and agreeing what they charge are two different moments, and the first is exactly when you want them on the job so you can send them a scope to price. Leave the amount blank and the contract reads "Not set" until you fill it in. It shows as unpriced rather than $0, so it can never be mistaken for a sub who works for free.',
        help: 'add-subcontractor-no-price',
        href: '/projects',
      },
      {
        kind: 'fixed',
        title: 'A failed save no longer leaves a duplicate in your directory',
        text: 'When adding a sub failed, the company had already been created and was left behind. Try twice and you had two identical subs in your directory, neither attached to anything. The company is now removed again if the save does not complete.',
        help: 'directory',
      },
      {
        kind: 'improved',
        title: 'Errors tell you which field, not which database column',
        text: 'Save failures used to surface the raw database message - "null value in column contract_amount violates not-null constraint" - in a browser alert. They now appear inside the form, in the app\'s own styling, naming the field as the form labels it and saying what to do about it.',
      },
      {
        kind: 'improved',
        title: 'Removing a bid invite asks first',
        text: 'The X at the end of an invite row deleted it on one click, sitting right next to five harmless buttons of the same size. Removing an invite kills the link that sub was already sent, so it now asks first and tells you whose invite it is.',
        help: 'request-quotes',
      },
    ],
  },
  {
    date: '2026-08-27',
    title: 'Quotes now tell you when they arrive, and the task board moves',
    items: [
      {
        kind: 'fixed',
        title: 'You are told when a sub sends you a quote',
        text: 'A sub could open their link, price the job, hit submit - and nothing reached you. No bell, no email. You found out by remembering to go and look. Quotes now notify you the moment they land, with who sent it and for how much, and a decline tells you too, so you are not left waiting on a price that was never coming.',
        help: 'notification-preferences',
        href: '/projects',
      },
      {
        kind: 'fixed',
        title: 'Winning a job tells the sub who won it',
        text: 'Awarding a quote told nobody. The winner heard about it when you rang them. They now get it in the app, and a sub who has no SyteNav account gets an email instead - the address is already on their quote.',
        help: 'award-quote',
      },
      {
        kind: 'improved',
        title: 'Re-sending a quote request reads as a nudge, not a repeat',
        text: 'Sending the link again to a sub who has already had it now goes out as a reminder - different wording, and it shows up in their bell too - instead of the same first-ask email arriving twice. Their "opened it" status survives the chase, so you can still tell who has looked and who has not.',
        help: 'request-quotes',
      },
      {
        kind: 'new',
        title: 'Every task card has Open / In Progress / Completed buttons',
        text: 'Moving a task used to mean finding a small icon that appeared only on hover and advanced one step per click. Each card now shows the three stages as buttons, always visible, with the current one filled in. One tap sends a task to any stage - including back - and it works the same on a phone as on a desk.',
        help: 'tasks-assign',
        href: '/projects',
      },
      {
        kind: 'new',
        title: 'The + on each column adds to that column',
        text: 'The three + buttons used to be the same button: whichever you pressed, the task appeared in Open. Each one now adds to its own column, and the form tells you which before you save.',
        help: 'tasks-assign',
      },
      {
        kind: 'fixed',
        title: 'A tap can no longer move a task by accident',
        text: 'The status icon on a card was a button that changed the stage, and on a completed task it wrapped straight back round to Open - no warning, no undo. The icon is now just an indicator; changing the stage takes a deliberate press of one of the stage buttons.',
        help: 'tasks-assign',
      },
      {
        kind: 'fixed',
        title: 'Notification switches that did nothing are now honest',
        text: 'Five switches in Settings promised notifications the app has never sent. Four of them - quote received, awarded, reminder - now work. "Bid revision requested" and "Milestone reached" are marked COMING SOON instead, because nothing raises them yet. A switch that governs nothing is worse than no switch.',
        help: 'notification-preferences',
        href: '/settings',
      },
    ],
  },
  {
    date: '2026-08-26',
    title: 'Bids and Quotes are one tab, and the project tabs are regrouped',
    items: [
      {
        kind: 'new',
        title: 'Bids and Quotes were the same job under two names - now they are one tab',
        text: 'Bidding lived in two places: a Bids tab under People and a Quotes tab under Financials, backed by two separate sets of records built years apart. The older one could only reach subs who already had a SyteNav account - a sub without one was invited and never told, with no link to open even if they had been. Everything now lives in one Quotes & Bids tab. Your old bid packages, invitations and bids have been moved across, and every one of those stranded invitations now has a working link you can send. Old bookmarks still work.',
        href: '/projects',
      },
      {
        kind: 'improved',
        title: 'The project tabs are grouped by what you are doing',
        text: 'The sections were named after how the app was built rather than how a job runs. RFIs sat under People, which is where you would never look for a question about the drawings. Estimate sat under Field even though it is the price you hand the client. Site was a section containing one tab. There are now four: FIELD for the work, BUYOUT for pricing it out and the subs doing it, MONEY for everything with a number on it, and DOCS for the formal paperwork. Nothing was removed, and the permissions screen uses the same names so the two finally agree.',
        href: '/projects',
      },
    ],
  },
  {
    date: '2026-08-26',
    title: 'Every Send button now actually sends',
    items: [
      {
        kind: 'new',
        title: 'Quote requests, document requests, shared files and client invoices send themselves',
        text: 'All four of these had a Send or Email button that did not send anything - it opened YOUR mail client with a draft and left the rest to you. Worse, the app already knew the address and already had the link, so it was making you copy something it could have addressed itself. The client invoice one was the worst: it opened an empty To: field. All four now send a proper email, with the address filled in from whoever is on file and room for a line of your own. Copy Link is still right there, and if a send fails it says so and points you back at it rather than pretending.',
        href: '/projects',
      },
      {
        kind: 'fixed',
        title: 'Some shared links pointed at a page your recipient could not open',
        text: 'RFI, compliance, quote, selections and calendar links were built from whatever address YOUR browser happened to be on. Opened from the wrong one, the link you copied went somewhere your sub or client could not reach. They are now always built against the app address, so a copied link works wherever you copied it from.',
        href: '/projects',
      },
    ],
  },
  {
    date: '2026-08-26',
    title: 'Send the client their link, and stop breaking it by accident',
    items: [
      {
        kind: 'fixed',
        title: 'Opening Share with Client used to kill the link you had already sent',
        text: 'Every time you opened the Share with Client box it quietly made a brand new link - which meant the link already sitting in your client\u2019s inbox stopped working, without warning, just because you looked. The box even said underneath that the link never expires. It now shows you the SAME link every time. Making a new one is a separate button that warns you first, because breaking the old link is the only reason to press it.',
        href: '/projects',
      },
      {
        kind: 'new',
        title: 'Email the client their link straight from the dialog',
        text: 'There is now a Send box under Copy Link. It is already filled in with the client\u2019s email address if you have one on file, you can add a line of your own, and it sends them a proper email with the link. Copy Link is still there and still works - if sending fails for any reason it tells you so and points you back at it, rather than pretending it went.',
        href: '/projects',
      },
    ],
  },
  {
    date: '2026-08-26',
    title: 'Two fixes on the way into a new job',
    items: [
      {
        kind: 'fixed',
        title: 'The New Project button on an empty projects list did nothing',
        text: 'If you had no projects yet, the projects page showed a New Project button that was not wired to anything - you could click it all day. It was the only thing to click on that screen, which made it a poor first impression. It works now, and it is a real link, so you can middle-click it into a new tab.',
        href: '/projects',
      },
      {
        kind: 'improved',
        title: 'Adding a project from a customer now asks the same questions as anywhere else',
        text: 'The Add Project box on a customer page - both from the customers list and from a customer\u2019s own page - was a short form: name, address, type, start date. It never asked how the job bills or how it pays you, so every job started there was quietly filed as simple invoicing - even a commercial job that bills by pay application - and had no contract type, which is what the Budget tab needs before it can show you any profit. It is now the same full form as New Project, with the customer already filled in, so a job started from a customer is set up exactly like one started anywhere else.',
        href: '/customers',
      },
    ],
  },
  {
    date: '2026-08-26',
    title: 'The website moved to the front door',
    items: [
      {
        kind: 'improved',
        title: 'Marketing pages lost the /homepage in their address',
        text: 'Every public page used to sit under sytenav.com/homepage/... - a routing detail that was never meant to be seen, and which showed up in every Google result as "sytenav.com > homepage > pricing". The pages now live where you would expect: sytenav.com, sytenav.com/pricing, sytenav.com/features. Every old link still works and lands in the right place, so anything you have already shared or bookmarked is fine.',
        href: '/',
      },
    ],
  },
  {
    date: '2026-08-26',
    title: 'Notification settings that actually save',
    items: [
      {
        kind: 'fixed',
        title: 'Your notification switches were being ignored',
        text: 'Settings had a Notifications tab with eight switches. None of them saved. You could turn an email off, watch the switch move, reload the page, and find it back on - and nothing was reading the setting anyway. That is fixed: every switch now saves the moment you press it, and the app genuinely honours it. If you turned something off in the past and kept getting it, that is why, and it will not happen again.',
        href: '/settings',
      },
      {
        kind: 'new',
        title: 'Choose the bell, email, or both - for each kind of notification',
        text: 'Every notification now has two switches: show it in the bell, and send it as an email. There are sixteen of them, grouped by Work, Money, Bids and Compliance, each with a line saying exactly what sets it off. Email is deliberately off for most things and on for six where missing it costs you something real: somebody waiting on your sign-off, a bill needing approval, a bill of yours getting paid, a bid decision, an insurance certificate about to lapse, and an invitation to quote. Four more are listed as Coming soon so you can see what is on the way.',
        help: 'notification-preferences',
        href: '/settings',
      },
      {
        kind: 'fixed',
        title: 'Some notifications were filed under the wrong name',
        text: 'The same event was being recorded under different names depending on where in the app it came from. An invitation to bid and a bid arriving were both filed as one thing, even though they travel in opposite directions - so a sub who muted one would have stopped being invited to quote. Invoice approved, released and paid were three separate names for one question. Inspection updates were filed under names nothing recognised. These are now one name each, so a switch you set governs everything it should, and notifications you already had still show correctly.',
        href: '/settings',
      },
    ],
  },
  {
    date: '2026-08-14',
    title: 'The budget screen stops guessing what kind of job this is',
    items: [
      {
        kind: 'new',
        title: 'A setup checklist for a job that is already under way',
        text: 'Putting a job that has already started into SyteNav meant working out for yourself what to enter and in what order. Every job now has a "Setup 4/10" chip in its header - click it and a panel slides out from the right with the whole list, what is done, and a button straight to whatever is next. The order is the advice: say how the job pays BEFORE the budget, because it decides what the budget tracks; add the subs before requesting their insurance, because otherwise you are asking nobody; share the client link last, once there is something worth looking at. Steps the job genuinely cannot work without are marked "needed". The chip disappears once everything is done, and you can hide it - with an Undo, and a switch in Project Settings to bring it back later. The same walkthrough is in Help under "Set up a job that has already started", including how to catch up on money already spent.',
        help: 'set-up-existing-job',
        href: '/projects',
      },
      {
        kind: 'new',
        title: 'Tell it how the job pays, once',
        text: 'Cost-plus, fixed price, or building to sell. The Budget tab used to show a "what are you charging for this job?" box AND a markup box at the same time, with "leave it empty on cost-plus" underneath - because it genuinely did not know which kind of job it was looking at, and was leaving you to work it out. On a cost-plus custom home that box was asking a question the job has no answer to. Now you answer it once and the screen settles: cost-plus tracks your markup, fixed price and spec track a contract value or a sale price. Set it on a new job, change it any time in Edit project, or set what you mostly do in Settings so new jobs start there.',
        help: 'add-project-budget',
        href: '/projects',
      },
      {
        kind: 'improved',
        title: 'Real profit on a cost-plus job',
        text: 'A cost-plus job has no contract value, so the profit panel had nothing to measure against and simply did not appear. It now shows what it should: your fee across the budget, and - once costs land - the fee actually earned, worked out invoice by invoice. That second number follows anything you billed at cost or gave its own percent, so it is the fee you will really collect rather than the rate multiplied by your spend. It is the same figure the Billing the client tab reports, from the same calculation, so the two screens cannot disagree.',
        help: 'money-overview',
      },
      {
        kind: 'improved',
        title: 'Markup lives in one place instead of three',
        text: 'The markup box had ended up sitting on the Budget tab next to "Add preconstruction / soft costs" - a setting parked beside a button, on the same row purely because of how the layout had grown. It is now with the money it decides: in the cost-plus panel, and in Project Settings. The pre-award estimate bar still prices your proposal, and on a cost-plus job it reads the rate rather than offering a second box that writes the same field.',
        help: 'add-project-budget',
      },
      {
        kind: 'new',
        title: 'Click a budget line to see what is actually behind it',
        text: 'The sheet could tell you a line was at $47,700 and nothing at all about what made it that - answering "why" meant opening three other tabs and matching things up by the sub\'s name. Click anywhere on the line now and a panel shows its contract, every bill against it, every change order, and every receipt, each one clickable through to where it lives. Anything not yet approved is listed too, greyed, with what it is waiting on - so you can see what is coming as well as what has landed. It carries the same four figures as the row you clicked, from the same calculation, and an Edit line button for the line itself.',
        help: 'add-project-budget',
        href: '/projects',
      },
      {
        kind: 'new',
        title: 'Split one bill across several budget lines',
        text: 'A supplier invoice covers lumber AND windows. A sub\'s bill is half one line and half another. Until now a bill could only land where its subcontract pointed, all of it, in one place. Open any bill and "Split this across budget lines" lets you put parts of it wherever they belong, at whatever amounts. It does not have to add up to the invoice total - whatever is left is shown as unassigned rather than quietly sent somewhere - and it can never add up to more than the invoice, which is the one mistake that would overstate what has landed on your budget. While a bill has a split on it, the split is the whole story: it stops following its subcontract, so nothing is ever counted twice.',
        help: 'add-project-budget',
      },
      {
        kind: 'new',
        title: 'Set the markup on a budget line, not on every invoice',
        text: 'The rate could only live on the whole job or on one bill, so "permits at cost, electrical at 15%" meant remembering to set it on every invoice as it arrived, forever. Each budget line now carries its own answer, and every bill landing there follows it. Open a line and set its rate, or tick it to bill at cost. A single invoice can still overrule it when one bill genuinely differs. Blank means follow the job, so changing the project rate still moves everything you have not given its own answer - and a bill split across a line at 15% and a line at cost now earns the right fee for each part.',
        help: 'money-overview',
      },
      {
        kind: 'improved',
        title: 'Your markup no longer sits live under the cursor',
        text: 'The rate and the contract value were permanently-open input boxes on a screen you scroll through all day to READ - one stray click and a keystroke away from moving a number that decides what your client is billed. They now read as plain text with a small pencil beside them. Click it to edit, tick to confirm, Escape to abandon; nothing saves just because you clicked away mid-edit. The rate is also in Project Settings, alongside the contract type, for anyone who would rather change it there.',
        help: 'add-project-budget',
      },
      {
        kind: 'fixed',
        title: 'Adding photos to a daily log could lock up your machine',
        text: 'Every photo you picked was converted into a text copy of itself and kept in the page - about two and a half times the size of the original, per photo, on top of the photo. Twenty pictures off a phone could run to a gigabyte of memory, and a computer that runs out of memory stops responding entirely rather than just showing a slow page. Previews now point at the photo the browser already has instead of copying it, and are released when you remove one. A side effect worth knowing: thumbnails could previously end up against the wrong photo, because the copies finished in whatever order they finished. They cannot now.',
        href: '/projects',
      },
      {
        kind: 'new',
        title: 'Drag drawings straight onto the Plans tab',
        text: 'Drop as many as you like anywhere on the tab - or onto a folder to file them as they land. They queue up with the name already filled in from the file and the drawing type guessed from it (A-101 reads as architectural, M-301 as MEP), so five drawings is one review and one click rather than five trips through an upload box. Anything that guessed wrong you just change in the row. The Upload button takes several at once now too. If one file fails the rest still go, and only the failure stays on screen with its reason.',
        href: '/projects',
      },
      {
        kind: 'fixed',
        title: 'Big drawings could not be uploaded at all',
        text: 'A plan went through our server on its way to storage, and that has a hard 4.5MB ceiling imposed before any of our code runs - so a real drawing set was rejected with no error to show and the page simply hung. Plans are the likeliest thing in the app to be large, so this was the worst place for that limit to be. Uploads now go straight to storage, with a 200MB limit and a proper message if something goes wrong.',
      },
      {
        kind: 'fixed',
        title: 'Plans filed in a folder no longer show up twice',
        text: 'The Plans tab listed your folders and then, underneath, every plan on the job - including the ones already inside those folders. Filing something away left it in exactly the place you filed it away from. The list under the folders is now what is NOT in a folder, which is what filing is for. The tab also has a search box that looks across the whole job rather than just the folder you are standing in, tells you what is there (12 plans, 3 folders, 9 filed away), shows the drawing type as a coloured tag, and no longer renders a blank screen when you open an empty folder.',
        href: '/projects',
      },
      {
        kind: 'improved',
        title: 'The money tabs now say which direction the money goes',
        text: '"Invoices" and "Payments" never told you WHOSE invoices or whose payments, and the bills a sub sends you versus the bills you send a client were the two things people most often could not find. They are now "Bills from subs" and "Billing the client". Same screens, same data - the label just answers the question you were asking when you went looking.',
        help: 'money-overview',
      },
      {
        kind: 'new',
        title: 'Pass a sub\'s bill straight on to the client',
        text: 'Approve a bill from a sub and there is now a "Bill the client for this" link right on it, showing what the client owes with your markup already on. It opens a new client invoice with that cost ticked. Before, you approved the bill and then had to go to another tab and find the same cost again in a list - which is the step that quietly got dropped. If a cost has already gone out to the client it says so instead, so nothing can be billed twice.',
        help: 'money-overview',
      },
      {
        kind: 'improved',
        title: 'The proposal reads like a cost-plus proposal on a cost-plus job',
        text: 'Generate Proposal took every budget line, added your markup and printed one bold total at the bottom - which is exactly right for a fixed price, where that number is a promise. On cost-plus you are not promising a number, you are promising a method: actual cost, plus your fee. A client who reads a bold total as a fixed quote will hold you to it. A cost-plus job now prints the estimated cost of work, your contractor\'s fee on its own line at its stated percent, and an estimated total that says it is an estimate - with a line at the top spelling out the basis before any figure appears, and cost-plus terms instead of "pricing covers the scope described here". The bottom line is the same number either way; only what the document claims about it has changed.',
        help: 'estimate-proposal',
      },
      {
        kind: 'fixed',
        title: 'Per-invoice markup was hidden on jobs with no default rate',
        text: 'The "bill this at cost" tick and the custom percent on each sub invoice only appeared once a project markup rate was set. On a cost-plus job priced line by line - where you set each one deliberately and have no house rate - there was no way to mark up the first invoice at all. They now show on every cost-plus job whatever the default is. The Budget tab also points at where they live, which is Bills from subs: you mark up a real cost, not a budget line, because a budget line is a forecast and nobody bills a forecast.',
        help: 'money-overview',
      },
    ],
  },
  {
    date: '2026-08-11',
    title: 'Selections, item lists, and seeing what you sent',
    items: [
      {
        kind: 'new',
        title: 'Selections board',
        text: 'Every choice the client owes you - paint, tile, flooring, cabinets, fixtures, windows - in one place. Each carries an allowance and a decide-by date driven by lead time rather than the schedule, because a six-week window order decided the week framing finishes is already late. Starting a board asks which categories this job actually has, pre-ticked for the kind of job it is: a commercial fit-out gets 41 selections instead of 71, with no sod, shutters or bathtub.',
        help: 'selections',
        href: '/projects',
      },
      {
        kind: 'new',
        title: 'Your client picks on the link they already have',
        text: 'Same link as their project portal - no second link to lose, no account needed. They see only what is waiting on them, most urgent first, with the upgrade cost shown against your allowance before they commit. Every option can carry a photo, a brand and a link to the product page, or you can point them at the manufacturer\'s full range and let them write in what they found. Everything decided shows its status in their words, and they can change anything not yet ordered.',
        help: 'selections',
      },
      {
        kind: 'new',
        title: 'Allowances, change orders and ordering, all on the budget',
        text: 'Link a selection to a budget line and the allowance fills in with what is left on that line - and says so when you have gone over. Go over on a pick and one click raises a change order for the difference, against the same line. When you are ready to buy, "Order it" records the supplier from your Directory, the amount already priced from what they chose, and the expected delivery, then books the cost against the budget. A selection cannot be accepted or ordered without a line, because money with nowhere to land is the thing this board exists to prevent.',
        help: 'selections',
      },
      {
        kind: 'new',
        title: 'Scan a sub\'s invoice instead of retyping it',
        text: 'Drag the PDF a sub emailed onto the Invoices tab - a photo or screenshot works too - and it reads the document and fills the form in: who is billing, the amount, the date, what the work was, with the file already attached. It also matches the invoice to a subcontract on that job and to a line on their payment schedule, and tells you in red when the amount does not match the line it looks like. Nothing saves until you confirm it.',
        help: 'scan-sub-invoice',
      },
      {
        kind: 'fixed',
        title: 'A typed option was only saved by adding another one',
        text: 'On the selections board, the row where you type an option - brand, name, price, link, photo - was only saved by clicking the small "+" at the end of it. Type one option and move on and it looked entered but never was. Enter now adds it from any field in the row, the button says Add rather than just "+", and while there is something typed the row says "Not added yet" so a half-finished line cannot pass for a saved one.',
        help: 'selections',
      },
      {
        kind: 'new',
        title: 'Invoice your client - open book, or a flat number',
        text: 'Send it with a link - the client opens it on their phone, no account and no sign-up, the same as a file share or their project portal. "Issue & get link" creates it, then Copy link or Email opens your own mail client with it already written. The list tells you whether they have opened it yet. There was no way to produce a bill to SEND a client on a job that is not AIA, which is nearly every job. Payments & Escrow only recorded money that had already arrived. Now: pick the costs you want to bill for - approved sub invoices and receipts, each already carrying its markup - and it raises an invoice. Nothing is retyped and a cost can only ever be on one invoice, so the same electrician\'s bill cannot go out twice. One tick box decides what the client sees: cost, your percentage and the total on every line for an open-book cost-plus job, or a single amount per line where your margin is nobody else\'s business. It defaults to hidden, because a client who was never shown your margin cannot be un-shown it. Print or save as PDF from the invoice.',
        help: 'money-overview',
      },
      {
        kind: 'new',
        title: 'Markup on each invoice, with a tick to bill something at cost',
        text: 'Cost-plus is billed invoice by invoice: the electrician sends $35,000, your 15% goes on, the client owes $40,250. Every sub invoice now shows exactly that - cost, markup, what to bill - and the Invoices tab totals it across everything approved so far. Two controls per invoice: tick "Bill this at cost" for a permit fee or anything you pass through, or type a different percent for one you negotiated. Leave the percent blank and it follows the project rate, so changing that rate still moves everything you have not given its own answer. The contractor fee on Payments & Escrow is now worked out the same way, item by item - it used to be one flat percentage multiplied over the job total, which silently ignored both of these.',
        help: 'money-overview',
      },
      {
        kind: 'improved',
        title: '"Sellout" is now called what it is on your kind of job',
        text: 'Sellout is developer language - it is what a spec house SELLS for. On a custom home or a fit-out you are not selling anything, you are charging a client a contract value, and calling it a sellout made the whole panel read as though it was meant for somebody else. A job with a client on it now asks "What are you charging for this job?" and labels the figure Contract value; a job with no client - one you are building to sell - still says Sellout. Same number, called the right thing.',
        help: 'sellout-projected-profit',
      },
      {
        kind: 'improved',
        title: 'The markup box no longer disappears once a job is won',
        text: 'Markup showed while a job was in Planning and then vanished when it went Active, which looked like it had been taken away - especially as the same number stayed editable on Payments & Escrow as your contractor fee rate. It is now on the Budget tab at every stage: the full estimate bar with client price and proposal before the job is won, and a compact percent box after, with a note on where that number is still used. It is hidden only on AIA jobs, where progress billing replaces it.',
        help: 'add-project-budget',
      },
      {
        kind: 'fixed',
        title: 'Projected profit was made up until you set a sale price',
        text: 'With no sellout entered, the budget screen fell back to an assumed markup and printed a confident green "projected profit" with a margin percentage - for a job whose sale price nobody had told it. It now asks for the figure on a single line instead of reporting on one it invented, and profit only appears once you have actually set what the job sells for. It still shows at every stage, not just planning: "am I still making money on this" is the question you ask most once work has started, and profit against actual spend only means anything once costs have landed. Leave it empty on a cost-plus job, where your markup is the profit.',
        help: 'sellout-projected-profit',
      },
      {
        kind: 'improved',
        title: 'The budget screen explains itself, and repeats itself less',
        text: 'Hover any of the four figures at the top - or any column heading on the lines below: Budgeted, Committed, Actual, Variance - and it says in plain words what the number means and how it is worked out, including why Left to spend is not simply budget minus invoices. The explainers wait a moment and fade in, so they do not flash open as the pointer crosses the screen. The variance column on a line now counts signed contracts the same way that tile does; the two used to disagree, and hovering shows how much of a contract is signed but not yet invoiced. Three tiles that printed the same figure as Total Budget are gone, the interior/exterior split no longer carries a Grand Total that contradicted the one above it (it was ignoring approved change orders), and the soft-costs pitch shrinks to a single link once a job is active.',
        help: 'add-project-budget',
      },
      {
        kind: 'new',
        title: 'Every invoice shows what you are actually being charged for',
        text: 'An invoice used to keep only its total - the scan read the line items off the PDF and threw them away, so the one question that matters, what am I paying for, meant reopening the document. The breakdown is now kept and shown on the invoice: every line with its quantity and rate where the vendor printed one, then the lines total, tax, retainage withheld, and the invoice total. It checks that they add up and says so plainly when they do not, and by how much - a breakdown that looks like detail but does not reconcile is where a quiet extra hides. Typed invoices get the same treatment: add lines by hand and it reconciles those too. Lines the quote check flagged are highlighted in the table with what was quoted.',
        help: 'scan-sub-invoice',
      },
      {
        kind: 'new',
        title: 'Not every sub needs every compliance document',
        text: 'Required documents were fixed by vendor type, so a one-man sub with no workers\' comp, or a trade that cannot hold a licence in the state, sat as Missing forever and turned the job red over paperwork that was never coming. Any document can now be marked "Not needed" for a vendor, and put back just as easily. Requests only ask for what that vendor actually owes and has not already sent - asking for a waived licence, or for a COI you already hold, is how these requests get ignored.',
        help: 'compliance-overview',
      },
      {
        kind: 'new',
        title: 'A sub\'s invoice is checked against what they quoted',
        text: 'Scan an invoice from a sub whose contract has priced lines on it, and it now tells you either "Matches their quote" or exactly what does not: a line billed for more than it was quoted (showing both figures), a line that is not on the quote at all, or an invoice that takes the running total past the contract. The contract total is the check most people already do in their head - the two that actually cost money are a rate nobody agreed to and work that was never quoted, and both look completely ordinary on an invoice that comes in under the contract. It never blocks the invoice; it just means you see it before you approve rather than after.',
        help: 'scan-sub-invoice',
      },
      {
        kind: 'fixed',
        title: 'Importing a budget sheet brought the lines in at zero',
        text: 'On a brand new job the only button on an imported sheet was "Add all as new (save template)" - and that route quietly dropped every amount, so the preview showed your prices and the budget came in at zero. There is now a plain "Add these lines to this budget" that puts the sheet straight on the job without going near a template, and the template route keeps its amounts too. Separately, the reader only understood amounts stored as plain numbers, so "$24,000.00", "24,000" or any CSV read as no amount at all; it now handles currency symbols, separators, cents and credits like (500), takes the line total rather than the unit price, and stops turning a cost-code column into the line-item name. The confirmation screen tells you how many amounts it actually read before you commit, and a "Bring the amounts in too" tick box lets you import just the line items when that is what you wanted.',
        help: 'add-project-budget',
      },
      {
        kind: 'new',
        title: 'Type into a PDF instead of printing it',
        text: 'On the Files page, any PDF now has a "Fill in text" button. Click anywhere on the page to add text, drag it to line up with the box on the form, and save. It is for the pile of one-page forms that get printed, filled by hand and rescanned - permit applications, supplier credit apps, W-9s. Saving asks you to name it, suggesting the original name with "(filled)" on the end so you can change it to something useful like "W-9 for Brookstone Flooring". It saves as a NEW file and shows who filled it; the original is left exactly as it was. Your own files also now sit at the top of the Files page, above documents collected from subs. To be clear about what this is: it types text onto a document. It is not a signature tool and does not offer signature fields.',
        help: 'fill-in-pdf',
        href: '/files',
      },
      {
        kind: 'new',
        title: 'Swipe between documents on your phone',
        text: 'Open a document on a share link and swipe left or right to move to the next one, instead of tapping each file open in a new tab and coming back. Photos, PDFs and anything else all page through the same way, with a counter so you know where you are. Daily log photos swipe too. Arrows and arrow keys still work on a laptop, and pinch-to-zoom on a photo is untouched.',
      },
      {
        kind: 'fixed',
        title: 'Commercial jobs had nowhere to put a sub\'s bill',
        text: 'On a job set to AIA billing the Invoices tab was hidden completely - but that tab holds bills your subs and suppliers send YOU, which has nothing to do with how you bill the owner. The job type with the most subcontractors on it had nowhere to record a single one. It is back. Every money tab now says which direction it points: Invoices is money out, Pay Apps and Payments are money in, each linking to the other.',
        help: 'money-overview',
      },
      {
        kind: 'improved',
        title: 'Deleting an invoice, and a clearer Invoices tab',
        text: 'Delete is now a labelled button instead of a small grey icon, and it works at any status - including paid, which is exactly where a duplicate you already ticked off needs removing and where the button used to disappear. The confirmation tells you what it will do first: how much comes back off which budget line, and whether the bill has already gone to QuickBooks. The tab now says plainly that these are bills your subs sent you - upload one they emailed or enter it yourself - with a link to where you bill your client instead.',
        help: 'approve-invoice',
      },
      {
        kind: 'fixed',
        title: 'Approving a change order now raises the budget line',
        text: 'Approving a change order grew the sub\'s contract but left the budget where it was, so the line went red at the exact moment the extra was approved and paid for. An approved change order now adds to the budget line it belongs to - the one you picked, or the one its subcontract sits on - and the line shows "incl. $X CO" so the budget never grows silently. Your original estimate is kept, and un-approving or deleting the change order takes the money straight back out.',
        help: 'change-order-basics',
      },
      {
        kind: 'fixed',
        title: '"Remaining" was telling you that you had more money than you did',
        text: 'The tile counted only invoices that had arrived, not the contracts you had already signed. Budget $500k, signed $450k, billed $200k, and it told you $300k was left - it was $50k. It now counts signed contracts, and is labelled "Left to spend". The Committed tile says how much is signed but not yet billed, which is the money that used to hide.',
        help: 'add-project-budget',
      },
      {
        kind: 'fixed',
        title: '"Mark Sent to Sub" had the invoice going the wrong way',
        text: 'These are bills your subs send YOU. The button now reads "Mark Sent for Payment" - which is what it always did: released to be paid, handed to a bookkeeper or queued in the next payment run. You can also go straight from Approved to Paid now, instead of being made to click through a step that did not apply. The sub gets told their invoice was released for payment, rather than being asked to review an invoice they wrote.',
        help: 'approve-invoice',
      },
      {
        kind: 'new',
        title: 'Every sub invoice says which budget line it hits',
        text: 'Pick the sub - or let the scan pick one - and the invoice tells you where the money lands: the line, what is budgeted, what is already billed against it, and what is left. It warns you in red when the invoice is more than that line can still cover. Every invoice card shows the same thing, so you no longer open the Budget tab and work backwards from the sub\'s name to find out which line moved.',
        help: 'scan-sub-invoice',
      },
      {
        kind: 'fixed',
        title: 'An invoice for a sub with no budget line used to vanish',
        text: 'If a subcontract had no budget line, its invoices saved fine and the budget simply never moved - real money out, flat budget, no warning anywhere. The invoice now says "This won\'t show up on the budget" and offers to add the line on the spot, starting it at the contract amount.',
        help: 'scan-sub-invoice',
      },
      {
        kind: 'new',
        title: 'Item lists on a quote request',
        text: 'When you are the one buying the material, send the lines and every supplier prices the same ones. Import a takeoff, paste rows out of a spreadsheet, or type them. Their prices come back line by line, and "Compare line by line" shows you the one item that is triple on one bid and missing on another - the thing a total hides.',
        help: 'item-list',
      },
      {
        kind: 'improved',
        title: 'Editing the scope on a quote request',
        text: 'Click any line to change its wording, or use the move arrows to send it from Included to Not included and back - it used to mean deleting and retyping. The panel names which trade template filled it in, and the item list now says plainly whether it is needed on this package, so it is clear the two are not doing the same job.',
        help: 'scope-what-to-send',
      },
      {
        kind: 'improved',
        title: 'You can see your own quote request again',
        text: 'An expanded request showed who you invited and what you attached, but not the scope you sent or what you asked for back - you had to open the sub\'s link to find out. There is now a "What you sent" panel on the card.',
        help: 'scope-what-to-send',
      },
      {
        kind: 'new',
        title: 'This page',
        text: 'Somewhere to find out what changed. Anything you would notice shows up here the day it ships, with a link through to the Help article that explains it in full.',
      },
      {
        kind: 'fixed',
        title: 'The client link on a project never shared',
        text: 'On a project that had never been shared with a client, the "Copy client link" button on the Selections board was missing entirely. It now creates the link for you.',
      },
      {
        kind: 'fixed',
        title: 'The client name on the portal',
        text: 'The project portal was reading the wrong field, so the "Client:" line never appeared even when the name was filled in.',
      },
    ],
  },
  {
    date: '2026-08-10',
    title: 'Scope templates and document sharing',
    items: [
      {
        kind: 'new',
        title: 'Scope templates per trade',
        text: 'Pick the trade and the quote request fills itself in: who supplies the material, what is included, what is excluded, and what you need back besides a price. Every bidder answers the same questions, which is what makes quotes comparable - no takeoff required.',
        help: 'scope-what-to-send',
      },
      {
        kind: 'new',
        title: 'Send documents to anyone',
        text: 'A Sharing tab under Docs & Legal on every project. Pick files, pick a contact, send a link. They can send documents back on the same link, and you can add more files to a link that is already out there.',
      },
      {
        kind: 'new',
        title: 'Project status is a switch',
        text: 'The status badge on a project is now a dropdown, with a pre-flight checklist before a job goes Active so nothing obvious is missing.',
      },
    ],
  },
  {
    date: '2026-08-09',
    title: 'Preconstruction and the money picture',
    items: [
      {
        kind: 'new',
        title: 'Sellout and projected profit',
        text: 'Put your sellout against the budget and see projected profit as you go, per unit and across a whole site.',
      },
      {
        kind: 'new',
        title: 'Hard and soft costs, split',
        text: 'Soft costs get their own section on the budget with their own subtotal and a standard starter list, so preconstruction reads as its own stage instead of being buried in the trades.',
      },
      {
        kind: 'improved',
        title: 'A planning-stage project menu',
        text: 'A job that has not broken ground no longer shows tabs for things that cannot happen yet. They come back the moment the project goes Active.',
      },
      {
        kind: 'new',
        title: '49 budget categories in build order',
        text: 'Trades listed the way the job actually runs, plus your own custom categories which now stick around from job to job.',
        help: 'add-project-budget',
      },
      {
        kind: 'fixed',
        title: 'Project Settings',
        text: 'The address dropdown no longer opens by itself, and billing method, square footage and job type are editable after setup.',
      },
    ],
  },
]

/** The newest release date, used for the "something new" badge. */
export const LATEST_RELEASE = RELEASES[0]?.date ?? ''

export const SEEN_KEY = 'sytenav-whats-new-seen'

/** True when there's a release the reader hasn't acknowledged yet. */
export function hasUnread(lastSeen: string | null): boolean {
  if (!LATEST_RELEASE) return false
  if (!lastSeen) return true
  return lastSeen < LATEST_RELEASE
}

/** How many releases landed since they last looked. */
export function unreadCount(lastSeen: string | null): number {
  if (!lastSeen) return RELEASES.length
  return RELEASES.filter(r => r.date > lastSeen).length
}
