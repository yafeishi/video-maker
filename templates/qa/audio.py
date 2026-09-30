"""问答讲解模板的配乐、拟音与混音：python audio.py（在影片目录里运行，先跑 events.mjs 和 tts）
配乐按镜头类型（kind）分段，所以要点有几个都能用：
  question 只有和弦垫；answer 开头静到答案砸下（全片第一次安静），然后垫 + 贝斯；
  point 律动，越往后越满；recap 上扬后爆响 + 钟琴；cta 轻垫 + 稀疏拨弦，最后落在主和弦上。"""
import json, os, sys
import numpy as np
from scipy.signal import butter, sosfilt

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get('WORKBENCH_ROOT') or os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, ROOT)
from core.audio import sfx, synth as S
from core.audio.mix import Bus, load_wav, compress, limit, duck_curve, rms, db, band_report, write

BPM = 100; BEAT = 60 / BPM
data = json.load(open(os.path.join(HERE, 'events.json'), encoding='utf-8'))
DUR, EV = data['dur'], data['ev']
SHOTS = data['shots']
HITS = [e['t'] for e in EV if e['type'] == 'sfx' and e['name'] == 'thump']
POINTS = [s for s in SHOTS if s.get('kind') == 'point']

def section(t):
    cur = SHOTS[0]
    for s in SHOTS:
        if t >= s['t0'] - 1e-6: cur = s
    return cur, t - cur['t0']

music, drums = Bus(DUR + 3), Bus(DUR + 3)
PROG = ['Am9', 'Fmaj7', 'Cadd9', 'G6']
PAD_V = {'question': .2, 'answer': .24, 'point': .26, 'recap': .4, 'cta': .22}
for b in range(int(DUR / BEAT) + 1):
    t = b * BEAT; s, lt = section(t); kind = s.get('kind', 'point'); lb = round(lt / BEAT)
    bar, beat = divmod(b, 4)
    ch = PROG[bar % 4]
    reveal = s['t0'] + 2 * BEAT
    if kind == 'recap': ch = 'Fmaj9' if t < reveal + 6 * BEAT else 'Cadd9'
    if kind == 'cta': ch = ['Fmaj7', 'G6', 'Am9', 'Cadd9'][min(3, lb // 4)]
    notes = S.chord(ch, 3); root = notes[0] % 12
    hit = next((h for h in HITS if s['t0'] - 1e-6 <= h < s['t1']), None) if kind == 'answer' else None
    hush = kind == 'answer' and hit is not None and t < hit - 1e-6
    building = kind == 'recap' and t < reveal
    level = POINTS.index(s) / max(1, len(POINTS) - 1) if kind == 'point' else 0
    bnote = 33 + (root - 9) % 12

    if (beat == 0 or lb == 0) and not hush and not building:
        music.add(S.pad([n for n in notes if n >= 48] + [notes[1] + 12], (4 - beat) * BEAT, v=PAD_V.get(kind, .24), bright=2600 if kind == 'recap' else 1600), t)
    if (kind == 'answer' and not hush) or kind == 'point':
        for h in ((0, .5) if kind == 'point' else (0,)):
            music.add(S.bass(bnote, .3 if kind == 'point' else .45, v=.5), t + h * BEAT)
    if kind == 'recap' and abs(t - reveal) < 1e-6:
        music.add(S.bass(29, 3.5, v=.7, drive=.1), t)
    if kind == 'point':
        drums.add(S.kick(.55 + .25 * level), t)
        if level >= .5 and beat in (1, 3): drums.add(S.clap(.3), t, pan=.1)
        for k, h in enumerate((0, .5)):
            drums.add(S.hat(.14 if h == 0 else .08), t + h * BEAT, pan=.35 if k else -.2)
    if kind == 'point' and level > 0 or (kind == 'cta' and beat % 2 == 0):
        arp = [n + (12 if kind == 'cta' else 24) for n in notes[:4]]
        step = 1 if kind == 'cta' else 2
        for k in range(step):
            m = arp[(b * step + k) % len(arp)]
            music.add(S.pluck(m, .4, v=.12 if kind == 'cta' else .2, bright=3800), t + k * BEAT / step, pan=-.35 + .7 * ((b * 2 + k) % 4) / 3)

for s in SHOTS:
    h = next((h for h in HITS if s['t0'] - 1e-6 <= h < s['t1']), None)
    if s.get('kind') == 'answer' and h is not None: music.add(S.bass(33, 1.2, v=.8), h)
    if s.get('kind') == 'recap':
        for k, m in enumerate([69, 72, 76, 74, 79]):
            music.add(S.bell(m, 1.4, v=.18), s['t0'] + 2 * BEAT + .05 + k * .38, pan=-.3 + k * .15)

drums_x = sosfilt(butter(2, 55, 'high', fs=48000, output='sos'), np.asarray(drums), axis=0)
music_x = np.asarray(music) + drums_x * .9

fx = Bus(DUR + 3)
for e in EV:
    if e['type'] != 'sfx': continue
    kw = {k: e[k] for k in ('d', 'f', 'lo', 'hi') if k in e}
    low = .6 if e['name'] in ('boom', 'thump') else 1
    fx.add(sfx.make(e['name'], **kw), e['t'], gain=e.get('gain', 1) * .7 * low, pan=e.get('pan', 0))
room = Bus(DUR + 3); room.add(sfx.room(DUR + 1, v=.035), 0)

vo = Bus(DUR + 3); spans = []
for e in EV:
    if e['type'] != 'voice': continue
    p = os.path.join(HERE, 'voices', e['id'] + '.wav')
    if not os.path.exists(p): print('missing voice', p); continue
    y = load_wav(p); vo.add(y, e['t']); spans.append((e['t'], e['t'] + len(y) / 48000))
vox = compress(np.asarray(vo), thresh_db=-22, ratio=3.5, attack=.004, release=.15, makeup_db=4)

n = len(vox); music_x = music_x[:n]
music_d = music_x * duck_curve(spans, DUR + 3, depth_db=-7)[:n]
if spans:
    idx = np.concatenate([np.arange(int(a * 48000), min(n, int(b * 48000))) for a, b in spans])
    v_r, m_r = rms(vox[idx]), rms(music_d[idx])
    gain = 10 ** ((db(v_r) - 10 - db(m_r)) / 20) if m_r > 0 else 1
    print(f'voice {db(v_r):.1f} dB, music {db(m_r):.1f} dB under voice → music gain {db(gain):+.1f} dB')
    music_d *= gain
master = music_d + np.asarray(fx)[:n] + np.asarray(room)[:n] + vox
master = sosfilt(butter(2, 38, 'high', fs=48000, output='sos'), master, axis=0).astype(np.float32)
master = master[:int((DUR + .6) * 48000)]
tail = int(.6 * 48000); master[-tail:] *= np.linspace(1, 0, tail)[:, None]
master = limit(master * (10 ** (-3 / 20) / max(1e-9, np.abs(master).max())), ceiling_db=-1.5)
print('bands', band_report(master))
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
write(os.path.join(HERE, 'out', 'mix.wav'), master)
