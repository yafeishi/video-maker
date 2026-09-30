// 《今年国庆，为什么没有阅兵？》—— 暗色发布会风格讲解片
// 页面约定：window.DUR / window.render(t) / window.READY / window.EV / window.CUES（见 docs/technique.md）
import { clamp, lerp, seg, ss, eio, eo, ei, spring, hash, TAU, layout, shotAt } from '/core/lib.js';

const W = 1920, H = 1080;
const C = { bg: '#07090d', ink: '#e9edf3', dim: '#667085', faint: '#1b2231', line: '#2a3345', axis: '#3a4660', acc: '#46f0c4', warm: '#ffb14a' };
const ZH = '"NotoSansSC", "PingFang SC", "Microsoft YaHei", sans-serif';
const MONO = '"JetBrainsMono", "NotoSansSC", monospace';
const BPM = 100, BEAT = 60 / BPM;

const cv = document.getElementById('c'); cv.width = W; cv.height = H;
const g = cv.getContext('2d');

// ———————————————————— 时间线 ————————————————————
const SHOTS = [
  { id: 'hook',   dur: 8 * BEAT,  lines: [{ id: 'l1', at: 1.4 }] },
  { id: 'age',    dur: 10 * BEAT, lines: [{ id: 'l2', at: .5 }, { id: 'l3', at: 3.5 }] },
  { id: 'early',  dur: 12 * BEAT, lines: [{ id: 'l4', at: .7 }] },
  { id: 'rule',   dur: 18 * BEAT, lines: [{ id: 'l5', at: .6 }, { id: 'l6', at: 4.9 }] },
  { id: 'gap',    dur: 10 * BEAT, lines: [{ id: 'l7', at: 1.0 }] },
  { id: 'resume', dur: 12 * BEAT, lines: [{ id: 'l8', at: .4 }] },
  { id: 'other',  dur: 12 * BEAT, lines: [{ id: 'l9', at: .4 }] },
  { id: 'next',   dur: 14 * BEAT, lines: [{ id: 'l10', at: 1.8 }] },
  { id: 'title',  dur: 12 * BEAT, lines: [] },
  { id: 'outro',  dur: 10 * BEAT, lines: [{ id: 'l11', at: .9 }] },
  { id: 'ask',    dur: 16 * BEAT, lines: [{ id: 'l12', at: .9 }, { id: 'l13', at: 3.4 }] },
];

async function loadJSON(p, fallback) { try { const r = await fetch(p, { cache: 'no-store' }); return r.ok ? await r.json() : fallback; } catch { return fallback; } }
const linesDoc = await loadJSON('lines.json', { lines: [] });
const TEXT = Object.fromEntries(linesDoc.lines.map(L => [L.id, L.text]));
const VDUR = await loadJSON('voices/dur.json', {});
const TL = layout(SHOTS, TEXT, VDUR, { quant: 2 * BEAT });
const S = Object.fromEntries(TL.shots.map(s => [s.id, s]));
const LN = Object.fromEntries(TL.lines.map(L => [L.id, L]));
// 词的起点（相对该句配音开头，取自 voices/words.json），画面动作对在词上
const V = (id, off = 0) => LN[id].t0 + off;

await Promise.all([`400 40px ${ZH}`, `700 40px ${ZH}`, `900 40px ${ZH}`, `400 40px ${MONO}`, `700 40px ${MONO}`].map(f => document.fonts.load(f, '国庆阅兵1949')));

// ———————————————————— 世界：一条 1949–2031 的时间轴 ————————————————————
const K = 44, X = y => (y - 1949) * K, AXIS_A = 1947, AXIS_B = 2031.5;
const EARLY = [...Array(11)].map((_, i) => ({ y: 1949 + i, t: V('l4', .1 + i * .19) }));
const RESUME = [{ y: 1984, n: 35, t: V('l8', .1), tl: V('l8', 1.86) }, { y: 1999, n: 50, t: V('l8', 2.7) }, { y: 2009, n: 60, t: V('l8', 3.46) }, { y: 2019, n: 70, t: V('l8', 4.14) }];
const V93 = [{ y: 2015, n: 70, t: V('l9', .05) }, { y: 2025, n: 80, t: V('l9', 1.02) }];
const NOW_T = V('l2', 1.58), NEXT_T = V('l10', 2.3);

