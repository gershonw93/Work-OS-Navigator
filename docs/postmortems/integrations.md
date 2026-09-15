# Integration post-mortems

QuickBooks, the two registries, and who an email is for.

*Evidence for rules in [`CLAUDE.md`](../../CLAUDE.md). Every rule there that cites
this file is summarised to one line; the reasoning, the report that produced it and
the arithmetic live here. Read the matching section before arguing with a rule —
each one was written the day something shipped broken.*

---

## QuickBooks
- One-way push, SyteNav -> QuickBooks Online. All of it lives in
  `lib/quickbooks-push.ts`; the manual Settings sync and the automatic push
  call the SAME functions so they cannot drift.
- **The connection is PER COMPANY.** A company only ever pushes to its own
  QuickBooks file, and the sync only sees the company you are signed into.
  Counting "unsynced" across companies is how you end up telling somebody
  their payment failed to sync when it was never in that company's scope.
- ACCRUAL, and the halves must move together: a SENT client invoice becomes a
  QBO Invoice (A/R); a payment becomes a Payment applied against it; a deposit
  with no invoice to settle becomes a Sales Receipt. **A sale must never be
  counted twice** - a Sales Receipt already means sold AND paid, so if an
  invoice exists, the money settling it can never be another receipt.
- BOTH halves, BOTH directions. Money in: a client invoice is an Invoice and
  the money settling it is a Payment applied to it. Money OUT: a sub bill is a
  Bill and the money settling it is a BillPayment applied to it
  (`invoices.qbo_payment_id`, separate id and separate claim from `qbo_id` -
  one row, two QBO records). Ship a half and the ledger overstates: A/R showed
  money owed that had arrived, A/P showed money owed that had gone out.
- A payment settles the invoice NAMED ON IT (`client_payments.client_invoice_id`),
  never "the oldest one still sent". Same-day invoices share an `issue_date`, so
  "oldest" was whichever row came back first and the money settled a coin toss.
  Only unlinked money (a deposit) falls back to oldest-open.
- A payment whose invoice has NOT reached QBO yet must book NOTHING - not a
  Sales Receipt. Booking one records the sale, then the invoice records it
  again. `pushClientPayment` (Sales Receipt) is only for money that settles
  nothing; every other caller goes through `pushPaymentForProject`. The
  Settings backlog sync called the Sales Receipt pusher directly for a while.
- Keep `Fault.Error[].Detail`, not just `Message`. QBO's Message is a label
  ("Object Not Found"); Detail is the sentence that names the object. Errors
  are `QboError` and carry `.code` - branch on `QBO_OBJECT_NOT_FOUND` (610).
- 610 means "a reference you sent is unusable" and names NONE of them. On 610:
  retry once without the optional ref (the payment method, which moves into the
  memo), then `probeReferences` each id we sent and log which one QBO refuses.
  Never fall back to a Sales Receipt on failure - that is the double-count.
- Every QBO lookup filters `Active = true`. `paymentMethodId` did not, so an
  inactive method came back as a good id. PaymentMethod.Type is only
  `CREDIT_CARD` or `NON_CREDIT_CARD` - `OTHER` is not a value QBO defines.
- A cached `qbo_id` for a record QBO does not have fails identically forever:
  clear it so the next push re-creates. Only when MISSING, never when inactive
  - re-creating an inactive customer leaves two with the same name.
- Reference no. is the USER's (`client_payments.reference`), not `SN-<id8>` -
  it is the bank-reconciliation column. `paymentIdentity()` composes ref+memo
  for every payment path; SN- moves into the memo when the user gave a ref, so
  it appears in exactly one place. `PaymentRefNum` on a Payment, `DocNumber` on
  a Sales Receipt - the wrong one is accepted and silently ignored.
- A payment row is one of TWO QBO entities. `qbo_txn_type` says which; the
  refresh assumed Sales Receipt for everything and reported applied Payments as
  missing. Any path that touches an existing payment must branch on it.
- Every push: never throws, capped at 8s, "not connected" is a normal state,
  and misses land in `quickbooks_sync_log` for the backlog sync to pick up.
- Pushes take an atomic claim (`qbo_claimed_at`) via a conditional UPDATE. A
  check-then-act guard is NOT enough: a double-pressed button created two QBO
  invoices for one record, and the spare became an orphan receivable.

