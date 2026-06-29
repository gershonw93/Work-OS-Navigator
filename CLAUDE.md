# SyteNav — working agreement

## Ship workflow (IMPORTANT)
When work is done: **build → commit → push → merge to `main` automatically.**
Do NOT ask the user to merge or deploy. Vercel auto-deploys `main`.
- Work on branch `claude/admiring-bohr-DyFVR`, then open/merge a PR into `main` via the GitHub MCP tools.
- The only thing the user must do manually is run new Supabase SQL migrations
  (no DB access from here). Mention those once, briefly — don't nag about deploy.

## Migrations
- Combined, idempotent SQL lives at `supabase/migrations/_combined_008-020.sql`
  (keep the suffix current as new migrations are added). User pastes it into the
  Supabase SQL editor.

## Stack notes
- Next.js 14 App Router, Supabase (Postgres + Storage), Tailwind.
- Theme: SyteNav "Field" — semantic CSS-var tokens (surface/panel/ink/accent…),
  light + dark. Use token classes (bg-panel, text-ink, text-muted-fg, border-line,
  bg-accent/text-accent-fg, success/warn/danger/info), NOT raw slate/white/orange.
- Storage buckets: `daily-log-photos`, `submittals`.
- Always run `npx tsc --noEmit` and `npx next build` before merging.