// 每个时间轴镜头的相机关键帧：[本镜头内时间, 中心年份, 世界 y, 缩放, 缓动]
const CAMS = {
  age:    s => [[0, 1990, -40, .49], [s.dur - 1.25, 1990, -40, .5], [s.dur, 1950.5, -20, 1.5, ei]],
  early:  s => [[0, 1950.5, -20, 1.5], [1.1, 1954, -20, 2.75, eo], [s.dur, 1954.4, -20, 2.55]],
  gap:    s => [[0, 1957, -20, 2.2], [s.dur, 1971.5, -20, 1.42]],
  resume: s => [[0, 1971.5, -20, 1.42], [s.dur, 2001, -20, 1.0]],
  other:  s => [[0, 2001, -20, 1.0], [s.dur, 2006, -20, .93]],
  next:   s => [[0, 2006, -20, .93], [1.5, 1989.5, -40, .5], [4.9, 1990, -40, .51], [6.9, 2025.3, -20, 1.5], [s.dur, 2025.6, -20, 1.58]],
};
function camAt(keys, lt) {
  let i = 0; while (i < keys.length - 2 && lt > keys[i + 1][0]) i++;
  const a = keys[i], b = keys[i + 1] || a, k = (b[4] || eio)(seg(lt, a[0], b[0]));
  return { x: X(lerp(a[1], b[1], k)), y: lerp(a[2], b[2], k), z: Math.exp(lerp(Math.log(a[3]), Math.log(b[3]), k)) };
}

// ———————————————————— 事件（音效 / 配音 / 镜头），导出给混音 ————————————————————
const EV = [];
const sfx = (t, name, gain = 1, extra = {}) => EV.push({ t: +t.toFixed(4), type: 'sfx', name, gain, ...extra });
for (const s of TL.shots) EV.push({ t: s.t0, type: 'shot', id: s.id, t1: s.t1 });
for (const L of TL.lines) EV.push({ t: L.t0, type: 'voice', id: L.id, d: L.voice });
const EQ = '2026 − 1949 =', EQ_T = S.age.t0 + .35;
sfx(S.hook.t0 + .25, 'thump', .45);
for (let r = 0; r < 4; r++) sfx(S.hook.t0 + .5 + r * .16, 'tick', .3, { pan: -.3 + r * .2 });
sfx(S.hook.t1 - .6, 'whoosh', .3, { d: .6 });
sfx(S.age.t0 + .05, 'whoosh', .16, { d: .7, lo: 200, hi: 900 });
for (let i = 0; i < EQ.length; i++) if (EQ[i] !== ' ') sfx(EQ_T + i * .06, 'key', .16 + .08 * hash(i), { pan: (i / EQ.length - .5) * .4 });
sfx(NOW_T, 'thump', 1.0);
sfx(V('l3'), 'pop', .45, { pan: .3 });
sfx(S.age.t1 - 1.2, 'whoosh', .5, { d: 1.3 });
for (const d of EARLY) sfx(d.t, 'pop', .3 + .1 * hash(d.y), { pan: -.5 + (d.y - 1949) / 10 });
sfx(V('l4', 3.98), 'ding', .2, { f: 1568 });
sfx(S.early.t1 - .5, 'whoosh', .45, { d: .7 });
sfx(S.rule.t0 + .55, 'shutter', .55);
sfx(V('l6', .92), 'pop', .4, { pan: -.2 });
sfx(V('l6', 2.44), 'pop', .4, { pan: .2 });
sfx(V('l6', 3.7), 'thump', .55);
sfx(S.rule.t1 - .5, 'whoosh', .4, { d: .7 });
sfx(S.gap.t0 + 1.2, 'tick', .3, { pan: -.4 });
sfx(S.gap.t0 + 3.2, 'tick', .3, { pan: .4 });
sfx(V('l7', 2.6), 'thump', .35);
for (const d of RESUME) sfx(d.t, 'pop', .45, { pan: (d.y - 2001) / 30 });
for (const d of V93) sfx(d.t, 'ding', .22, { f: 988, pan: (d.y - 2006) / 25 });
sfx(S.next.t0 + .05, 'whoosh', .45, { d: 1.4, lo: 250, hi: 1600 });
sfx(NEXT_T, 'ding', .3, { f: 1760, pan: .4 });
sfx(S.next.t0 + 4.9, 'whoosh', .35, { d: 2.0, lo: 400, hi: 2600 });
sfx(S.next.t1 - 2.0, 'riser', .6, { d: 2.0 + 2 * BEAT });
sfx(S.title.t0 + 2 * BEAT, 'boom', 1.0);
for (let i = 0; i < 4; i++) sfx(S.outro.t0 + .35 + i * .15, 'pop', .3, { pan: -.3 + i * .2 });
sfx(V('l11', 1.78), 'whoosh', .25, { d: .9, lo: 800, hi: 4000 });
const PAST = [{ y: 1984, nat: 1 }, { y: 1999, nat: 1 }, { y: 2009, nat: 1 }, { y: 2015, nat: 0 }, { y: 2019, nat: 1 }, { y: 2025, nat: 0 }];
const CHIP_T = i => V('l12', 1.38) + i * .12, TYPE_TXT = '我记得那一年……', TYPE_T = V('l13', 1.58), TYPE_PER = .12, SEND_T = V('l13', 2.74);
sfx(S.ask.t0 + .05, 'whoosh', .2, { d: .8, lo: 300, hi: 1500 });
PAST.forEach((d, i) => sfx(CHIP_T(i), 'pop', .28, { pan: -.5 + i * .2 }));
for (let i = 0; i < TYPE_TXT.length; i++) sfx(TYPE_T + i * TYPE_PER, 'key', .18 + .08 * hash(i + 70), { pan: -.2 + i * .04 });
sfx(SEND_T, 'ding', .22, { f: 1318, pan: .3 });
EV.sort((a, b) => a.t - b.t);