## Two registries, and why a new thing goes IN them
- **A NEW NOTIFICATION BELONGS IN THE CATALOG, OR ITS AUDIENCE IS NOT A
  SETTING.** `lib/notifications.ts` is the list of event types; an entry with
  `status: 'live'` appears on its own in Settings -> Notifications (each
  person's bell and email switches) AND in Who gets told (the company's routed
  audience). A cron that sends under a type the catalog has never heard of is a
  notification nobody can turn off or redirect. The not-ready warning was one
  `notify()` call away from borrowing `inspection_ready`'s audience, which would
  have glued a nag to a different event's switch.
- **A NEW ABILITY BELONGS IN `RESOURCES`, for the same reason.**
  `lib/permissions.ts` is resources x actions, with role defaults a company can
  remap and per-user overrides in `profiles.permission_overrides`. Splitting one
  out is the designed move, not a hack: `margin` came out of `budget` so a PM
  could run a budget without seeing the markup, and `mark-ready` came out of
  `inspections` because RUNNING inspections is office work while saying THE WORK
  IS FINISHED is a report from the site - and every role who can honestly make
  it (`field_supervisor`, `worker`, vendor `read_only`) has `inspections: N`.
  Give every built-in role an EXPLICIT entry: a resource a role never names
  resolves to nothing, which is a permission silently defaulting to "no" for
  somebody who should have it. Pinned in `mark-ready-permission.ts`.
- AND THE ROUTE HAS TO ASK, or the setting is decoration. The inspections PATCH
  gated nothing - `requirePermission` was on DELETE and restore only - so anyone
  who could reach the API could mark ready, change a booking or set a status
  whatever their role said. A body that only touches the ready columns is gated
  on `mark-ready`; everything else on `inspections`.

## Who the email is FOR, and who may send it
- **THERE ARE TWO DOORS INTO SYTENAV AND THEY MEAN DIFFERENT THINGS.** The
  WAITLIST is a stranger asking, approved by a super admin - the only place
  "you're approved" and "beta" are true. An INVITE is somebody already inside
  vouching for a person; there is no second approval because the invite IS the
  approval. `inviteEmail` was written for the first and used for all three
  audiences, so a subcontractor was told he had been approved for a beta he
  never applied to and could start "putting jobs in" - the GC's side of the job.
  One template per audience: `inviteEmail` (waitlist, approvals screen only),
  `teamInviteEmail`, `vendorInviteEmail`. `/api/invite` takes an `audience`,
  defaulting to `team` so an un-updated caller cannot silently get the beta text.
