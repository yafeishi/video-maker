"""小型配乐合成器：用 numpy 直接写谱。
乐器函数都返回单声道 float32 @ SR：pad（柔和和弦垫）、pluck（拨弦）、bell（电钢/钟琴）、bass（带泛音的贝斯）、
kick / snare / hat / clap（鼓组）。
写谱：
    from core.audio import synth as S
    grid = S.Grid(bpm=96, t0=0.0)     # 节拍网格：grid.t(bar, beat) → 秒
    S.midi('C4') → 60；S.chord('Am7', 3) → MIDI 列表
低频注意：pad 的音不要低于 MIDI 48；贝斯带 2、3 次谐波，小喇叭上才听得见。"""
import re
import numpy as np
from scipy.signal import butter, sosfilt

SR = 48000
_rng = np.random.default_rng(11)
NOTES = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
QUAL = {'': [0, 4, 7], 'm': [0, 3, 7], '7': [0, 4, 7, 10], 'maj7': [0, 4, 7, 11], 'm7': [0, 3, 7, 10], 'sus2': [0, 2, 7], 'sus4': [0, 5, 7],
        'add9': [0, 4, 7, 14], 'madd9': [0, 3, 7, 14], 'm9': [0, 3, 7, 10, 14], 'maj9': [0, 4, 7, 11, 14], '6': [0, 4, 7, 9], 'dim': [0, 3, 6]}


def midi(name):
    m = re.fullmatch(r'([A-G])([#b]?)(-?\d)', name)
    return 12 * (int(m[3]) + 1) + NOTES[m[1]] + (1 if m[2] == '#' else -1 if m[2] == 'b' else 0)


def hz(m): return 440.0 * 2 ** ((m - 69) / 12)


def chord(sym, octave=3):
    """'Am7' → [57, 60, 64, 67]（根音在指定八度）"""
    m = re.fullmatch(r'([A-G][#b]?)(.*)', sym); root = midi(m[1] + str(octave))
    return [root + i for i in QUAL[m[2]]]


class Grid:
    def __init__(self, bpm, t0=0.0, beats_per_bar=4): self.bpm, self.t0, self.bpb = bpm, t0, beats_per_bar
    @property
    def beat(self): return 60.0 / self.bpm
    def t(self, bar, beat=0.0): return self.t0 + (bar * self.bpb + beat) * self.beat


def _t(d): return np.arange(int(round(d * SR))) / SR
def _lp(x, f): return sosfilt(butter(2, min(f, SR / 2 - 100), 'low', fs=SR, output='sos'), x)
def _hp(x, f): return sosfilt(butter(2, f, 'high', fs=SR, output='sos'), x)


def adsr(n, a=.01, d=.1, s=.7, r=.2):
    a, d, r = int(a * SR), int(d * SR), int(r * SR); n_s = max(0, n - a - d - r)
    e = np.concatenate([np.linspace(0, 1, a, endpoint=False), np.linspace(1, s, d, endpoint=False), np.full(n_s, s), np.linspace(s, 0, r)])
    return np.pad(e, (0, max(0, n - len(e))))[:n]


def pad(notes, d, v=.5, bright=1800, a=.8, r=1.2):
    """和弦垫：每个音 3 个轻微失谐的锯齿波，低通 + 慢起慢收"""
    tt = _t(d + r); out = np.zeros(len(tt))
    for m in notes:
        f = hz(m)
        for det in (-.07, 0, .06):
            ph = _rng.random()
            out += 2 * ((tt * f * 2 ** (det / 12) + ph) % 1) - 1
    out = _lp(out, bright) * adsr(len(tt), a, .3, .8, r)
    return (out / (len(notes) * 3) * v * 1.6).astype(np.float32)


def pluck(m, d=.6, v=.6, bright=5000):
    """干净的拨弦（Karplus–Strong）"""
    f = hz(m); N = int(SR / f); n = int((d + .4) * SR)
    buf = _rng.uniform(-1, 1, N); out = np.zeros(n); decay = .996
    for i in range(n):
        out[i] = buf[i % N]; buf[i % N] = decay * .5 * (buf[i % N] + buf[(i + 1) % N])
    return (_lp(out, bright) * adsr(n, .002, .05, .9, .3) * v).astype(np.float32)


def bell(m, d=1.2, v=.5):
    """电钢 / 钟琴：FM 两算子"""
    tt = _t(d + .8); f = hz(m)
    idx = 2.2 * np.exp(-tt / .25)
    x = np.sin(2 * np.pi * f * tt + idx * np.sin(2 * np.pi * f * 3.5 * tt)) * np.exp(-tt / (.5 + d * .4))
    return (x * v).astype(np.float32)


def bass(m, d=.5, v=.7, drive=.35, body=.6):
    """贝斯：正弦基频 + 2、3 次谐波 + 轻微失真；body 越小基频越轻、越靠谐波（小喇叭友好，不糊低频）"""
    tt = _t(d + .08); f = hz(m)
    x = body * np.sin(2 * np.pi * f * tt) + .55 * np.sin(4 * np.pi * f * tt) + .3 * np.sin(6 * np.pi * f * tt)
    x = np.tanh(x * (1 + drive * 3)) * adsr(len(tt), .005, .12, .75, .08)
    return (_lp(x, 1400) * v).astype(np.float32)


def kick(v=.9):
    d = .45; tt = _t(d); f = 42 + 110 * np.exp(-tt / .035)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / .16)
    x += _hp(_rng.standard_normal(len(tt)), 3000) * np.exp(-tt / .003) * .25
    return (np.tanh(x * 1.4) * v).astype(np.float32)


def snare(v=.6):
    d = .25; tt = _t(d)
    x = _hp(_rng.standard_normal(len(tt)), 1200) * np.exp(-tt / .06) + np.sin(2 * np.pi * 190 * tt) * np.exp(-tt / .04) * .6
    return (x / np.abs(x).max() * v).astype(np.float32)


def clap(v=.5):
    d = .3; tt = _t(d); x = np.zeros(len(tt))
    for k, o in enumerate((0, .011, .022)):
        s = int(o * SR); n = len(tt) - s
        x[s:] += _hp(_rng.standard_normal(n), 900) * np.exp(-np.arange(n) / SR / (.008 if k < 2 else .09))
    return (x / np.abs(x).max() * v).astype(np.float32)


def hat(v=.3, open_=False):
    d = .35 if open_ else .06; tt = _t(d)
    x = _hp(_rng.standard_normal(len(tt)), 7000) * np.exp(-tt / (.12 if open_ else .012))
    return (x / np.abs(x).max() * v).astype(np.float32)