// ———————————————————— 绘制工具 ————————————————————
function cam(c, par = 1) {
  const z = lerp(1, c.z, par);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.translate(W / 2, H / 2); g.scale(z, z); g.translate(-c.x * par, -c.y * par);
}
function text(s, x, y, { size = 40, font = ZH, weight = 400, color = C.ink, align = 'center', base = 'middle', alpha = 1, spacing = 0, glow = 0, glowColor } = {}) {
  if (alpha <= 0) return;
  g.save(); g.globalAlpha *= alpha; g.font = `${weight} ${size}px ${font}`; g.fillStyle = color; g.textAlign = align; g.textBaseline = base;
  g.letterSpacing = spacing + 'px';
  if (glow) { g.shadowColor = glowColor || color; g.shadowBlur = glow; }
  g.fillText(s, x, y); g.restore();
}
function rrect(x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
function background(c) {
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
  cam(c, .45);
  g.fillStyle = C.faint; const step = 80, zz = lerp(1, c.z, .45);
  const hw = W / 2 / zz + step, hh = H / 2 / zz + step;
  const x0 = Math.floor((c.x * .45 - hw) / step) * step, y0 = Math.floor((c.y * .45 - hh) / step) * step;
  for (let x = x0; x < c.x * .45 + hw; x += step) for (let y = y0; y < c.y * .45 + hh; y += step) g.fillRect(x - 1.5 / zz, y - 1.5 / zz, 3 / zz, 3 / zz);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const v = g.createRadialGradient(W / 2, H / 2, H * .25, W / 2, H / 2, H * .95);
  v.addColorStop(0, 'rgba(7,9,13,0)'); v.addColorStop(1, 'rgba(3,4,6,.85)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
}
const pop = (t, t0) => t < t0 ? 0 : clamp(spring(t - t0, 9, .5), 0, 1.3);
function dot(x, y, r, color, { glow = 0, alpha = 1 } = {}) {
  if (alpha <= 0 || r <= 0) return;
  g.save(); g.globalAlpha *= alpha; g.fillStyle = color;
  if (glow) { g.shadowColor = color; g.shadowBlur = glow; }
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.restore();
}
function ring(x, y, r, color, lw, { dash = null, alpha = 1, glow = 0 } = {}) {
  if (alpha <= 0 || r <= 0) return;
  g.save(); g.globalAlpha *= alpha; g.strokeStyle = color; g.lineWidth = lw;
  g.fillStyle = C.bg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  if (dash) g.setLineDash(dash);
  if (glow) { g.shadowColor = color; g.shadowBlur = glow; }
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); g.restore();
}
function bracket(x0, x1, y, h, lw, color, grow = 1, alpha = 1) {
  if (grow <= 0 || alpha <= 0) return;
  g.save(); g.globalAlpha *= alpha; g.strokeStyle = color; g.lineWidth = lw; g.lineCap = 'round';
  const xe = lerp(x0, x1, grow);
  g.beginPath(); g.moveTo(x0, y + h); g.lineTo(x0, y); g.lineTo(xe, y); if (grow >= 1) g.lineTo(x1, y + h); g.stroke(); g.restore();
}

// 时间轴：所有年份、标签、点都在世界坐标里，任何相机下都用同一套画法
// 字号和线宽乘 u，缩小时不至于看不清；标签按缩放淡入淡出，避免远景里挤在一起
function timeline(t, c, { grow = 1, anniv = 0 } = {}) {
  const u = Math.pow(c.z, -.9);
  const far = ss((c.z - .62) / .22), mid = ss((c.z - 1.75) / .35);
  const aEnd = lerp(AXIS_A, AXIS_B, grow);
  g.strokeStyle = C.axis; g.lineWidth = 3 * u; g.lineCap = 'round';
  g.beginPath(); g.moveTo(X(AXIS_A), 0); g.lineTo(X(aEnd), 0); g.stroke();
  if (grow >= 1) { g.save(); g.setLineDash([6 * u, 8 * u]); g.globalAlpha *= .6; g.beginPath(); g.moveTo(X(AXIS_B), 0); g.lineTo(X(2040), 0); g.stroke(); g.restore(); }
  for (let y = 1949; y <= 2031 && y <= aEnd; y++) {
    const major = (y - 1949) % 10 === 0, h = (major ? 16 : 7) * u;
    g.fillStyle = major ? C.dim : C.line; g.fillRect(X(y) - (major ? 1.5 : 1) * u, -h, (major ? 3 : 2) * u, 2 * h);
    if (major && anniv > 0) text(y === 1949 ? '建国' : `${y - 1949}`, X(y), 48 * u, { size: 28 * u, font: MONO, color: y === 2019 || y === 2029 ? C.ink : C.dim, alpha: anniv * ss(seg(aEnd, y - .5, y + 1)) });
  }
  if (anniv > 0) text('周年', X(2029) + 44 * u, 48 * u, { size: 20 * u, color: C.dim, align: 'left', alpha: anniv * ss(seg(aEnd, 2029, 2031)) });

  // 1949–1959：每年一次
  for (const d of EARLY) {
    const p = pop(t, d.t); if (p <= 0) continue;
    dot(X(d.y), 0, 9 * u * p, C.acc, { glow: 16 });
    const edge = d.y === 1949 || d.y === 1959;
    text(`${d.y}`, X(d.y), 44 * u, { size: 22 * u, font: MONO, color: C.dim, alpha: clamp(p) * (edge ? far : mid) });
  }
  // 中断的 24 年
  const gb = eio(seg(t, S.gap.t0 + 1.2, S.gap.t0 + 3.2));
  if (gb > 0) {
    const ga = t > S.next.t0 ? .55 : 1;
    bracket(X(1959.6), X(1982.6), -64 * u, 18 * u, 2.5 * u, C.dim, gb, ga);
    const la = ss(seg(t, V('l7', 2.5), V('l7', 3.0)));
    text('24', X(1971) - 8 * u, -118 * u, { size: 76 * u, weight: 800, font: MONO, color: C.ink, align: 'right', alpha: la * ga });
    text('年没有国庆阅兵', X(1971), -110 * u, { size: 30 * u, weight: 400, color: C.dim, align: 'left', alpha: la * ga });
  }
  // 1984 年恢复以后
  for (const d of RESUME) {
    const p = pop(t, d.t); if (p <= 0) continue;
    dot(X(d.y), 0, 11 * u * p, C.acc, { glow: 20 });
    const la = ss(seg(t, d.tl || d.t, (d.tl || d.t) + .3));
    text(`${d.n}`, X(d.y), -74 * u, { size: 46 * u, weight: 800, font: MONO, color: C.acc, alpha: la });
    text('周年', X(d.y), -38 * u, { size: 20 * u, color: C.dim, alpha: la * far });
    text(`${d.y}`, X(d.y), 46 * u, { size: 24 * u, font: MONO, color: C.ink, alpha: clamp(p) * far });
  }
  // 九三阅兵：空心圆，和国庆阅兵区分开
  for (const d of V93) {
    const p = pop(t, d.t); if (p <= 0) continue;
    const dimmed = (1 - .45 * ss(seg(t, V('l9', 4.3), V('l9', 4.8)))) * (1 - .6 * ss(seg(t, S.next.t0 + 4.9, S.next.t0 + 5.8)));
    ring(X(d.y), 0, 12 * u * p, C.ink, 3 * u, { alpha: dimmed });
    text('九三', X(d.y), -58 * u, { size: 28 * u, weight: 700, color: C.ink, alpha: clamp(p) * far * dimmed });
    text(`${d.y}`, X(d.y), 46 * u, { size: 24 * u, font: MONO, color: C.dim, alpha: clamp(p) * far });
    text(`抗战胜利 ${d.n} 周年`, X(d.y), 82 * u, { size: 20 * u, color: C.dim, alpha: ss(seg(t, V('l9', 3.44), V('l9', 3.9))) * far * dimmed });
  }
  // 今年
  const np = eo(seg(t, NOW_T - .05, NOW_T + .45));
  if (np > 0) {
    const top = -190 * u * np;
    g.strokeStyle = C.warm; g.lineWidth = 2.5 * u; g.beginPath(); g.moveTo(X(2026), -4 * u); g.lineTo(X(2026), top); g.stroke();
    dot(X(2026), 0, 8 * u * clamp(np * 1.2), C.warm, { glow: 18 });
    text('今年', X(2026), top - 52 * u, { size: 40 * u, weight: 700, color: C.warm, alpha: np });
    text('77 周年', X(2026), top - 16 * u, { size: 22 * u, font: MONO, color: C.warm, alpha: np * .85 });
  }
  // 下一次：2029
  const xp = pop(t, NEXT_T);
  if (xp > 0) {
    const pulse = .5 + .5 * Math.sin((t - NEXT_T) * TAU * .8);
    ring(X(2029), 0, 14 * u * xp, C.acc, 3 * u, { dash: [6 * u, 5 * u], glow: 12 });
    ring(X(2029), 0, (20 + 14 * pulse) * u, C.acc, 1.5 * u, { alpha: .45 * (1 - pulse) * clamp(xp) });
    text('80', X(2029), -80 * u, { size: 50 * u, weight: 800, font: MONO, color: C.acc, alpha: clamp(xp), glow: 16 });
    text('周年', X(2029), -42 * u, { size: 20 * u, color: C.acc, alpha: clamp(xp) });
    text('2029', X(2029), 46 * u, { size: 24 * u, font: MONO, color: C.acc, alpha: clamp(xp) });
    const ba = ss(seg(t, S.next.t0 + 6.7, S.next.t0 + 7.3));
    bracket(X(2026), X(2029), 104 * u, -14 * u, 2.5 * u, C.ink, eio(seg(t, S.next.t0 + 6.5, S.next.t0 + 7.3)), ba);
    text('还差 3 年', X(2027.5), 138 * u, { size: 28 * u, weight: 700, color: C.ink, alpha: ba });
  }
}

// ———————————————————— 镜头 ————————————————————
const FORM = { cols: 9, rows: 4, s: 58, gap: 28, y0: 90 };
function formation(lt, s, alpha, collapse) {
  const { cols, rows, s: sz, gap, y0 } = FORM;
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    const a = ss(seg(lt, .5 + r * .16 + q * .02, .8 + r * .16 + q * .02)) * alpha;
    if (a <= 0) continue;
    const x = (q - (cols - 1) / 2) * (sz + gap), y = lerp(y0 + r * (sz + gap), 21, ei(collapse));
    const h = lerp(sz, 3, ei(collapse)), w = lerp(sz, sz + gap + 1, ei(collapse));
    g.globalAlpha = a; g.strokeStyle = collapse > .5 ? C.axis : C.line; g.lineWidth = 2;
    rrect(x - w / 2, y - h / 2, w, h, 6); g.stroke();
  }
  g.globalAlpha = 1;
}
function dateTitle(alpha, { y = -170, yr = '2026' } = {}) {
  text('10·1', 0, y, { size: 250, weight: 700, font: MONO, color: C.ink, alpha, spacing: 6 });
  text(yr, 0, y - 190, { size: 34, font: MONO, color: C.dim, alpha, spacing: 22 });
}
function shotHook(lt, s) {
  const c = { x: 0, y: 0, z: lerp(1.0, 1.06, ss(lt / s.dur)) };
  background(c); cam(c);
  const col = seg(lt, s.dur - .6, s.dur);
  dateTitle(ss(seg(lt, .15, .7)) * (1 - ss(col * 1.5)));
  formation(lt, s, 1, col);
}