- **A ROLE OR A COMPANY OUT OF A REQUEST BODY IS AN ESCALATION.** `/api/invite`
  checked only that you were signed in, then wrote `body.role` and
  `body.company_id` onto the new profile - so any account, including a read-only
  teammate or an invited sub, could mint an admin of any company whose id it
  had. `middleware.ts` returns early for every `/api/` path, so nothing else was
  gating it. Now: `requirePermission` (`settings_team` for a teammate,
  `directory` for a vendor), the company comes from the ACTOR (a vendor's must
  carry `added_by_company_id` = the inviter's company), a vendor is always
  `read_only`, and only an admin may invite an admin. Ratcheted in
  `invite-audience.ts`: routes taking a role from the body with no permission
  check may only go DOWN.

## The client portal link was gated by nothing at all

The client portal is one standing, read-only link per job: progress, the
schedule, selections, and the invoices the GC has sent their client. Four routes
serve it - read the link, mint one, email it, record that it was shared - and
every one of them checked exactly one thing:

```ts
const { data: { user } } = await db.auth.getUser(token)
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```

`middleware.ts` returns early for every `/api/` path, so nothing else was gating
them. Any signed-in account holding a project id could read that link - and
`read_only` is the VENDOR role, so **a subcontractor invited onto the job had
exactly as much access to the GC's client portal as the GC did**. The thing it
exposes is the GC's billing to their own customer.

And POST **minted a new token unconditionally**, which cuts off a client using
the old link. The only thing standing between a live link and oblivion was a
confirmation dialog in one of the two callers; a second tab, or a double press,
went straight round it. The route had no idea whether it was creating a job's
first link or destroying one somebody was using.

### Two questions, because they are two questions

`client-portal` is the ABILITY, in `RESOURCES` like any other, remappable per
company and per user. Its three actions are genuinely different powers:

| action | what it is |
| --- | --- |
| `view` | read the link. Seeing it IS the power - you can copy it, you can paste it into your own email. This is why the send is gated here and not higher: gating a send above the read is theatre. |
| `create` | bring a link into existence on a job that has none. |
| `edit` | REGENERATE one, cutting off a client already using it. |

`ownedProject` is WHOSE JOB IT IS, and it is deliberately **not** part of
`requirePermission`. That guard has always refused to check company ownership,
because subcontractors legitimately write to jobs they do not own - they submit
bills, file daily logs, clock in - so a blanket check there would break every sub
in the product. It is opt-in per route instead, and the portal family is the
clearest case for opting in. 403, not 404: they can see the job, and pretending
it does not exist is a worse answer to somebody standing on it.

Both halves matter. The permission map can be remapped by a company; the
ownership check is what survives somebody granting `client-portal` to a vendor
role by mistake.

### And the UI trap on the way out

Hiding the share icon from people who cannot use it is right - but `can()` is
`!!perms?.[r]?.[a]`, and a permissions call that FAILED returns `false` exactly
like a denial. That is how the Upload button vanished off the Plans tab with
nothing to say why. So the trigger hides only when the answer is KNOWN:
`!loading && !error && !can(...)`. On a bad minute of signal it stays on screen
and the route answers.

Pinned in `portal-gate.ts`, red-checked seven ways - including one where the
route computes the refusal and then falls past it, which is the same as no
guard and which the first version of the test did not catch.

## A screen is only as usable as the narrowest permission it depends on

Reported as a scan bug: "It says 'Matched to [sub]' at the top but doesn't
actually fill in the sub - you still have to pick it yourself." Reproduced 2/2
on production, as `qa.pm@sytenav.com`, a **Project Manager**.

The trace through the page was right and led nowhere. The scan route returns
`match.subcontract_id`; the handler does exactly what it should:

```ts
if (d.match?.subcontract_id) {
  setSubId(d.match.subcontract_id)
  ...
}
```

`setSubId` fired with the correct id. The form mapping was not the bug.

#453 had just shipped the thing that found it. Before that change, a failed
load of the subcontractor list left the picker empty with nothing said; after
it, the page names the reason in red beside the field. So the report came back
with the missing half:

```
GET /api/projects/ec72d371-.../financials  ->  403
[invoices] The subcontracts on this job: You do not have permission to view financials.
```

And the 403 is CORRECT. `lib/permissions.ts`:

```ts
project_manager: { ... invoices: VE, ... margin: N, financials: N, ... }
```

A PM runs the job and files its bills. They are deliberately not given the
money overview, the same split that took `margin` out of `budget`. Nothing
about that is wrong.

What was wrong is that the **Invoices page**, gated on `invoices`, loaded half
of itself from a route gated on `financials`. A role that legitimately holds
one and not the other got a form it could not complete, and every individual
piece behaved correctly on the way there: the route refused a permission the
caller does not have, the page recorded the refusal, the scan set the value,
the controlled `<select>` had no `<option>` with that id so it fell back to its
placeholder. A green banner saying "Matched to QA Concrete Sub." sat above an
empty picker, which is why it was reported as a matching bug.

**The fix is to move the data, not to widen the role.** Granting a PM
`financials` would hand them the screen the split exists to withhold, to fix a
picker. `subcontracts` and `payment_schedule_items` now come off
`GET /api/projects/[id]/invoices`, which is gated on `invoices` - the thing the
page IS. It also collapses two round trips into one and leaves the page with a
single failure to report instead of two.

The general rule, and the reason this is worth a post-mortem rather than a
commit message: **a screen is only as usable as the narrowest permission it
quietly depends on, and nothing anywhere says which that is.** So
`lib/__tests__/invoices-load.ts` works it out - it walks every `/api/` route the
page fetches, reads the resource out of each route's `requirePermission`, and
asserts that every role holding `invoices: view` also holds that one. Reinstating
the `/financials` fetch fails it by name, on `project_manager`.

Two things came out of writing that scan. The first time it ran it printed
nothing at all: `requirePermission\([^)]*?,` cannot cross the `)` in `admin()`,
so it matched no route and the whole loop asserted nothing while reporting
green - a test that has never failed is a guess about what it covers. The
second is `GET /api/directory`, which asks nothing but "are you signed in"
although a `directory` resource exists. Not a leak (the answer is scoped to the
caller's own company) and not fixed here, because gating it touches screens this
change has no business touching. It is ratcheted at one in that suite and
written down in BACKLOG.md.
