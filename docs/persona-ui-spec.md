# SyteNav - Per-persona UI spec (draft)

> Purpose: before building, spell out exactly what each type of user sees and
> does. Decisions locked so far: field roles get a dedicated **Field Mode**
> (stripped mobile experience), everyone else gets responsive polish. This doc
> is the thing to argue with - edit freely.

Legend for each persona: **Device** (what they're on) - **Lands on** (entry
screen) - **Nav** (how they move) - **Sees** - **Does** (the 2-3 that matter) -
**Hidden** (explicitly not shown).

---

## 1. Owner / Admin
- **Device**: desktop most of the day, phone to spot-check.
- **Lands on**: Dashboard (company-wide).
- **Nav**: full sidebar + Master Calendar / Master Money.
- **Sees**: everything. Company money (cash in vs out, escrow, outstanding),
  every job, approvals queue, activity feed, team, settings.
- **Does**: approve money, check margins, step into a job that's off track,
  manage users/roles/billing.
- **Hidden**: nothing.
- **Open Qs**: does the phone view need its own condensed "owner glance" (today's
  approvals + money + red flags), or is responsive dashboard enough?

## 2. Office Staff / Project Manager (the daily driver)
- **Device**: desktop.
- **Lands on**: Projects list (or their approvals queue - to decide).
- **Nav**: full sidebar minus Settings-admin bits; all project tabs per
  permissions.
- **Sees**: budgets, pay apps / invoices, subs, RFIs, submittals, compliance,
  schedule. The money + paperwork surface.
- **Does**: build budgets, run billing (invoice or pay app), award quotes,
  answer/route RFIs, chase compliance, keep the schedule.
- **Hidden**: company billing/plan settings, user management (PM), delete-key
  management.
- **Open Qs**: PM vs Office Staff - do we split them, or treat as one "office"
  persona with permission differences only? (Leaning: one persona, permissions
  handle the rest.)

## 3. Site Manager / Field Supervisor (on-site power user)
- **Device**: phone + occasional tablet. Responsive, not full Field Mode.
- **Lands on**: **Today** across their assigned jobs (not a project list) -
  what's scheduled, who's on site, what's due, what's waiting on them.
- **Nav**: assigned projects only; a slimmer tab set focused on Field +
  Compliance (Plans, Schedule, Tasks, Daily Logs, Time, Inspections, RFIs).
- **Sees**: their jobs, today's schedule/crew, daily logs, inspections, tasks,
  plans (with pins).
- **Does**: file/approve daily logs, mark work **Ready for Inspection**, assign
  and close tasks, pin the blueprint, raise an RFI, review crew time.
- **Hidden**: budgets, invoices, pay apps, payments, quotes, company settings,
  other people's jobs.
- **Open Qs**: should they see labor cost/hours (yes, likely) but not contract
  money (no)?

## 4. Field Worker (**Field Mode** - SHIPPED v1)
> Built: `/field` shell (no sidebar/tabs) with a bottom bar (Home / Tasks / Log
> / Me), gated to roles `worker` + `member`. Home has the big clock in/out
> (selfie + GPS, reuses the per-project punch API), today's tasks, and a
> photo/log shortcut. `/api/me/tasks` powers it (cross-job assigned tasks +
> assigned jobs + current clock status). Dashboard layout redirects field roles
> here. v1 open Qs left for later: read-only plan viewing, workers raising RFIs,
> offline capture.

- **Device**: phone only. Gloves, sun, one hand. Big targets, few words.
- **Lands on**: a **single home screen** = today, not a dashboard. Three things:
  1. **Clock in / out** (big button, shows if currently on the clock + where).
  2. **My tasks** (just theirs, today first; tap to see detail / mark done).
  3. **Log / photo** (snap a photo to the right job, quick daily-log note).
- **Nav**: no sidebar, no tabs. A bottom bar or big tiles: Home - Tasks -
  Camera/Log - Me (profile/clock history). That's it.
- **Sees**: only jobs they're assigned to; only their own tasks, time, and
  photos.
- **Does**: clock in/out (selfie + GPS), snap photos, add a quick log line,
  check off a task, see today's assignment.
- **Hidden**: all money, budgets, invoices, other people's tasks, the whole
  office app. No project tab strip at all.
- **Open Qs**: do they need to *view* plans (read-only, to find their spot)? Do
  they raise RFIs, or only the supervisor? Offline capture (photo taken with no
  signal, syncs later) - in scope now or later?

## 5. Read-only viewer
- **Device**: any.
- **Lands on**: Dashboard (assigned scope) or a single job.
- **Sees**: read-only versions of what their assignment allows.
- **Does**: look, download, nothing that writes.
- **Hidden**: every create/edit/delete control.

---

## Company type: Subcontractor (already a separate experience)
- **Lands on**: My Jobs.
- **Sees**: My Bids (incoming invites), My Jobs (awarded work), their own scope /
  schedule / payment stages.
- **Does**: submit/revise quotes, mark work Ready for Inspection, track what
  they're owed, run their own standalone jobs (quote = budget).
- **Hidden**: the GC's private money, other subs, GC-only tabs.
- **Open Qs**: does a sub's *field crew* get Field Mode too? (Probably yes -
  same worker persona, different company.)

---

## No-login link experiences (a separate design track)
These are single-purpose pages, phone-friendly, no account:

- **Client / Customer portal** (`/portal/[token]`): progress + what they owe +
  pay stages. Read-mostly.
- **Sub quote submission** (`/bid/[token]`): view the RFQ, submit a quote.
- **Compliance upload** (`/compliance/[token]`): upload COI / license / W-9.
- **Architect / Designer RFI answer** (`/rfi/[token]`) - **shipped**: read the
  question + attachments, submit the answer, no login.
- **Work sign-off** (`/sign/[token]`): sign completed work.
- **Open Qs**: should the client portal get a richer "owner's rep" view for
  commercial (see pay-app draws, certify)? Inspector link (schedule/confirm)?

---

## Cross-cutting decisions to lock before building
1. **Entry point per role**: field worker -> Today; supervisor -> Today
   (assigned); office/PM -> Projects or Approvals; admin -> Dashboard. Cheap,
   high impact. (This is a routing rule, not new screens.)
2. **Field Mode is its own shell** (no sidebar/tabs) chosen by role, not a
   responsive reflow of the office app. New layout + a handful of big screens.
3. **Reuse permissions, don't rebuild access**: personas change layout,
   defaults, and density - visibility is still permission-driven.
4. **"Today" is a real concept** we don't have yet: a per-user, cross-job feed
   of what's scheduled / assigned / waiting. Powers supervisor and worker homes.
5. **Which roles justify bespoke UI**: worker (yes, Field Mode), supervisor
   (Today home + slim tabs), everyone else responsive polish only.

## Suggested build order (once this is approved)
1. Field Worker "Field Mode" shell + Today/Tasks/Camera/Me. (Clearest, worst
   served today, forces the mode decision.)
2. "Today" feed (shared by worker + supervisor).
3. Site Manager home + slim tab set.
4. Role-based landing routing for everyone.
5. Responsive polish pass for admin/office/PM.
