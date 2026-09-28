"""程序化拟音（numpy / scipy）。所有函数返回单声道 float32 @ SR，峰值约为 v。
用法：from core.audio import sfx；x = sfx.whoosh(.5)；再用 mix.Bus.add(x, at=秒, gain=, pan=) 放进混音。"""
import numpy as np
from scipy.signal import butter, sosfilt

SR = 48000
_rng = np.random.default_rng(7)


def seed(n): global _rng; _rng = np.random.default_rng(n)
def t_(d): return np.arange(int(round(d * SR))) / SR
def noise(d): return _rng.standard_normal(int(round(d * SR)))
def env_exp(d, tau): return np.exp(-t_(d) / tau)
def bp(x, lo, hi, o=2): return sosfilt(butter(o, [lo, hi], 'band', fs=SR, output='sos'), x)
def lp(x, f, o=2): return sosfilt(butter(o, f, 'low', fs=SR, output='sos'), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, 'high', fs=SR, output='sos'), x)
def norm(x, p=1.0): m = np.abs(x).max(); return (x * (p / m) if m > 0 else x).astype(np.float32)
def fade(x, a=.005, b=.02):
    x = x.copy(); na, nb = int(a * SR), int(b * SR)
    if na: x[:na] *= np.linspace(0, 1, na)
    if nb: x[-nb:] *= np.linspace(1, 0, nb)
    return x


def brown(d):
    """布朗噪声：房间底噪、风声的原料"""
    w = np.cumsum(noise(d)); w -= np.linspace(w[0], w[-1], len(w)); return norm(hp(w, 20))


def room(d, v=1.0, lo=80, hi=900):
    """室内底噪 / 空调声床"""
    return norm(fade(bp(brown(d), lo, hi), .5, .5)) * v


def tick(v=1.0, f=3200):
    """极短的机械滴答：计数器、光标、帧步进"""
    d = .03; tt = t_(d)
    return norm(hp(noise(d), 3000) * env_exp(d, .0012) + np.sin(2 * np.pi * f * tt) * env_exp(d, .004) * .6) * v


def key(v=1.0):
    """键盘按键：塑料键帽的中高频 + 一点触底"""
    d = .07; tt = t_(d); p = .9 + _rng.random() * .25
    x = hp(noise(d), 1800) * env_exp(d, .003) * .8
    x += sum(a * np.sin(2 * np.pi * f * p * tt + _rng.random() * 6) * env_exp(d, tau) for f, a, tau in [(2400, .5, .01), (4100, .3, .006), (620, .4, .012)])
    return norm(x) * v


def whoosh(d=.45, v=1.0, lo=500, hi=3400):
    """扫频带通噪声：转场、飞入"""
    n = noise(d); tt = t_(d); out = np.zeros_like(n); hop = 480
    for i in range(0, len(n), hop):
        f = lo + (hi - lo) * np.sin(np.pi * i / len(n))
        s = bp(n[max(0, i - 2048):i + hop], f * .7, min(f * 1.3, SR / 2 - 100))[-hop:]; out[i:i + len(s)] = s
    return norm(out * np.sin(np.pi * tt / d) ** 2) * v


def riser(d=2.0, v=1.0):
    """上扬：噪声 + 上滑正弦，用在揭示之前"""
    tt = t_(d); f = 180 * (2 ** (3 * tt / d))
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * .35
    nz = hp(noise(d), 1500) * (tt / d) ** 2
    return norm((tone + nz) * (tt / d) ** 1.5 * np.minimum(1, (d - tt) / .03)) * v


def thump(v=1.0, f=62):
    """低频冲击：大字落地、揭示"""
    d = .6; tt = t_(d)
    return norm(np.sin(2 * np.pi * f * tt * (1 - .35 * tt)) * env_exp(d, .12) + lp(noise(d), 260) * env_exp(d, .025) * .5) * v


def boom(v=1.0):
    """更长的低频 + 尾巴，片名揭示用"""
    d = 2.4; tt = t_(d)
    body = np.sin(2 * np.pi * 48 * tt * (1 - .2 * tt)) * env_exp(d, .45)
    tail = lp(brown(d), 500) * env_exp(d, .7) * .4
    return norm(body + tail + lp(noise(d), 1200) * env_exp(d, .04) * .5) * v


def ding(v=1.0, f=1318):
    """清脆的铃：完成、点亮"""
    d = 1.8; tt = t_(d)
    x = sum(a * np.sin(2 * np.pi * f * r * tt) * env_exp(d, tau) for r, a, tau in [(1, 1, .7), (2, .45, .35), (3, .25, .2), (1.5, .2, .5), (4, .1, .1)])
    return norm(x) * v


def glitch(d=.25, v=1.0):
    """数字毛刺：碎片化的方波与噪声"""
    n = int(d * SR); out = np.zeros(n); i = 0
    while i < n:
        L = int(SR * (.004 + _rng.random() * .02)); f = 200 + _rng.random() * 3000
        tt = np.arange(min(L, n - i)) / SR
        out[i:i + len(tt)] = np.sign(np.sin(2 * np.pi * f * tt)) * (.3 + _rng.random() * .7) * (_rng.random() > .3)
        i += L
    return norm(bp(out, 300, 9000) * np.sin(np.pi * np.arange(n) / n)) * v


def shutter(v=1.0):
    """相机快门 / 胶片咔哒：两个短瞬态"""
    a = hp(noise(.02), 2500) * env_exp(.02, .002)
    b = bp(noise(.05), 900, 4000) * env_exp(.05, .006)
    out = np.zeros(int(.09 * SR)); out[:len(a)] += a; s = int(.035 * SR); out[s:s + len(b)] += b * .8
    return norm(out) * v


def pop(v=1.0):
    """上滑的气泡声：小元素出现"""
    d = .16; tt = t_(d); f = 500 + 1500 * tt / d
    return norm(np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(d, .045)) * v


REGISTRY = {k: globals()[k] for k in ['tick', 'key', 'whoosh', 'riser', 'thump', 'boom', 'ding', 'glitch', 'shutter', 'pop']}


def make(name, **kw):
    """按名字造音效：页面 EV 里的 {type:'sfx', name:'whoosh', d:.6} 直接映射到这里"""
    if name not in REGISTRY: raise KeyError(f'unknown sfx {name!r}; have {sorted(REGISTRY)}')
    return REGISTRY[name](**kw)
