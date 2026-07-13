# Scripts

## seed-demo.ts - demo account

Creates the login **demo@sytenav.com** and fills 12 projects with data on every
tab (plans/files, budget, subcontracts, invoices, client payments, schedule,
tasks, daily logs + photos, time clock, RFIs, change orders, permits,
inspections, submittals, compliance, materials, equipment, RFQs/quotes, team,
and the activity feed).

### Option A - no terminal (browser)

Easiest if you don't have a terminal. This runs on the deployed app, which
already has the Supabase keys.

1. In Vercel, add an env var **`DEMO_SEED_SECRET`** with any random value, and
   redeploy.
2. Visit this URL in your browser (swap in your secret):

   ```
   https://app.sytenav.com/api/dev/seed-demo?secret=YOUR_SECRET
   ```

   It returns JSON when done (`"ok": true`) with the login. Optionally add
   `&password=yourpassword`.
3. When you're finished demoing, remove `DEMO_SEED_SECRET` so the route turns
   off (it 404s with no secret set).

> This is NOT SQL - do not paste it into the Supabase SQL editor. It's a web
> URL you open in a browser (or a terminal command below), nothing else.

### Option B - terminal

From the repo root, with your project's Supabase URL and **service-role** key
(Supabase dashboard → Project Settings → API):

```bash
NEXT_PUBLIC_SUPABASE_URL="https://YOURPROJECT.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="eyJ...service-role..." \
npx tsx scripts/seed-demo.ts
```

Optionally set the password (default `SyteNavDemo2026!`):

```bash
DEMO_PASSWORD="your-password" ... npx tsx scripts/seed-demo.ts
```

### Notes

- Run against a database that has all migrations applied (through `050`).
- Re-running wipes the **demo company's** projects/vendors and reseeds; the
  login is kept and its password reset. It only touches the demo company -
  never any other company's data.
- File/photo links point at public placeholder images and a sample PDF, so the
  rows are populated even though nothing was uploaded to Storage.
- The service-role key bypasses RLS; keep it out of the browser and out of git.
