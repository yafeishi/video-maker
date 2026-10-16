"""《小狗打工记》配乐：全程轻快、没有静音段。python audio.py → out/mix.wav"""
import json, os, sys
import numpy as np
from scipy.signal import butter, sosfilt

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get('WORKBENCH_ROOT') or os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, ROOT)
from core.audio import sfx, synth as S
from core.audio.mix import Bus, compress, limit, band_report, write

BPM = 112
BEAT = 60 / BPM
data = json.load(open(os.path.join(HERE, 'events.json'), encoding='utf-8'))
DUR, EV = data['dur'], data['ev']
SHOTS = data['shots']

def section(t):
    cur = SHOTS[0]
    for s in SHOTS:
        if t >= s['t0'] - 1e-6:
            cur = s
    return cur['id']

music, drums = Bus(DUR + 2), Bus(DUR + 2)
PROG = {
    'hook': ['C', 'G'],
    'title': ['F', 'C'],
    'cafe': ['C', 'Am', 'F', 'G'],
    'code': ['Am', 'F', 'C', 'G'],
    'deli': ['C', 'F', 'G', 'Am'],
    'home': ['F', 'C', 'Am', 'G'],
}
MELODY = {
    'C': [76, 79, 84, 79],
    'G': [79, 83, 86, 83],
    'Am': [76, 81, 84, 81],
    'F': [77, 81, 84, 81],
}

nbeats = int(np.ceil(DUR / BEAT)) + 1
for b in range(nbeats):
    t = b * BEAT
    if t >= DUR + 0.05:
        break
    sec = section(min(t, DUR - 1e-3))
    prog = PROG[sec]
    ch = prog[(b // 4) % len(prog)]
    notes = S.chord(ch if ch != 'C' else 'C', 4)
    if ch == 'C':
        notes = S.chord('C', 4)
    elif ch == 'G':
        notes = S.chord('G', 3)
    elif ch == 'Am':
        notes = S.chord('Am', 3)
    else:
        notes = S.chord('F', 3)
    root = notes[0] % 12
    if b % 4 == 0:
        music.add(S.pad([n for n in notes if n >= 48], BEAT * 4, v=0.22, bright=2200, a=0.03, r=0.25), t)
    music.add(S.bass(36 + root, 0.22 if b % 2 == 0 else 0.14, v=0.28, body=0.45), t)
    step = BEAT / 2
    for k in range(2):
        m = MELODY[ch][(b * 2 + k) % 4]
        music.add(S.pluck(m, 0.22, v=0.16, bright=4200), t + k * step, pan=-0.25 + 0.5 * ((b + k) % 2))
        if sec != 'home' or b % 2 == 0:
            drums.add(S.hat(0.12 if k else 0.18, open_=(k == 1 and b % 4 == 3)), t + k * step, pan=0.25)
    if b % 2 == 0:
        drums.add(S.kick(0.32 if sec != 'home' else 0.18), t)
    if b % 4 == 2 and sec in ('cafe', 'code', 'deli', 'title'):
        drums.add(S.clap(0.16), t, pan=0.1)
    if sec == 'home' and b % 4 == 0:
        music.add(S.bell(MELODY[ch][0], 0.8, v=0.12), t, pan=-0.2)

# 场景切换的一点铃，盖住云朵，也不让音乐断掉
for e in EV:
    if e.get('type') == 'shot' and e['t'] > 0.2:
        music.add(S.bell(88, 0.6, v=0.1), e['t'])

drums_x = sosfilt(butter(2, 70, 'high', fs=48000, output='sos'), np.asarray(drums), axis=0)
music_x = np.asarray(music) + drums_x * 0.85

fx = Bus(DUR + 2)
for e in EV:
    if e.get('type') != 'sfx':
        continue
    kw = {k: e[k] for k in ('d', 'f', 'lo', 'hi') if k in e}
    fx.add(sfx.make(e['name'], **kw), e['t'], gain=e.get('gain', 0.6) * 0.85, pan=e.get('pan', 0))

master = music_x * 0.9 + np.asarray(fx)
master = master[:int((DUR + 0.15) * 48000)]
master = sosfilt(butter(2, 35, 'high', fs=48000, output='sos'), master, axis=0)
master = compress(master, thresh_db=-14, ratio=2.2, makeup_db=1.5)
master = limit(master, ceiling_db=-1.5)
print(band_report(master))
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
write(os.path.join(HERE, 'out', 'mix.wav'), master)