function shotAge(lt, s, t) {
  const c = camAt(CAMS.age(s), lt);
  background(c); cam(c);
  timeline(t, c, { grow: eo(seg(lt, .05, 1.3)), anniv: 1 - ss(seg(lt, s.dur - 1.2, s.dur - .6)) });
  g.setTransform(1, 0, 0, 1, 0, 0);
  const out = 1 - ss(seg(lt, s.dur - 1.25, s.dur - .7));
  const n = clamp(Math.floor((t - EQ_T) / .06) + 1, 0, EQ.length);
  text(EQ.slice(0, n), 860, 300, { size: 64, font: MONO, color: C.dim, align: 'right', alpha: out });
  const a = t - NOW_T;
  if (a > 0) {
    const sh = 12 * Math.exp(-a * 7);
    g.save(); g.translate(900 + sh * Math.sin(a * 83), 300 + sh * Math.cos(a * 61)); const sc = lerp(1.5, 1, clamp(spring(a, 10, .45)));
    g.scale(sc, sc);
    text('77', 0, 0, { size: 230, weight: 800, font: MONO, color: C.warm, align: 'left', alpha: out, glow: 40 * Math.exp(-a * 3) });
    g.restore();
    text('周年', 1230, 336, { size: 48, weight: 700, color: C.warm, align: 'left', alpha: ss(seg(a, .2, .5)) * out });
  }
  const tg = ss(seg(t, V('l3'), V('l3', .3)));
  if (tg > 0) {
    g.save(); g.globalAlpha = tg * out; g.translate(1230, 420);
    rrect(0, -30, 188, 60, 30); g.strokeStyle = C.warm; g.lineWidth = 2.5; g.stroke(); g.restore();
    text('不逢十', 1324, 421, { size: 34, weight: 700, color: C.warm, alpha: tg * out, spacing: 4 });
  }
}

