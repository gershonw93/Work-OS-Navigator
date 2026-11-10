#!/usr/bin/env bash
# One command, fully local: fake-data database -> app -> voice -> check -> record -> MP4.
#
#   walkthrough/run.sh            everything (re-renders only narration lines that changed)
#   walkthrough/run.sh --reseed   also wipe and rebuild the local database first
#
# Nothing here talks to a hosted service. The database is a Docker Supabase on
# 127.0.0.1, the app runs with no email / QuickBooks / Stripe keys, the browser
# aborts every request that is not to localhost, and seeding refuses any URL
# that is not local.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
DB=postgresql://postgres:postgres@127.0.0.1:54322/postgres
VENV="$HERE/.cache/venv"
step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

# ── 1. Tools ────────────────────────────────────────────────────────────────
step "tools"
if [ ! -x "$VENV/bin/python" ]; then
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q kokoro-onnx soundfile faster-whisper numpy
fi
mkdir -p "$HERE/.cache/models"
for f in kokoro-v1.0.onnx voices-v1.0.bin; do
  [ -s "$HERE/.cache/models/$f" ] || curl -sSL -o "$HERE/.cache/models/$f" \
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/$f"
done
# Whisper small.en; Hugging Face must be reachable the first time only.
HF_HUB_DISABLE_XET=1 "$VENV/bin/python" -c "from faster_whisper import WhisperModel; WhisperModel('small.en', device='cpu', compute_type='int8', download_root='$HERE/.cache/models/whisper')"
[ -d "$REPO/node_modules" ] || (cd "$REPO" && npm ci)
PW_PATH="$(npm root -g)"

# ── 2. Local database with fake data ────────────────────────────────────────
step "local database"
docker info >/dev/null 2>&1 || {
  # Docker's daemon needs the session proxy to pull images (see README).
  sudo env HTTPS_PROXY="${HTTPS_PROXY:-}" HTTP_PROXY="${HTTPS_PROXY:-}" NO_PROXY=localhost,127.0.0.1 dockerd >/tmp/dockerd.log 2>&1 &
  until docker info >/dev/null 2>&1; do sleep 1; done
}
cd "$HERE/local-db"
SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io npx -y supabase@2 start >/dev/null
seeded=$(psql "$DB" -Atc "select count(*) from public.projects where name = 'Maple Street Residences'" 2>/dev/null || echo 0)
if [ "${1:-}" = "--reseed" ] || [ "$seeded" = "0" ]; then
  npx -y supabase@2 db reset >/dev/null
  cd "$REPO"
  for f in supabase/migrations/00[1-7]_*.sql; do psql "$DB" -q -f "$f" >/dev/null 2>&1; done
  # The documented fresh-install path, then every numbered file again for
  # anything the combined file omits. Some legacy data backfills fail on an
  # empty database by design; they have no data to fix.
  psql "$DB" -q -f supabase/migrations/_combined_008-163.sql >/dev/null 2>&1 || true
  for f in $(ls supabase/migrations/[0-9]*.sql | sort -V); do psql "$DB" -q -f "$f" >/dev/null 2>&1 || true; done
  psql "$DB" -q -v ON_ERROR_STOP=1 -f "$HERE/local-db/drift.sql" >/dev/null
  psql "$DB" -q -v ON_ERROR_STOP=1 -f "$HERE/local-db/policies.sql" >/dev/null
  npx esbuild "$HERE/scripts/seed-local.ts" --bundle --platform=node --format=cjs --outfile="$HERE/.cache/seed.cjs" --log-level=warning
  (set -a; . "$HERE/.env.walkthrough"; set +a; node "$HERE/.cache/seed.cjs" >/dev/null)
fi
psql "$DB" -q -v ON_ERROR_STOP=1 -f "$HERE/local-db/demo-extras.sql" >/dev/null
cd "$REPO"

# ── 3. App (production build: dev-server compiles would show in the video) ──
step "app"
if ! curl -s -o /dev/null http://localhost:3000/login; then
  (set -a; . "$HERE/.env.walkthrough"; set +a; npx next build >/tmp/walkthrough-build.log 2>&1)
  (set -a; . "$HERE/.env.walkthrough"; set +a; nohup npx next start -p 3000 >/tmp/walkthrough-next.log 2>&1 &)
  until curl -s -o /dev/null http://localhost:3000/login; do sleep 1; done
fi

# ── 4. Voice, then check it ─────────────────────────────────────────────────
step "narration (Kokoro, af_heart)"
"$VENV/bin/python" "$HERE/scripts/tts.py"
step "transcription check (Whisper small.en)"
"$VENV/bin/python" "$HERE/scripts/verify.py" || {
  echo "Some lines did not transcribe as written - add a \"say\" spelling in narration.json and re-run."; exit 1; }

# ── 5. Record, 6. Assemble ──────────────────────────────────────────────────
step "record (Playwright, 1920x1080)"
NODE_PATH="$PW_PATH" node "$HERE/scripts/record.cjs"
step "assemble (ffmpeg)"
"$VENV/bin/python" "$HERE/scripts/assemble.py"
echo
echo "Done: $HERE/out/walkthrough.mp4  (+ walkthrough.vtt, contact-sheet.jpg)"
