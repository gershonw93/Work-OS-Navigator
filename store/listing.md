# SyteNav - store listing copy

## App name
SyteNav

## Subtitle / short (Apple 30 chars / Play 30 chars)
Run every job in one place

## Promotional text (Apple, 170 chars)
From the quote to the final invoice, SyteNav puts your whole job in one place. AI reads your documents, and the office and the field finally share one screen.

## Full description
SyteNav is construction management built for the field, for general contractors, subcontractors, and remodelers.

Snap a photo or upload a PDF and AI turns quotes, invoices, and permits into structured line items, quantities, and payment terms. No more retyping.

Run the whole job in one app:
• Quotes that become jobs, one tap to convert an approved quote to an active project
• Budgets, client payments, escrow balance, and your contractor fee
• Invoices and approvals, with what's billed, paid, and outstanding
• Scheduling and daily logs with photos, weather, and crew
• Tasks and progress tracked by line item
• Time clock with location, approvals, and payroll export
• Permits, inspections, and compliance with expiry reminders
• Team and role management for office, PMs, and crew
• Master calendar and money rolled up across every project

Built for the jobsite and the office. Works on your phone, tablet, and computer.

Start free. No credit card needed.

## Keywords (Apple, 100 chars, comma-separated)
construction,contractor,subcontractor,invoices,quotes,estimate,punch list,daily log,jobsite,builder

## Categories
Primary: Business • Secondary: Productivity

## Support & policy URLs
- Support: https://sytenav.com/contact
- Marketing: https://sytenav.com
- Privacy: https://sytenav.com/privacy
- Terms: https://sytenav.com/terms

## App privacy (data collected)
- Contact info: name, email (account/auth via Supabase)
- User content: project data, documents, photos you upload
- Identifiers + usage data: for security and to operate the Service
- Not used for tracking across other apps; not sold.

## Demo account for App Review (REQUIRED)
Apple rejects without working credentials, every time - and because SyteNav has
no sign-up inside the iOS build, a reviewer who is not given a login has no way
in at all.

- **Email:** `demo@sytenav.com`
- **Password:** `SyteNavDemo2026!` (or whatever `DEMO_PASSWORD` was set to)

It is an invented general contractor - 13 jobs across Brooklyn and New Jersey,
made-up companies, `555-01xx` numbers. No real customer's data is ever in it.
Seeded by `/api/dev/seed-demo?secret=...` - see `scripts/README.md`. Re-run it
before submitting so the dates are fresh; everything is relative, so a seed from
last month still reads as current work.

**Check before you submit:** sign in on your own phone and open Money, the bell,
and a project. If any of those are empty the seed did not finish.

## App Review notes (paste into App Store Connect)
> SyteNav is construction management software for general contractors. The
> account below is a demo company with sample projects - no real customer data.
>
> Sign in at the first screen with the credentials provided. There is no sign-up
> inside the app: accounts are created and managed on our website, and the app
> is for existing customers signing in. Nothing is sold inside the app.
>
> Suggested tour: the dashboard shows money across all jobs; open any project
> for its budget, bills from subcontractors, invoices to the client, schedule
> and daily logs. The bell (top right) shows notifications; the app also sends
> push notifications for approvals and invoice status.
>
> Camera access is used for jobsite photos in daily logs and for scanning
> invoices. Location is used to record where a worker clocked in and out. Both
> are asked for only at the point they are used, and the app works without them.

## Screenshots to capture (from the live app)
1. Dashboard (master overview)
2. Projects list
3. Quote tab with AI-scanned line items
4. Payments & escrow
5. Daily log with photos
6. Master calendar
**Capture from the installed app on a real device, not a resized browser.** The
shell is a webview of the same site, so the DOM matches - but safe areas resolve
to zero on a desktop, and the status bar and home indicator belong in the shot.
No Mac here means no Simulator, so these come off your own iPhone and iPad once
the TestFlight build is on them.

Required sizes: **6.7" iPhone** and **13" iPad** (the target is universal, so
Apple asks for both), plus Android phone/tablet when that store comes.