function shotEarly(lt, s, t) {
  const c = camAt(CAMS.early(s), lt);
  const up = ei(seg(lt, s.dur - .55, s.dur));
  c.y += 760 / c.z * up;
  background(c); cam(c);
  timeline(t, c);
  const u = Math.pow(c.z, -.9);
  const n = EARLY.filter(d => t >= d.t).length;
  if (n > 0) {
    const fin = t >= V('l4', 3.98), a = ss(seg(t, EARLY[0].t, EARLY[0].t + .3));
    text(`${n}`, X(1954) - 6 * u, -150 * u, { size: 110 * u, weight: 800, font: MONO, color: C.acc, align: 'right', alpha: a, glow: fin ? 24 : 0 });
    text('次国庆阅兵', X(1954) + 6 * u, -138 * u, { size: 36 * u, weight: 700, color: C.ink, align: 'left', alpha: a });
    text('每年一次', X(1954) + 8 * u, -190 * u, { size: 22 * u, color: C.dim, align: 'left', alpha: ss(seg(t, V('l4', 2.08), V('l4', 2.5))) });
  }
}

function shotRule(lt, s, t) {
  const inn = eo(seg(lt, 0, .6)), out = ei(seg(lt, s.dur - .55, s.dur));
  const c = { x: 0, y: 0, z: lerp(1.0, 1.05, ss(lt / s.dur)) };
  background({ x: 0, y: lerp(-500, 0, inn) + 500 * out, z: c.z }); cam(c);
  g.translate(0, lerp(760, 0, inn) - 760 * out);
  const st = ss(seg(lt, .5, .75));
  if (st > 0) {
    const sc = lerp(1.35, 1, eo(seg(lt, .5, .75)));
    g.save(); g.translate(0, -330); g.scale(sc, sc); g.globalAlpha = st;
    rrect(-150, -36, 300, 72, 8); g.strokeStyle = C.dim; g.lineWidth = 2; g.stroke(); g.restore();
    text('1960 · 9', 0, -329, { size: 40, font: MONO, weight: 700, color: C.ink, alpha: st, spacing: 4 });
  }
  text('改革国庆典礼制度', 0, -250, { size: 30, color: C.dim, alpha: ss(seg(lt, .9, 1.3)), spacing: 8 });
  const pa = ss(seg(t, V('l5', 1.2), V('l5', 1.7)));
  text('厉行节约  ·  勤俭建国', 0, -170, { size: 44, weight: 700, color: C.ink, alpha: pa, spacing: 6 });
  const rows = [['五年一小庆', V('l6', .92), C.ink], ['十年一大庆', V('l6', 2.44), C.ink], ['逢大庆 举行阅兵', V('l6', 3.7), C.acc]];
  rows.forEach(([s1, t1, col], i) => {
    const p = eo(seg(t, t1 - .1, t1 + .35)), y = -20 + i * 130;
    text(s1, 0, y + 30 * (1 - p), { size: 92, weight: 700, color: col, alpha: p, spacing: 10, glow: i === 2 ? 26 * p : 0 });
  });
  const ul = eo(seg(t, V('l6', 3.9), V('l6', 4.6)));
  if (ul > 0) { g.strokeStyle = C.acc; g.lineWidth = 3; g.shadowColor = C.acc; g.shadowBlur = 14; g.beginPath(); g.moveTo(-310 * ul, 318); g.lineTo(310 * ul, 318); g.stroke(); g.shadowBlur = 0; }
}

