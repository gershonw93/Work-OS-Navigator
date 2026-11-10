"""Transcribe every narration WAV with a local Whisper and flag mismatches.

Compares words after folding case and punctuation, and after mapping the few
words Whisper spells differently from the script (the product name, numbers).
A line passes at >= THRESHOLD word similarity; anything below is printed with
both versions so the fix (a `say` spelling in narration.json) is obvious.
Exit code is non-zero when any line is flagged.
"""
import difflib, json, os, re, subprocess, sys
from pathlib import Path

os.environ.setdefault('HF_HUB_OFFLINE', '1')
import numpy as np
from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parents[1]
THRESHOLD = 0.9
# Equivalent spellings: Whisper's choice -> the script's.
SAME = {'sitenav': 'sytenav', 'site nav': 'sytenav', 'sight nav': 'sytenav', 'cyte nav': 'sytenav',
        'scitenav': 'sytenav', 'sightnav': 'sytenav'}


def words(s):
    s = s.lower().replace('’', "'")
    for a, b in SAME.items():
        s = s.replace(a, b)
    return re.findall(r"[a-z0-9']+", s)


def pcm16k(path):
    # Decoded by ffmpeg rather than PyAV: the PyAV build pip resolves does not
    # accept the arguments faster-whisper passes it.
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.float32)


def main():
    lines = json.loads((ROOT / 'narration.json').read_text())
    model = WhisperModel('small.en', device='cpu', compute_type='int8',
                         download_root=str(ROOT / '.cache' / 'models' / 'whisper'))
    report, flagged = [], 0
    for line in lines:
        segs, _ = model.transcribe(pcm16k(ROOT / 'out' / 'audio' / f"{line['id']}.wav"), beam_size=5, language='en')
        heard = ' '.join(s.text.strip() for s in segs)
        want, got = words(line['text']), words(heard)
        ratio = difflib.SequenceMatcher(None, want, got).ratio()
        # "count down" and "countdown" are the same sound; Whisper's spacing of
        # a compound is not a misreading, so an exact match without spaces passes.
        if ''.join(want) == ''.join(got):
            ratio = 1.0
        ok = ratio >= THRESHOLD
        flagged += not ok
        report.append({'id': line['id'], 'ok': ok, 'score': round(ratio, 3), 'text': line['text'], 'heard': heard})
        print(f"  {'ok  ' if ok else 'FLAG'} {ratio:.2f} {line['id']}" + ('' if ok else f"\n       script: {line['text']}\n       heard:  {heard}"))
    (ROOT / 'out' / 'transcripts.json').write_text(json.dumps(report, indent=2))
    print(f'  {flagged} line(s) flagged')
    return 1 if flagged else 0


if __name__ == '__main__':
    sys.exit(main())
