"""《一帧一行》的配乐、拟音与混音：python audio.py（在影片目录里运行，先跑 events.mjs 和 tts）
读 events.json（页面导出的镜头 / 配音 / 音效事件）和 voices/*.wav，写 out/mix.wav。
配乐按镜头分段：同一条时间线决定每一拍在哪个段落里、用哪些乐器。"""
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
PROG = ['Am9', 'Fmaj7', 'Cadd9', 'G6']
REVEAL = shot['title']['t0'] + 4 * BEAT
nbeats = int(DUR / BEAT) + 1
for b in range(nbeats):
    t = b * BEAT; sec, lt = section(t); lb = round(lt / BEAT)
    bar, beat = divmod(b, 4)
    ch = PROG[bar % 4]
    if sec == 'title': ch = 'Fmaj9' if t < REVEAL + 8 * BEAT else 'Cadd9'
    if sec == 'outro': ch = 'Am9'
    notes = S.chord(ch, 3); root = notes[0] % 12
    breath = sec == 'fps' and lb < 2                     # 镜头 4 开头的两拍静默
    building = sec == 'title' and t < REVEAL            # 汇聚：鼓停，只剩上扬音效

    # 和弦垫：每小节或段落开头起一个，前后交叠
    if (beat == 0 or lb == 0) and not breath and not building:
        length = min(4 - beat, 4) * BEAT
        v = {'type': .22, 'axis': .26, 'sheet': .28, 'fps': .28, 'lanes': .3, 'title': .42, 'outro': .26}.get(sec, .24)
        music.add(S.pad([n for n in notes if n >= 48] + [notes[1] + 12], length, v=v, bright=2600 if sec == 'title' else 1700), t, pan=0)

    # 贝斯
    bnote = 33 + (root - 9) % 12                        # A1..G#2
    if sec in ('axis', 'sheet', 'lanes') or (sec == 'fps' and lb >= 2):
        for h in (0, .5):
            if sec == 'axis' and h: continue
            music.add(S.bass(bnote, .26 if sec == 'lanes' else .4, v=.5), t + h * BEAT)
    if sec == 'title' and abs(t - REVEAL) < 1e-6:
        music.add(S.bass(29, 3.5, v=.7, drive=.1), t)
    if sec == 'fps' and lb == 2:
        music.add(S.bass(bnote, 1.2, v=.8), t)

    # 鼓
    if sec in ('sheet',) and beat in (0, 2): drums.add(S.kick(.55), t)
    if sec in ('lanes',) or (sec == 'fps' and lb >= 2):
        drums.add(S.kick(.8 if sec == 'lanes' else .6), t)
        if sec == 'lanes' and beat in (1, 3): drums.add(S.clap(.35), t, pan=.1)
    if sec in ('axis', 'sheet', 'lanes') or (sec == 'fps' and lb >= 2):
        for k, h in enumerate((0, .5)):
            drums.add(S.hat(.16 if h == 0 else .1, open_=(sec == 'lanes' and h == .5 and beat == 3)), t + h * BEAT, pan=.35 if k else -.2)

    # 琶音：和弦音上行，八分音符
    if sec in ('sheet', 'lanes'):
        arp = [n + 24 for n in notes[:4]]
        for k in range(2):
            m = arp[(b * 2 + k) % len(arp)]
            music.add(S.pluck(m, .35, v=.22, bright=4200), t + k * BEAT / 2, pan=-.35 + .7 * ((b * 2 + k) % 4) / 3)

# 片名揭示后的钟琴动机：五个音，对应「视频工作台」五个字依次升起
for k, m in enumerate([69, 72, 76, 74, 79]):
    music.add(S.bell(m, 1.4, v=.2), REVEAL + .05 + k * .38, pan=-.3 + k * .15)
for k, m in enumerate([76, 72, 69]):
    music.add(S.bell(m, 1.6, v=.16), shot['outro']['t0'] + 1.2 + k * 1.2, pan=.2 - k * .2)

drums_x = sosfilt(butter(2, 55, 'high', fs=48000, output='sos'), np.asarray(drums), axis=0)
music_x = np.asarray(music) + drums_x * .9

# ———————— 拟音 ————————
fx = Bus(DUR + 3)
for e in EV:
    if e['type'] != 'sfx': continue
    kw = {k: e[k] for k in ('d', 'f', 'lo', 'hi') if k in e}
    low = .6 if e['name'] in ('boom', 'thump') else 1       # 低频冲击本身能量大，按响度而不是峰值来平衡
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
