"""《今年国庆，为什么没有阅兵？》的配乐、拟音与混音：python audio.py（在影片目录里运行，先跑 events.mjs 和 tts）
读 events.json（页面导出的镜头 / 配音 / 音效事件）和 voices/*.wav，写 out/mix.wav。
配乐按镜头分段：同一条时间线决定每一拍在哪个段落里、用哪些乐器。
两处安静：「中断 24 年」整段只剩低垫；全景拉远的头三拍全停，下一声是 2029 出现的钟音。"""
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
shot = {s['id']: s for s in SHOTS}

def section(t):
    cur = SHOTS[0]
    for s in SHOTS:
        if t >= s['t0'] - 1e-6: cur = s
    return cur['id'], t - cur['t0']

# ———————— 配乐 ————————
music, drums = Bus(DUR + 3), Bus(DUR + 3)
PROG = ['Dm9', 'Bbmaj7', 'Fadd9', 'C6']
REVEAL = shot['title']['t0'] + 2 * BEAT
PAD_V = {'hook': .2, 'age': .24, 'early': .26, 'rule': .24, 'gap': .13, 'resume': .28, 'other': .27, 'next': .24, 'title': .4, 'outro': .24, 'ask': .22}
nbeats = int(DUR / BEAT) + 1
for b in range(nbeats):
    t = b * BEAT; sec, lt = section(t); lb = round(lt / BEAT)
    bar, beat = divmod(b, 4)
    ch = PROG[bar % 4]
    if sec == 'gap': ch = 'Dm9'
    if sec == 'title': ch = 'Bbmaj9' if t < REVEAL + 6 * BEAT else 'Fadd9'
    if sec == 'outro': ch = 'Fadd9' if lb < 6 else 'Dm9'
    if sec == 'ask': ch = ['Bbmaj7', 'C6', 'Dm9', 'Fadd9'][min(3, lb // 4)]
    notes = S.chord(ch, 3); root = notes[0] % 12
    hush = sec == 'next' and lb < 3                     # 全景拉远：三拍全停
    building = sec == 'title' and t < REVEAL
    bnote = 38 + (root - 2) % 12                        # D2..C#3

    if (beat == 0 or lb == 0) and not hush and not building:
        length = min(4 - beat, 4) * BEAT
        if sec == 'gap':
            music.add(S.pad([n for n in notes if n >= 48][:3], length, v=PAD_V[sec], bright=900), t)
        else:
            music.add(S.pad([n for n in notes if n >= 48] + [notes[1] + 12], length, v=PAD_V[sec], bright=2600 if sec == 'title' else 1600), t)

    if sec in ('age', 'early', 'resume', 'other') or (sec == 'rule' and beat == 0):
        for h in (0, .5):
            if sec in ('age', 'rule') and h: continue
            music.add(S.bass(bnote, .26 if sec == 'resume' else .4, v=.5), t + h * BEAT)
    if sec == 'title' and abs(t - REVEAL) < 1e-6:
        music.add(S.bass(34, 3.5, v=.7, drive=.1), t)

    if sec == 'early' and beat in (0, 2): drums.add(S.kick(.5), t)
    if sec in ('resume', 'other'):
        drums.add(S.kick(.75 if sec == 'resume' else .5), t)
        if sec == 'resume' and beat in (1, 3): drums.add(S.clap(.32), t, pan=.1)
    if sec in ('early', 'resume', 'other'):
        for k, h in enumerate((0, .5)):
            drums.add(S.hat((.15 if h == 0 else .09) * (.7 if sec == 'other' else 1), open_=(sec == 'resume' and h == .5 and beat == 3)), t + h * BEAT, pan=.35 if k else -.2)

    if sec in ('rule', 'resume', 'ask') or (sec == 'next' and not hush and t < shot['next']['t1'] - 2.0):
        arp = [n + (12 if sec in ('rule', 'ask') else 24) for n in notes[:4]]
        step = 2 if sec not in ('rule', 'ask') else 1
        if sec in ('rule', 'ask') and beat % 2: continue
        for k in range(step):
            m = arp[(b * step + k) % len(arp)]
            music.add(S.pluck(m, .4, v=.12 if sec in ('rule', 'ask') else .2, bright=3800), t + k * BEAT / step, pan=-.35 + .7 * ((b * 2 + k) % 4) / 3)

# 片名揭示后的钟琴动机：四个音，对应「逢十大庆」四个字依次升起
for k, m in enumerate([74, 77, 81, 79]):
    music.add(S.bell(m, 1.5, v=.2), REVEAL + .05 + k * .38, pan=-.3 + k * .2)
for k, m in enumerate([81, 77, 74]):
    music.add(S.bell(m, 1.6, v=.15), shot['outro']['t0'] + 1.3 + k * 1.1, pan=.2 - k * .2)

drums_x = sosfilt(butter(2, 55, 'high', fs=48000, output='sos'), np.asarray(drums), axis=0)
music_x = np.asarray(music) + drums_x * .9

# ———————— 拟音 ————————
fx = Bus(DUR + 3)
for e in EV:
    if e['type'] != 'sfx': continue
    kw = {k: e[k] for k in ('d', 'f', 'lo', 'hi') if k in e}
    low = .6 if e['name'] in ('boom', 'thump') else 1
    fx.add(sfx.make(e['name'], **kw), e['t'], gain=e.get('gain', 1) * .7 * low, pan=e.get('pan', 0))
room = Bus(DUR + 3); room.add(sfx.room(DUR + 1, v=.035), 0)

# ———————— 配音 ————————
vo = Bus(DUR + 3); spans = []
for e in EV:
    if e['type'] != 'voice': continue
    p = os.path.join(HERE, 'voices', e['id'] + '.wav')
    if not os.path.exists(p): print('missing voice', p); continue
    y = load_wav(p); vo.add(y, e['t']); spans.append((e['t'], e['t'] + len(y) / 48000))
vox = compress(np.asarray(vo), thresh_db=-22, ratio=3.5, attack=.004, release=.15, makeup_db=4)

# ———————— 平衡：配音比音乐高约 10 dB（按配音区间内的 RMS） ————————
n = len(vox); music_x = music_x[:n]
duck = duck_curve(spans, DUR + 3, depth_db=-7)[:n]
music_d = music_x * duck
if spans:
    idx = np.concatenate([np.arange(int(a * 48000), min(n, int(b * 48000))) for a, b in spans])
    v_r, m_r = rms(vox[idx]), rms(music_d[idx])
    g = 10 ** ((db(v_r) - 10 - db(m_r)) / 20) if m_r > 0 else 1
    print(f'voice {db(v_r):.1f} dB, music {db(m_r):.1f} dB under voice → music gain {db(g):+.1f} dB')
    music_d *= g
master = music_d + np.asarray(fx)[:n] + np.asarray(room)[:n] + vox
master = sosfilt(butter(2, 38, 'high', fs=48000, output='sos'), master, axis=0).astype(np.float32)
master = master[:int((DUR + .6) * 48000)]
tail = int(.6 * 48000); master[-tail:] *= np.linspace(1, 0, tail)[:, None]
master = limit(master * (10 ** (-3 / 20) / max(1e-9, np.abs(master).max())), ceiling_db=-1.5)
print('bands', band_report(master))
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
write(os.path.join(HERE, 'out', 'mix.wav'), master)
