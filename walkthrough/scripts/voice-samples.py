"""Render one narration line in every English Kokoro voice, to choose a voice.

    .cache/venv/bin/python scripts/voice-samples.py [line-id]

Writes out/voices/<voice>.mp3 (each loudness-matched to -16 LUFS so the
comparison is the voice, not the volume) and out/voices/all-voices.mp3, where
each sample is introduced by its own voice saying its name. Kokoro's other
voices (es/fr/hi/it/ja/pt/zh) are made for those languages and are skipped.
"""
import json, subprocess, sys, tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'out' / 'voices'
GROUPS = {'af': 'American female', 'am': 'American male', 'bf': 'British female', 'bm': 'British male'}


def main():
    lines = json.loads((ROOT / 'narration.json').read_text())
    want = sys.argv[1] if len(sys.argv) > 1 else lines[0]['id']
    line = next(l for l in lines if l['id'] == want)
    text = line.get('say') or line['text']
    k = Kokoro(str(ROOT / '.cache/models/kokoro-v1.0.onnx'), str(ROOT / '.cache/models/voices-v1.0.bin'))
    voices = sorted(v for v in k.get_voices() if v[:2] in GROUPS)
    OUT.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp())
    parts = []
    for v in voices:
        name = v.split('_', 1)[1].capitalize()
        lang = 'en-gb' if v.startswith('b') else 'en-us'
        intro, rate = k.create(f'{name}. {GROUPS[v[:2]]}.', voice=v, speed=1.0, lang=lang)
        body, _ = k.create(text, voice=v, speed=1.0, lang=lang)
        gap = lambda s: np.zeros(int(rate * s), dtype=np.float32)
        sf.write(tmp / f'{v}.wav', body, rate)
        sf.write(tmp / f'{v}-full.wav', np.concatenate([intro, gap(0.35), body, gap(1.0)]), rate)
        norm = 'loudnorm=I=-16:TP=-1.5:LRA=11'
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(tmp / f'{v}.wav'), '-af', norm, '-ar', '48000',
                        '-b:a', '160k', str(OUT / f'{v}.mp3')], check=True)
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(tmp / f'{v}-full.wav'), '-af', norm, '-ar', '48000',
                        str(tmp / f'{v}-norm.wav')], check=True)
        parts.append(tmp / f'{v}-norm.wav')
        print(f'  {v}')
    (tmp / 'list.txt').write_text(''.join(f"file '{p}'\n" for p in parts))
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', str(tmp / 'list.txt'),
                    '-b:a', '160k', str(OUT / 'all-voices.mp3')], check=True)
    print(f'  {len(voices)} voices -> {OUT / "all-voices.mp3"}')


if __name__ == '__main__':
    sys.exit(main())
