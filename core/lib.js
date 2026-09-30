// 画面通用小工具：确定性随机、插值、缓动、包络
// 页面里 import { ss, track, ... } from '/core/lib.js'
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const seg = (t, a, b) => clamp((t - a) / (b - a));
export const ss = t => { t = clamp(t); return t * t * (3 - 2 * t); };
export const eio = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const eo = t => 1 - Math.pow(1 - clamp(t), 3);
export const ei = t => Math.pow(clamp(t), 3);
export const back = (t, s = 1.8) => { t = clamp(t) - 1; return 1 + t * t * ((s + 1) * t + s); };
// 弹簧落定：0→1，带一两次回弹
export const spring = (t, k = 7, z = .35) => { t = Math.max(0, t); return 1 - Math.exp(-z * k * t) * Math.cos(k * Math.sqrt(1 - z * z) * t * 1.6); };
export function mulberry(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const hash = n => { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
export const vnoise = x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u); };
export const TAU = Math.PI * 2;

// 单调三次插值（Fritsch–Carlson）：keys = [[t, v], ...]，不会过冲
export function monotone(keys) {
  const n = keys.length, xs = keys.map(k => k[0]), ys = keys.map(k => k[1]);
  if (n === 1) return () => ys[0];
  const d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  return t => {
    if (t <= xs[0]) return ys[0]; if (t >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (t > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], u = (t - xs[i]) / h, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * ys[i] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * ys[i + 1] + (u3 - u2) * h * m[i + 1];
  };
}
// 多维关键帧：[[t, [a, b, c]], ...] → t => [a, b, c]
export function track(keys) {
  const dim = keys[0][1].length, fs = [];
  for (let j = 0; j < dim; j++) fs.push(monotone(keys.map(k => [k[0], k[1][j]])));
  return t => fs.map(f => f(t));
}
// 在 [a, b] 区间内 0→1→0 的包络，fi / fo 为淡入淡出时长
export const env = (t, a, b, fi = .3, fo = .3) => Math.min(seg(t, a, a + fi), 1 - seg(t, b - fo, b));

// 时间线：按镜头顺序排布，镜头时长可被配音撑长
// shots = [{ id, dur, lines: [{ id, at }], tail? }]（tail：这个镜头最后一句说完后至少再留几秒），voiceDur = { lineId: 秒 }（没有配音时按字数估算）
// quant > 0 时每个镜头时长向上取整到 quant 秒（例如 2 拍），剪辑点就落在音乐网格上
// 返回 { shots: [{ ..., t0, t1 }], lines: [{ id, text, t0, t1, voice, shot }], DUR }
export function layout(shots, lineText, voiceDur, { tail = .7, minSub = 1.8, charsPerSec = 4.2, quant = 0 } = {}) {
  let t = 0; const outShots = [], outLines = [];
  for (const s of shots) {
    let need = s.dur;
    const ls = (s.lines || []).map(L => {
      const text = lineText[L.id] || '';
      const d = voiceDur[L.id] ?? Math.max(1.2, text.length / charsPerSec);
      need = Math.max(need, L.at + d + (s.tail ?? tail));
      return { id: L.id, text, at: L.at, d };
    });
    if (quant > 0) need = Math.ceil(need / quant - 1e-6) * quant;
    const t0 = t, t1 = t + need;
    outShots.push({ ...s, t0, t1, dur: need });
    for (const L of ls) outLines.push({ id: L.id, text: L.text, t0: t0 + L.at, t1: t0 + L.at + Math.max(minSub, L.d + .6), voice: L.d, shot: s.id });
    t = t1;
  }
  for (let k = 0; k < outLines.length - 1; k++) outLines[k].t1 = Math.min(outLines[k].t1, outLines[k + 1].t0 - .05);
  return { shots: outShots, lines: outLines, DUR: t };
}
// 当前镜头与镜头内局部时间
export function shotAt(shots, t) {
  let s = shots[0];
  for (const x of shots) if (t >= x.t0) s = x;
  return { shot: s, lt: t - s.t0, p: clamp((t - s.t0) / s.dur) };
}
