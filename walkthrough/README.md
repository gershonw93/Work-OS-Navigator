# Product walkthrough video

A narrated, captioned MP4 of SyteNav, built entirely on this machine against
fake data. One command:

```bash
walkthrough/run.sh            # re-renders only narration lines that changed
walkthrough/run.sh --reseed   # also rebuilds the local database from scratch
```

Output in `walkthrough/out/`: `walkthrough.mp4` (1920x1080, H.264 + AAC,
-16 LUFS, captions burned in), `walkthrough.vtt` / `.srt`, `contact-sheet.jpg`
(one still per line), `transcripts.json` (what Whisper heard).

## Editing the script

`narration.json` is the script: one `{ "id", "text" }` per on-screen step.
`text` is what is spoken and what the captions print. If Kokoro misreads a
word, add `"say"` with a phonetic spelling - it is spoken instead, the caption
keeps `text`. Changing a line re-renders that line's WAV only (its hash is
stored beside it), then the recording and assembly run again so timings stay
right.

The id after the number names the recorded step in `scripts/record.cjs`
(`STEPS`). A step has `go` (navigation, before the line starts), `show` (cursor
and highlights while it is spoken) and optionally `after`. A new line needs a
new step.

## Pipeline

| Stage | File | What it does |
| --- | --- | --- |
| Data | `local-db/` | Docker Supabase on 127.0.0.1. Migrations, then `drift.sql` + `policies.sql` (columns and RLS policies production has that the migration history never created - read from production's catalog, no rows), the repo's own demo seed (`lib/seed-demo.ts`, refuses a non-local URL), then `demo-extras.sql` (schedule links, an upcoming inspection) |
| Voice | `scripts/tts.py` | Kokoro-82M ONNX, voice `af_heart`, one WAV per line |
| Check | `scripts/verify.py` | faster-whisper `small.en` transcribes each WAV; a line under 90% word match fails the run and prints both versions |
| Record | `scripts/record.cjs` | Playwright Chromium at 1920x1080, CDP screencast frames (JPEG q90), injected cursor + highlight box, waits each line's audio length, writes `out/timeline.json` |
| Assemble | `scripts/assemble.py` | Frames to 30 fps, each WAV delayed to its step's start, two-pass `loudnorm` to -16 LUFS, captions burned + sidecar, contact sheet |

## What it will never do

- **Touch a hosted service.** The app runs with no email, QuickBooks, Stripe,
  maps or model keys (`.env.walkthrough`); the browser aborts every request that
  is not to localhost (seeded photos point at a public image site, so they are
  answered from `assets/`); the recorder refuses a non-local base URL.
- **Press a control that sends or commits.** `click()` refuses any control whose
  text matches send / email / approve / pay / connect / delete / void /
  regenerate / notify. The cascade step stops at the review and presses
  "Cancel - move nothing", then cancels the edit dialog; the portal step closes
  the dialog with its X, never "Send link".

## Environment notes

- Docker needs the session proxy to pull images, and Supabase's default
  registry (ECR) is blocked here, so `run.sh` uses Docker Hub
  (`SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io`).
- The Whisper model downloads from Hugging Face on first run (allowed hosts:
  `huggingface.co`, `cas-server.xethub.hf.co`, `us.aws.cdn.hf.co` and the
  `*.hf.co` CDNs). After that everything is offline.
- Playwright is the preinstalled global one (`NODE_PATH=$(npm root -g)`).
