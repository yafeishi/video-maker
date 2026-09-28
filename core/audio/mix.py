"""混音工具：立体声总线、压缩、限幅、闪避（ducking）、读写 wav。
    from core.audio.mix import Bus, load_wav, compress, duck_curve
    music = Bus(dur); music.add(x, at=1.5, gain=.6, pan=-.2)
    voice = Bus(dur); ...
    master = music * duck_curve(voice_times, dur) + voice + sfx；write('mix.wav', master)"""
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
from scipy.ndimage import uniform_filter1d, minimum_filter1d

SR = 48000


class Bus:
    """立体声轨道：add(单声道或立体声, at 秒, gain, pan -1..1)"""
    def __init__(self, dur): self.x = np.zeros((int(np.ceil(dur * SR)) + SR, 2), np.float32)

    def add(self, sig, at, gain=1.0, pan=0.0):
        sig = np.asarray(sig, np.float32)
        if sig.ndim == 1:
            a = (pan + 1) * np.pi / 4; sig = np.stack([sig * np.cos(a), sig * np.sin(a)], 1) * np.sqrt(2)
        s = int(round(at * SR))
        if s < 0: sig, s = sig[-s:], 0
        n = min(len(sig), len(self.x) - s)
        if n > 0: self.x[s:s + n] += sig[:n] * gain
        return self

    def __array__(self, dtype=None, copy=None): return self.x if dtype is None else self.x.astype(dtype)


def load_wav(p, sr=SR):
    y, r = sf.read(p, dtype='float32', always_2d=False)
    if r != sr: y = resample_poly(y, sr, r, axis=0).astype(np.float32)
    return y


def db(x): return 20 * np.log10(np.maximum(x, 1e-9))
def rms(x): return float(np.sqrt(np.mean(np.square(x))))


def compress(x, thresh_db=-18, ratio=3.0, attack=.005, release=.12, makeup_db=0.0):
    """前馈压缩器（包络跟随，立体声联动）"""
    x = np.asarray(x, np.float32); mono = np.abs(x).max(1) if x.ndim == 2 else np.abs(x)
    a, r = np.exp(-1 / (attack * SR)), np.exp(-1 / (release * SR))
    env = np.empty_like(mono); e = 0.0
    for i, v in enumerate(mono):
        e = a * e + (1 - a) * v if v > e else r * e + (1 - r) * v; env[i] = e
    over = np.maximum(db(env) - thresh_db, 0)
    g = 10 ** ((-over * (1 - 1 / ratio) + makeup_db) / 20)
    return (x * (g[:, None] if x.ndim == 2 else g)).astype(np.float32)


def limit(x, ceiling_db=-1.0, lookahead=.004, release=.08):
    """简单的前瞻限幅，防止削波；最终响度交给 mux.sh 的 loudnorm"""
    x = np.asarray(x, np.float32); c = 10 ** (ceiling_db / 20)
    peak = np.abs(x).max(1) if x.ndim == 2 else np.abs(x)
    need = np.minimum(1, c / np.maximum(peak, 1e-9))
    la = max(1, int(lookahead * SR))
    need = minimum_filter1d(need, 2 * la + 1)
    r = np.exp(-1 / (release * SR)); g = np.empty_like(need); cur = 1.0
    for i, v in enumerate(need):
        cur = v if v < cur else r * cur + (1 - r) * v; g[i] = cur
    return (x * (g[:, None] if x.ndim == 2 else g)).astype(np.float32)


def duck_curve(spans, dur, depth_db=-9, attack=.12, release=.45):
    """spans = [(t0, t1), ...]（配音或关键拟音的区间）→ 乘在音乐总线上的增益曲线 (N, 1)"""
    n = int(np.ceil(dur * SR)) + SR; mask = np.zeros(n, np.float32)
    for t0, t1 in spans: mask[max(0, int((t0 - attack) * SR)):int((t1 + release * .3) * SR)] = 1
    sm = uniform_filter1d(mask, int(release * SR))
    return (10 ** (depth_db * np.clip(sm, 0, 1) / 20))[:, None].astype(np.float32)


def band_report(x):
    """每个频段的能量（dB，相对全频）：检查配乐是否过于低频重"""
    m = np.asarray(x).mean(1) if np.asarray(x).ndim == 2 else np.asarray(x)
    F = np.abs(np.fft.rfft(m)) ** 2; f = np.fft.rfftfreq(len(m), 1 / SR); tot = F.sum() + 1e-12
    return {name: round(10 * np.log10(F[(f >= a) & (f < b)].sum() / tot + 1e-12), 1)
            for name, a, b in [('sub 20-60', 20, 60), ('low 60-250', 60, 250), ('mid 250-2k', 250, 2000), ('high 2k-8k', 2000, 8000), ('air 8k+', 8000, 24000)]}


def write(p, x, sr=SR):
    sf.write(p, np.asarray(x, np.float32), sr, subtype='PCM_24'); print(p, f'{len(np.asarray(x)) / sr:.2f}s', f'peak {db(np.abs(np.asarray(x)).max()):.1f} dBFS')