function shotTimeline(id) {
  return (lt, s, t) => {
    const c = camAt(CAMS[id](s), lt);
    if (id === 'gap') c.y -= 760 / c.z * (1 - eo(seg(lt, 0, .6)));
    background(c); cam(c);
    const fade = id === 'next' ? 1 - ss(seg(lt, s.dur - .5, s.dur)) : 1;
    g.globalAlpha = fade; timeline(t, c); g.globalAlpha = 1;
    if (id === 'next' && fade < 1) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      const y = H / 2 - c.y * c.z;
      g.strokeStyle = C.axis; g.lineWidth = 3; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }
  };
}

const TITLE = '逢十大庆', TPX = 190, TSP = 34;
function titleLayout() {
  g.font = `800 ${TPX}px ${ZH}`; g.letterSpacing = TSP + 'px';
  const w = g.measureText(TITLE).width - TSP; g.letterSpacing = '0px';
  const cw = (w - TSP * (TITLE.length - 1)) / TITLE.length;
  return [...TITLE].map((ch, i) => ({ ch, x: -w / 2 + cw / 2 + i * (cw + TSP) }));
}
const TITLE_LINE_Y = 110;
function shotTitle(lt, s) {
  const rev = 2 * BEAT, after = lt - rev;
  const c = { x: 0, y: 0, z: lerp(1.0, 1.04, ss(seg(lt, rev, s.dur))) };
  background(c);
  const k = eio(seg(lt, 0, rev));
  // 上一镜收尾时时间轴停在 y0（屏幕坐标），这里收成片名下的那条线
  const nc = camAt(CAMS.next(S.next), S.next.dur), y0 = H / 2 - nc.y * nc.z;
  g.setTransform(1, 0, 0, 1, 0, 0);
  const lw = lerp(W, 1040, k), ly = lerp(y0, H / 2 + TITLE_LINE_Y * c.z, k);
  g.strokeStyle = k > .6 ? C.acc : C.axis; g.lineWidth = lerp(3, 4, k);
  g.shadowColor = C.acc; g.shadowBlur = after > 0 ? 26 + 60 * Math.exp(-after * 4) : 20 * k;
  g.beginPath(); g.moveTo(W / 2 - lw / 2, ly); g.lineTo(W / 2 + lw / 2, ly); g.stroke(); g.shadowBlur = 0;
  cam(c);
  if (after >= 0) {
    titleLayout().forEach(({ ch, x }, i) => {
      const p = eo(seg(after, .05 + i * .09, .7 + i * .09));
      text(ch, x, lerp(70, -30, p), { size: TPX, weight: 800, color: C.ink, alpha: p });
    });
    text('国庆阅兵的惯例', 0, 190, { size: 36, color: C.dim, spacing: 14, alpha: ss(seg(after, .8, 1.4)) });
    text('下一次  2029  ·  建国 80 周年', 0, 262, { size: 32, font: MONO, color: C.acc, spacing: 4, alpha: ss(seg(after, 1.5, 2.1)) });
  }
  if (after >= 0 && after < .25) { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = `rgba(210,255,240,${.18 * (1 - after / .25) ** 2})`; g.fillRect(0, 0, W, H); }
}

