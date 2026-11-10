"""Frames + narration -> walkthrough.mp4 (H.264 + AAC), captions, contact sheet.

* Video: the screencast frames, each held until the next one arrived (the
  ffconcat `duration`), resampled to a constant 30 fps.
* Audio: every line's WAV delayed to its step's start (`adelay`), mixed, then
  two-pass `loudnorm` to -16 LUFS / -1.5 dBTP.
* Captions: walkthrough.vtt and .srt from the same text and timings, and
  burned into the MP4 as well (a sidecar file is easy to lose when a video is
  forwarded).
* Contact sheet: one still from the middle of each line, captioned with its id.
"""
import json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'out'
LEAD = 0.4  # seconds of picture kept before the first line starts
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, **kw)


def ts(t, sep='.'):
    h, r = divmod(max(t, 0), 3600); m, s = divmod(r, 60)
    return f'{int(h):02d}:{int(m):02d}:{s:06.3f}'.replace('.', sep)


def main():
    tl = json.loads((OUT / 'timeline.json').read_text())
    frames, steps = tl['frames'], tl['steps']
    t0 = steps[0]['start'] - LEAD                      # video time zero
    frames = [f for f in frames if f['t'] >= t0 - 5]   # drop the warm-up
    # The last frame at or before t0 is the picture on screen at t0.
    first = max([i for i, f in enumerate(frames) if f['t'] <= t0] or [0])
    frames = frames[first:]
    end = tl['end'] - t0

    # ── Video track.
    lines = ['ffconcat version 1.0']
    for i, f in enumerate(frames):
        start = max(f['t'] - t0, 0)
        nxt = (frames[i + 1]['t'] - t0) if i + 1 < len(frames) else end
        lines += [f"file 'frames/{f['file']}'", f'duration {max(nxt - start, 0.001):.4f}']
    lines.append(f"file 'frames/{frames[-1]['file']}'")  # concat demuxer ignores the last duration
    (OUT / 'frames.ffconcat').write_text('\n'.join(lines) + '\n')

    # ── Captions (VTT sidecar, SRT for burning and for players that want it).
    cues = [(s['start'] - t0, s['start'] - t0 + s['duration'], s['text']) for s in steps]
    vtt = ['WEBVTT', ''] + [f'{ts(a)} --> {ts(b)}\n{t}\n' for a, b, t in cues]
    (OUT / 'walkthrough.vtt').write_text('\n'.join(vtt))
    srt = [f'{i}\n{ts(a, ",")} --> {ts(b, ",")}\n{t}\n' for i, (a, b, t) in enumerate(cues, 1)]
    (OUT / 'walkthrough.srt').write_text('\n'.join(srt))

    # ── Narration mix, laid at each step's start.
    inputs, chains = [], []
    for i, s in enumerate(steps):
        inputs += ['-i', str(OUT / 'audio' / f"{s['id']}.wav")]
        ms = int(round((s['start'] - t0) * 1000))
        chains.append(f'[{i}:a]aresample=48000,aformat=channel_layouts=mono,adelay={ms}:all=1[a{i}]')
    mix = ';'.join(chains) + ';' + ''.join(f'[a{i}]' for i in range(len(steps))) + \
        f'amix=inputs={len(steps)}:normalize=0,apad=whole_dur={end:.3f}[mix]'
    raw = OUT / 'narration_raw.wav'
    run(['ffmpeg', '-y', '-v', 'error', *inputs, '-filter_complex', mix, '-map', '[mix]', '-t', f'{end:.3f}', str(raw)])

    # Two-pass loudnorm: measure, then apply with the measured values.
    target = 'I=-16:TP=-1.5:LRA=11'
    m = run(['ffmpeg', '-v', 'info', '-i', str(raw), '-af', f'loudnorm={target}:print_format=json', '-f', 'null', '-'],
            capture_output=True, text=True).stderr
    meas = json.loads(m[m.rindex('{'):m.rindex('}') + 1])
    second = (f"loudnorm={target}:measured_I={meas['input_i']}:measured_TP={meas['input_tp']}"
              f":measured_LRA={meas['input_lra']}:measured_thresh={meas['input_thresh']}"
              f":offset={meas['target_offset']}:linear=true")

    # ── Final encode.
    style = ('FontName=DejaVu Sans,FontSize=11,PrimaryColour=&H00FFFFFF,BackColour=&H99000000,'
             'BorderStyle=4,Outline=0,Shadow=0,MarginV=24,Alignment=2')
    vf = f"fps=30,format=yuv420p,subtitles={OUT / 'walkthrough.srt'}:force_style='{style}'"
    run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', str(OUT / 'frames.ffconcat'),
         '-i', str(raw), '-vf', vf, '-af', second + ',aresample=48000',
         '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
         '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', f'{end:.3f}', str(OUT / 'walkthrough.mp4')])

    # Report the loudness actually delivered.
    chk = run(['ffmpeg', '-v', 'info', '-i', str(OUT / 'walkthrough.mp4'), '-af', 'ebur128', '-f', 'null', '-'],
              capture_output=True, text=True).stderr
    integrated = [l for l in chk.splitlines() if l.strip().startswith('I:')][-1].strip()
    print(f'  walkthrough.mp4: {end:.1f}s, integrated loudness {integrated}')

    # ── Contact sheet: a still from the middle of each line.
    stills = OUT / 'stills'; stills.mkdir(exist_ok=True)
    for f in stills.glob('*.jpg'): f.unlink()
    for i, (a, b, _) in enumerate(cues):
        mid = a + min((b - a) * 0.7, b - a - 0.2)
        run(['ffmpeg', '-y', '-v', 'error', '-ss', f'{mid:.2f}', '-i', str(OUT / 'walkthrough.mp4'), '-frames:v', '1',
             '-vf', f"scale=640:-2,drawbox=y=0:w=iw:h=30:color=black@0.7:t=fill,"
                    f"drawtext=fontfile={FONT}:text='{steps[i]['id']}':x=10:y=6:fontsize=17:fontcolor=white",
             str(stills / f'{i:02d}.jpg')])
    cols = 3
    rows = -(-len(cues) // cols)
    run(['ffmpeg', '-y', '-v', 'error', '-framerate', '1', '-i', str(stills / '%02d.jpg'),
         '-vf', f'tile={cols}x{rows}:padding=8:margin=8:color=white', '-frames:v', '1', str(OUT / 'contact-sheet.jpg')])
    print('  contact-sheet.jpg')


if __name__ == '__main__':
    sys.exit(main())
