"""Narration -> one WAV per line with Kokoro-82M (ONNX), fully local.

Each line is rendered from `say` when present (a phonetic spelling for
Kokoro), otherwise from `text` (which is also what the captions print). A line
is only re-rendered when its spoken text or the voice changes: the hash of both
is stored beside the WAV, so editing one line re-renders one line.
"""
import hashlib, json, sys
from pathlib import Path

import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / '.cache' / 'models'
OUT = ROOT / 'out' / 'audio'
VOICE, SPEED, LANG = 'am_liam', 1.0, 'en-us'


def spoken(line):
    return line.get('say') or line['text']


def key(line):
    return hashlib.sha256(f'{VOICE}|{SPEED}|{spoken(line)}'.encode()).hexdigest()[:16]


def main():
    lines = json.loads((ROOT / 'narration.json').read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    kokoro = None
    durations = {}
    for line in lines:
        wav, stamp = OUT / f"{line['id']}.wav", OUT / f"{line['id']}.key"
        if not (wav.exists() and stamp.exists() and stamp.read_text() == key(line)):
            kokoro = kokoro or Kokoro(str(MODELS / 'kokoro-v1.0.onnx'), str(MODELS / 'voices-v1.0.bin'))
            samples, rate = kokoro.create(spoken(line), voice=VOICE, speed=SPEED, lang=LANG)
            sf.write(wav, samples, rate)
            stamp.write_text(key(line))
            print(f"  rendered {line['id']}")
        info = sf.info(wav)
        durations[line['id']] = round(info.frames / info.samplerate, 3)
    # Stale WAVs from deleted/renamed lines would otherwise linger forever.
    ids = {l['id'] for l in lines}
    for f in OUT.glob('*.wav'):
        if f.stem not in ids:
            f.unlink(); f.with_suffix('.key').unlink(missing_ok=True)
    (ROOT / 'out' / 'durations.json').write_text(json.dumps(durations, indent=2))
    print(f'  {len(durations)} lines, {sum(durations.values()):.1f}s of narration')


if __name__ == '__main__':
    sys.exit(main())