const CHIPS = [2026, 2027, 2028, 2029];
function shotOutro(lt, s, t) {
  const c = { x: 0, y: 0, z: lerp(1.0, 1.08, ss(seg(lt, .3, s.dur))) };
  background(c); cam(c);
  const inA = ss(seg(lt, 0, .6));
  dateTitle(inA);
  const cw = 230, ch = 96, gap = 34, x0 = -(CHIPS.length * cw + (CHIPS.length - 1) * gap) / 2, cy = 150;
  const sweep = eio(seg(t, V('l11', 1.78), V('l11', 2.9)));
  CHIPS.forEach((y, i) => {
    const p = clamp(pop(lt, .35 + i * .15)); if (p <= 0) return;
    const x = x0 + i * (cw + gap), now = y === 2026, nxt = y === 2029;
    const reached = sweep >= (i + .5) / CHIPS.length;
    g.save(); g.globalAlpha = p; g.translate(x + cw / 2, cy + 14 * (1 - p)); g.scale(lerp(.8, 1, p), lerp(.8, 1, p));
    rrect(-cw / 2, -ch / 2, cw, ch, 14);
    g.fillStyle = nxt && reached ? 'rgba(70,240,196,.14)' : 'rgba(255,255,255,.02)'; g.fill();
    g.strokeStyle = now ? C.warm : nxt ? C.acc : reached ? C.axis : C.line; g.lineWidth = now || nxt ? 3 : 2;
    if (nxt) { g.setLineDash(reached ? [] : [10, 8]); if (reached) { g.shadowColor = C.acc; g.shadowBlur = 20; } }
    g.stroke(); g.restore();
    text(`${y}`, x + cw / 2, cy + 14 * (1 - p), { size: 44, font: MONO, weight: 700, color: now ? C.warm : nxt ? C.acc : C.dim, alpha: p });
    text(now ? '今年' : nxt ? '国庆阅兵' : '', x + cw / 2, cy + 86, { size: 26, weight: 700, color: now ? C.warm : C.acc, alpha: p * (nxt ? ss(seg(sweep, .8, 1)) : 1) });
  });
  if (sweep > 0) {
    const xa = x0 + cw / 2, xb = x0 + 3 * (cw + gap) + cw / 2;
    g.strokeStyle = C.acc; g.lineWidth = 3; g.globalAlpha = .9; g.beginPath(); g.moveTo(xa, cy + 60); g.lineTo(lerp(xa, xb, sweep), cy + 60); g.stroke(); g.globalAlpha = 1;
  }
}

// 互动：历次阅兵的年份 + 一个正在打字的评论框
function shotAsk(lt, s, t) {
  const k = ss(seg(lt, 0, .5)), ka = ss(seg(lt, .4, 1.0));
  if (k < 1) { g.save(); shotOutro(S.outro.dur - 1e-3, S.outro, S.outro.t1 - 1e-3); g.restore(); }
  const c = { x: 0, y: 0, z: lerp(1.0, 1.05, ss(lt / s.dur)) };
  g.save(); g.globalAlpha = k; background(c); g.restore();
  cam(c);
  text('你记忆最深的一次阅兵', 0, -300 + 40 * (1 - ka), { size: 72, weight: 800, color: C.ink, alpha: ka, spacing: 6 });
  const cw = 190, ch = 84, gap = 26, x0 = -(PAST.length * cw + (PAST.length - 1) * gap) / 2, cy = -150;
  const scan = t - (CHIP_T(PAST.length - 1) + .35), hi = scan > 0 && scan < PAST.length * .22 ? Math.floor(scan / .22) : -1;
  PAST.forEach((d, i) => {
    const p = clamp(pop(t, CHIP_T(i))); if (p <= 0) return;
    const x = x0 + i * (cw + gap) + cw / 2, on = i === hi;
    g.save(); g.globalAlpha = p; g.translate(x, cy + 14 * (1 - p)); g.scale(lerp(.8, 1, p), lerp(.8, 1, p));
    rrect(-cw / 2, -ch / 2, cw, ch, 14); g.fillStyle = on ? 'rgba(70,240,196,.12)' : 'rgba(255,255,255,.02)'; g.fill();
    g.strokeStyle = on ? C.acc : C.line; g.lineWidth = 2; g.stroke();
    if (d.nat) dot(-54, 0, 9, C.acc, { glow: 12 }); else ring(-54, 0, 9, C.ink, 2.5);
    text(`${d.y}`, 18, 1, { size: 38, font: MONO, weight: 700, color: on ? C.ink : C.dim });
    g.restore();
  });
  const la = ss(seg(t, CHIP_T(PAST.length - 1), CHIP_T(PAST.length - 1) + .4));
  dot(-150, -76, 6, C.acc, { alpha: la }); text('国庆阅兵', -136, -76, { size: 22, color: C.dim, align: 'left', alpha: la });
  ring(40, -76, 6, C.ink, 2, { alpha: la }); text('九三阅兵', 54, -76, { size: 22, color: C.dim, align: 'left', alpha: la });

  const bp = eo(seg(t, V('l13', -.2), V('l13', .4)));
  if (bp > 0) {
    const bw = 1200, bh = 150, by = 90 + 30 * (1 - bp);
    g.save(); g.globalAlpha = bp;
    rrect(-bw / 2, by - bh / 2, bw, bh, 22); g.fillStyle = 'rgba(255,255,255,.03)'; g.fill(); g.strokeStyle = C.line; g.lineWidth = 2; g.stroke();
    const ax = -bw / 2 + 70;
    g.strokeStyle = C.dim; g.lineWidth = 2.5; g.beginPath(); g.arc(ax, by, 38, 0, TAU); g.stroke();
    g.fillStyle = C.dim; g.beginPath(); g.arc(ax, by - 9, 12, 0, TAU); g.fill();
    g.beginPath(); g.arc(ax, by + 26, 22, Math.PI * 1.15, Math.PI * 1.85); g.fill();
    g.restore();
    const n = clamp(Math.floor((t - TYPE_T) / TYPE_PER) + 1, 0, TYPE_TXT.length), tx = ax + 70;
    text('写下你的阅兵记忆和感想', tx, by, { size: 36, color: C.dim, align: 'left', alpha: bp * .7 * (n === 0) });
    if (n > 0) text(TYPE_TXT.slice(0, n), tx, by, { size: 40, color: C.ink, align: 'left', alpha: bp });
    g.font = `400 40px ${ZH}`; g.letterSpacing = '0px';
    const cx = tx + (n > 0 ? g.measureText(TYPE_TXT.slice(0, n)).width + 6 : 0);
    if (((t % 1) + 1) % 1 < .6 || (n > 0 && n < TYPE_TXT.length)) { g.globalAlpha = bp; g.fillStyle = C.acc; g.fillRect(cx, by - 26, 4, 52); g.globalAlpha = 1; }
    const sp = eo(seg(t, SEND_T - .05, SEND_T + .25)), bx = bw / 2 - 120;
    g.save(); g.globalAlpha = bp; rrect(bx - 80, by - 34, 160, 68, 34);
    g.fillStyle = sp > 0 ? `rgba(70,240,196,${.9 * sp})` : 'rgba(0,0,0,0)'; g.fill();
    g.strokeStyle = C.acc; g.lineWidth = 2.5; if (sp > 0) { g.shadowColor = C.acc; g.shadowBlur = 24 * sp; } g.stroke(); g.restore();
    text('评论', bx, by + 1, { size: 32, weight: 700, color: sp > .5 ? C.bg : C.acc, alpha: bp, spacing: 4 });
    text('评论区见', 0, 262, { size: 32, color: C.dim, spacing: 14, alpha: ss(seg(t, SEND_T + .2, SEND_T + .7)) });
  }
}

const DRAW = { hook: shotHook, age: shotAge, early: shotEarly, rule: shotRule, gap: shotTimeline('gap'), resume: shotTimeline('resume'), other: shotTimeline('other'), next: shotTimeline('next'), title: shotTitle, outro: shotOutro, ask: shotAsk };

function captions(t) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  for (const L of TL.lines) {
    if (t < L.t0 - .15 || t > L.t1 + .15) continue;
    const a = Math.min(ss(seg(t, L.t0 - .15, L.t0 + .1)), 1 - ss(seg(t, L.t1 - .1, L.t1 + .15)));
    text(L.text, W / 2, H - 96, { size: 44, weight: 400, color: C.ink, alpha: a, spacing: 2, glow: 12, glowColor: 'rgba(0,0,0,.9)' });
  }
}

window.DUR = TL.DUR;
window.EV = EV;
window.CUES = TL.lines.map(L => ({ t0: +L.t0.toFixed(3), t1: +L.t1.toFixed(3), text: L.text }));
window.SHOTS = TL.shots.map(s => ({ id: s.id, t0: s.t0, t1: s.t1 }));
window.POSTER = S.title.t0 + 2 * BEAT + 3;
window.render = t => {
  t = clamp(t, 0, TL.DUR - 1e-6);
  const { shot, lt } = shotAt(TL.shots, t);
  g.save(); DRAW[shot.id](lt, shot, t); g.restore();
  captions(t);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const fin = seg(t, TL.DUR - .35, TL.DUR);
  if (fin > 0) { g.fillStyle = `rgba(0,0,0,${fin})`; g.fillRect(0, 0, W, H); }
};
window.render(0);
window.READY = true;
