// 数据驱动的镜头引擎：整部片由 lines.json 生成，模板的 film.js 只有一行 `import '/core/deck.js';`
// 每句台词带 "shot" 就开一个新镜头，不带的接在上一个镜头里说；镜头类型和字段见 core/deck-kinds.js 和 docs/lines.md。
// 画面里的条目、数字、答案在配音说到它们的那一刻出现：写了 "hit"（台词里的一个词）就对齐到那个词，没写就按台词均匀分布。
// cta1 / cta2 两句和 "cta" 块交给 core/cta.js。lines.json 里的 "style" 可以改配色（bg ink dim faint line acc warm）。
// 页面约定：window.DUR / render(t) / READY / EV / CUES / SHOTS / POSTER（见 docs/technique.md）
import { clamp, lerp, seg, ss, eio, eo, spring, TAU, layout, shotAt } from './lib.js';
import { makeCTA } from './cta.js';
import { KINDS, BEAT } from './deck-kinds.js';

const W = 1920, H = 1080;
const ZH = '"NotoSansSC", "PingFang SC", "Microsoft YaHei", sans-serif';
const MONO = '"JetBrainsMono", "NotoSansSC", monospace';
const DIGITS = /^[\d\s·.,:%+\-–—/]+$/;

const cv = document.getElementById('c'); cv.width = W; cv.height = H;
const g = cv.getContext('2d');

async function loadJSON(p, fallback) { try { const r = await fetch(p, { cache: 'no-store' }); return r.ok ? await r.json() : fallback; } catch { return fallback; } }
const doc = await loadJSON('lines.json', { lines: [] });
const C = { bg: '#07090d', ink: '#e9edf3', dim: '#667085', faint: '#1b2231', line: '#2a3345', acc: '#46f0c4', warm: '#ffb14a', ...(doc.style || {}) };
const TEXT = Object.fromEntries(doc.lines.map(L => [L.id, L.text]));
const VDUR = await loadJSON('voices/dur.json', {});
const est = id => VDUR[id] ?? Math.max(1.2, (TEXT[id] || '').length / 4.2);

// ———————————————————— 由台词生成镜头 ————————————————————
const GROUPS = [];
for (const L of doc.lines) {
  if (/^cta\d/.test(L.id)) continue;
  if (L.shot || !GROUPS.length) GROUPS.push({ kind: KINDS[L.shot] ? L.shot : 'point', data: L, lines: [] });
  GROUPS.at(-1).lines.push(L);
}
const count = {};
const SHOTS = GROUPS.map((b, i) => {
  const K = KINDS[b.kind];
  let at = K.first;
  const lines = b.lines.map(L => { const x = { id: L.id, at }; at += est(L.id) + .45; return x; });
  const n = count[b.kind] = (count[b.kind] ?? -1) + 1;
  return { id: `s${i}`, kind: b.kind, music: K.music, data: b.data, dur: K.beats * BEAT, lines, n, tail: K.tail };
});
const CTA = doc.cta ? makeCTA(doc.cta, { beat: BEAT, voiceDur: VDUR, text: TEXT, style: { ...C, zh: ZH, mono: MONO } }) : null;
if (CTA) SHOTS.push({ ...CTA.shot, kind: 'cta', music: 'outro' });
const TL = layout(SHOTS, TEXT, VDUR, { quant: 2 * BEAT });
if (CTA) CTA.bind(TL);
const LN = Object.fromEntries(TL.lines.map(L => [L.id, L]));
const POINTS = count.point + 1 || 0;

function speech(s) {
  const ls = s.lines.map(x => LN[x.id]).filter(Boolean);
  if (!ls.length) return { t0: s.t0 + .5, d: 2 };
  return { t0: ls[0].t0, d: ls.at(-1).t0 + ls.at(-1).voice - ls[0].t0 };
}
// 配音说到某个词的时刻（按字数在这句配音里线性估算）；找不到返回 null
function findIn(s, word) {
  if (!word) return null;
  for (const x of s.lines) { const L = LN[x.id]; if (!L) continue; const i = L.text.indexOf(word); if (i >= 0) return { L, i }; }
  return null;
}
const charT = (L, i) => L.t0 + L.voice * clamp(i / Math.max(1, L.text.length));
const wordT = (s, word) => { const f = findIn(s, word); return f ? charT(f.L, f.i) : null; };
// 条目出现时刻：写了 hit 的对齐到那个词，其余在台词里均匀分布，保证先后顺序
function itemTimes(s, items, spread) {
  const n = items.length, sp = s.sp;
  const ts = items.map((it, k) => wordT(s, typeof it === 'object' ? it.hit : null) ?? sp.t0 + sp.d * spread(k, n));
  for (let k = 1; k < n; k++) ts[k] = Math.max(ts[k], ts[k - 1] + .25);
  return ts;
}
const itemText = it => typeof it === 'object' ? it.text ?? it.label ?? '' : String(it);
const num = v => typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
const decimals = v => { const m = String(v).match(/\.(\d+)/); return m ? m[1].length : 0; };
const fmt = (v, dec) => v.toFixed(dec);

for (const s of TL.shots) {
  const d = s.data || {};
  s.sp = speech(s);
  if (s.kind === 'question') s.markT = s.sp.t0 + s.sp.d * .75;
  if (s.kind === 'answer') s.hitT = wordT(s, d.hit) ?? s.sp.t0 + s.sp.d * .35;
  if (s.kind === 'stat') s.hitT = wordT(s, d.hit) ?? s.sp.t0 + s.sp.d * .6;
  if (s.kind === 'point') s.itemT = itemTimes(s, d.items || [], (k, n) => (k + 1) / (n + 1));
  if (s.kind === 'timeline') s.itemT = itemTimes(s, d.items || [], (k, n) => .05 + .85 * k / Math.max(1, n - 1));
  if (s.kind === 'bars') s.itemT = itemTimes(s, d.items || [], (k, n) => .1 + .75 * k / Math.max(1, n - 1));
  if (s.kind === 'quote') {
    const q = d.quote || '', f = findIn(s, q.slice(0, 4));
    s.charT = [...q].map((_, i) => f && f.i + i < f.L.text.length ? charT(f.L, f.i + i) : s.sp.t0 + s.sp.d * .9 * i / Math.max(1, q.length));
  }
}

await Promise.all([`400 40px ${ZH}`, `700 40px ${ZH}`, `800 40px ${ZH}`, `400 40px ${MONO}`, `700 40px ${MONO}`].map(f => document.fonts.load(f, '镜头1')));

// ———————————————————— 事件（音效 / 配音 / 镜头），导出给混音 ————————————————————
const EV = [];
const sfx = (t, name, gain = 1, extra = {}) => EV.push({ t: +t.toFixed(4), type: 'sfx', name, gain, ...extra });
for (const s of TL.shots) EV.push({ t: s.t0, type: 'shot', id: s.id, kind: s.kind, t1: s.t1 });
for (const L of TL.lines) EV.push({ t: L.t0, type: 'voice', id: L.id, d: L.voice });
for (const s of TL.shots) {
  const k = s.kind;
  if (k === 'title') { sfx(s.t0 + .2, 'thump', .4); sfx(s.t0 + .3, 'whoosh', .35, { d: 1.0, lo: 300, hi: 5000 }); }
  if (k === 'question') { sfx(s.t0 + .2, 'thump', .45); sfx(s.markT, 'pop', .5); }
  if (k === 'answer' || k === 'stat') sfx(s.hitT, 'thump', 1.0);
  if (k === 'stat') for (let t = s.sp.t0 + .1; t < s.hitT - .1; t += .12) sfx(t, 'tick', .18);
  if (k === 'point' || k === 'timeline' || k === 'bars') {
    sfx(s.t0 + .02, 'whoosh', .4, { d: .7 });
    if (k === 'point') sfx(s.t0 + .45, 'shutter', .4);
    s.itemT.forEach((t, j) => sfx(t, 'pop', .4, { pan: -.3 + .6 * j / Math.max(1, s.itemT.length - 1) }));
  }
  if (k === 'bars') { const j = barsHi(s); if (j >= 0) sfx(s.itemT[j] + .7, 'ding', .3, { f: 1320 }); }
  if (k === 'quote') sfx(s.t0 + .3, 'whoosh', .3, { d: 1.2, lo: 200, hi: 2500 });
  if (k === 'recap') { sfx(s.t0 - 2.0, 'riser', .6, { d: 2.0 + 2 * BEAT }); sfx(s.t0 + 2 * BEAT, 'boom', 1.0); }
}
if (CTA) CTA.events(sfx);
EV.sort((a, b) => a.t - b.t);

// ———————————————————— 绘制工具 ————————————————————
function cam(c) { g.setTransform(1, 0, 0, 1, 0, 0); g.translate(W / 2, H / 2); g.scale(c.z, c.z); g.translate(-c.x, -c.y); }
function text(s, x, y, { size = 40, font = ZH, weight = 400, color = C.ink, align = 'center', alpha = 1, spacing = 0, glow = 0 } = {}) {
  if (alpha <= 0 || s == null || s === '') return;
  g.save(); g.globalAlpha *= alpha; g.font = `${weight} ${size}px ${font}`; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle';
  g.letterSpacing = spacing + 'px'; if (glow) { g.shadowColor = color; g.shadowBlur = glow; }
  g.fillText(s, x, y); g.restore();
}
// 字号：不超过 max，且整行宽不超过 maxW
function fit(s, max, maxW, { weight = 700, font = ZH, spacing = 0 } = {}) {
  if (!s) return max;
  g.save(); g.font = `${weight} 100px ${font}`; g.letterSpacing = '0px'; const w = g.measureText(s).width; g.restore();
  return Math.min(max, 100 * (maxW - spacing * [...s].length) / w);
}
const fontFor = s => DIGITS.test(s || '') ? MONO : ZH;
function rrect(x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
function background(c) {
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
  const zz = lerp(1, c.z, .45); g.setTransform(zz, 0, 0, zz, W / 2 - c.x * .45 * zz, H / 2 - c.y * .45 * zz);
  g.fillStyle = C.faint; const step = 80, hw = W / 2 / zz + step, hh = H / 2 / zz + step;
  for (let x = Math.floor((c.x * .45 - hw) / step) * step; x < c.x * .45 + hw; x += step)
    for (let y = Math.floor((c.y * .45 - hh) / step) * step; y < c.y * .45 + hh; y += step) g.fillRect(x - 1.5, y - 1.5, 3, 3);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const v = g.createRadialGradient(W / 2, H / 2, H * .25, W / 2, H / 2, H * .95);
  v.addColorStop(0, 'rgba(7,9,13,0)'); v.addColorStop(1, 'rgba(3,4,6,.85)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
}
// 一行字逐字升起（片名、收束）
function riseChars(str, y, px, after, { weight = 800, color = C.ink } = {}) {
  const chars = [...(str || '')];
  g.save(); g.font = `${weight} ${px}px ${ZH}`; g.letterSpacing = '0px'; const ws = chars.map(ch => g.measureText(ch).width); g.restore();
  const sp = px * .12, tw = ws.reduce((a, b) => a + b, 0) + sp * (chars.length - 1); let x = -tw / 2;
  chars.forEach((ch, i) => {
    const p = eo(seg(after, .05 + i * .07, .65 + i * .07));
    text(ch, x + ws[i] / 2, y + lerp(90, 0, p), { size: px, weight, color, alpha: p }); x += ws[i] + sp;
  });
  return tw;
}
function pill(str, x, y, { size = 34, color = C.warm, alpha = 1, radius = 30, h = 60 } = {}) {
  if (!str || alpha <= 0) return;
  g.save(); g.font = `700 ${size}px ${fontFor(str)}`; g.letterSpacing = '4px'; const w = g.measureText(str).width + 56; g.restore();
  g.save(); g.globalAlpha = alpha; rrect(x - w / 2, y - h / 2, w, h, radius); g.strokeStyle = color; g.lineWidth = 2.5; g.stroke(); g.restore();
  text(str, x, y + 1, { size, weight: 700, font: fontFor(str), color, alpha, spacing: 4 });
}
const fadeOut = (lt, s) => 1 - ss(seg(lt, s.dur - .45, s.dur));

// ———————————————————— 镜头 ————————————————————
function drawTitle(lt, s) {
  const d = s.data;
  const c = { x: 0, y: 0, z: lerp(1.05, 1, eo(seg(lt, 0, 2.5))) };
  background(c); cam(c);
  const out = fadeOut(lt, s);
  g.save(); g.globalAlpha = out;
  text(d.kicker, 0, -200, { size: 32, font: MONO, color: C.dim, spacing: 14, alpha: ss(seg(lt, .2, .8)) });
  const px = fit(d.title, 190, 1500, { weight: 800 });
  const tw = riseChars(d.title, -40, px, lt - .35);
  const k = eio(seg(lt, .6, 1.6));
  g.save(); g.strokeStyle = C.acc; g.lineWidth = 4; g.shadowColor = C.acc; g.shadowBlur = 24;
  const lw = (tw + 120) * k; g.beginPath(); g.moveTo(-lw / 2, px * .62); g.lineTo(lw / 2, px * .62); g.stroke(); g.restore();
  text(d.sub, 0, px * .62 + 90, { size: 40, font: fontFor(d.sub), color: C.dim, spacing: 6, alpha: ss(seg(lt, 1.4, 2)) });
  g.restore();
}

function drawQuestion(lt, s) {
  const d = s.data, t = s.t0 + lt;
  const c = { x: 0, y: 0, z: lerp(1, 1.07, ss(lt / s.dur)) };
  background(c); cam(c);
  const a = ss(seg(lt, .15, .7)), out = fadeOut(lt, s);
  const big = d.big ?? (d.text || '').replace(/[？?。！!]+$/, '');
  if (big) {
    text(d.sub, 0, -330, { size: 34, font: MONO, color: C.dim, spacing: 22, alpha: a * out });
    text(big, 0, -140, { size: fit(big, 250, 1400), weight: 700, font: fontFor(big), alpha: a * out, spacing: 6 });
  }
  const m = t - s.markT, p = m > 0 ? clamp(spring(m, 9, .45), 0, 1.3) : 0;
  const pulse = 1 + .03 * Math.sin(lt * TAU * .8);
  g.save(); g.translate(0, big ? 150 : -30); g.scale(p * pulse, p * pulse);
  text('?', 0, 0, { size: big ? 200 : 420, weight: 800, font: MONO, color: C.warm, glow: 40, alpha: out });
  g.restore();
}

function waitingDot(lt) {
  const p = 6 + 3 * Math.sin(lt * TAU * 1.2);
  g.fillStyle = C.ink; g.globalAlpha = seg(lt, 0, .3); g.beginPath(); g.arc(0, -40, p, 0, TAU); g.fill(); g.globalAlpha = 1;
}
const shake = a => { const sh = a > 0 ? 14 * Math.exp(-a * 7) : 0; return { x: sh * Math.sin(a * 83), y: sh * Math.cos(a * 61) }; };

function drawAnswer(lt, s) {
  const d = s.data, a = s.t0 + lt - s.hitT;
  const c = { ...shake(a), z: 1 + .03 * seg(lt, 0, s.dur) };
  background(c); cam(c);
  if (a < 0) return waitingDot(lt);
  const sc = lerp(1.6, 1, clamp(spring(a, 10, .45)));
  const big = d.big || '';
  g.save(); g.translate(0, -60); g.scale(sc, sc);
  text(big, 0, 0, { size: fit(big, DIGITS.test(big) ? 300 : 230, 1500, { weight: 800, font: fontFor(big) }), weight: 800, font: fontFor(big), color: C.warm, glow: 40 * Math.exp(-a * 3) });
  g.restore();
  text(d.unit, 0, 130, { size: 48, weight: 700, color: C.warm, alpha: ss(seg(a, .2, .5)) });
  pill(d.tag, 0, d.unit ? 220 : 170, { alpha: ss(seg(a, .5, .8)) });
}

function drawStat(lt, s) {
  const d = s.data, t = s.t0 + lt, a = t - s.hitT;
  const c = { ...shake(a * 1.3), z: 1 + .04 * ss(seg(lt, 0, s.dur)) };
  background(c); cam(c);
  const target = num(d.value), dec = decimals(d.value);
  const p = eo(seg(t, s.sp.t0, s.hitT));
  const str = a >= 0 ? String(d.value) : fmt(target * p, dec);
  const size = fit(String(d.value), 320, 1400, { weight: 800, font: MONO });
  const sc = a >= 0 ? lerp(1.25, 1, clamp(spring(a, 10, .45))) : 1;
  g.save(); g.translate(0, -80); g.scale(sc, sc);
  text(str, 0, 0, { size, weight: 800, font: MONO, color: a >= 0 ? C.acc : C.ink, glow: a >= 0 ? 16 + 40 * Math.exp(-a * 3) : 0, alpha: ss(seg(lt, .1, .5)) });
  g.restore();
  text(d.unit, 0, -80 + size * .5 + 50, { size: 52, weight: 700, color: a >= 0 ? C.acc : C.dim, alpha: ss(seg(lt, .3, .8)) });
  text(d.label, 0, -80 + size * .5 + 150, { size: fit(d.label, 42, 1500, { weight: 400 }), color: C.dim, spacing: 2, alpha: ss(seg(a, .3, .8)) });
}

// 要点排在一条横向的轨道上，镜头从上一个要点横移过来
const PX = 2200;
function pointPanel(s, t) {
  const d = s.data, x0 = s.n * PX, lt = t - s.t0;
  const st = ss(seg(lt, .45, .7));
  if (d.kicker) {
    g.save(); g.font = `700 36px ${fontFor(d.kicker)}`; g.letterSpacing = '4px'; const w = g.measureText(d.kicker).width + 60; g.restore();
    g.save(); g.globalAlpha *= st; rrect(x0 - w / 2, -356, w, 68, 8); g.strokeStyle = C.dim; g.lineWidth = 2; g.stroke(); g.restore();
    text(d.kicker, x0, -321, { size: 36, weight: 700, font: fontFor(d.kicker), alpha: st, spacing: 4 });
  }
  const ta = eo(seg(lt, .6, 1.1));
  text(d.title, x0, -190 + 30 * (1 - ta), { size: fit(d.title, 84, 1560, { weight: 800 }), weight: 800, alpha: ta, spacing: 4 });
  (d.items || []).forEach((it, k, arr) => {
    const p = eo(seg(t, s.itemT[k] - .1, s.itemT[k] + .35)), last = k === arr.length - 1, str = itemText(it);
    text(str, x0, -30 + k * 118 + 26 * (1 - p), { size: fit(str, 60, 1560, { font: fontFor(str) }), weight: 700, font: fontFor(str), color: last ? C.acc : C.ink, alpha: p, glow: last ? 20 * p : 0 });
  });
  text(`${String(s.n + 1).padStart(2, '0')} / ${String(POINTS).padStart(2, '0')}`, x0 - 820, -440, { size: 26, font: MONO, color: C.dim, align: 'left', alpha: st });
}
function drawPoint(lt, s) {
  const prev = TL.shots.find(x => x.kind === 'point' && x.n === s.n - 1);
  const joined = prev && prev.t1 === s.t0;
  const k = eio(seg(lt, 0, .8)), fromX = joined ? prev.n * PX : s.n * PX - PX * .6;
  const c = { x: lerp(fromX, s.n * PX, k), y: 0, z: lerp(.92, 1, k) + .03 * ss(seg(lt, .8, s.dur)) };
  background(c); cam(c);
  const t = s.t0 + lt;
  if (joined && k < 1) { g.save(); g.globalAlpha = 1 - k; pointPanel(prev, prev.t1 - 1e-3); g.restore(); }
  pointPanel(s, t);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const bw = 60, gap = 14, x0 = W / 2 - (POINTS * bw + (POINTS - 1) * gap) / 2;
  for (let i = 0; i < POINTS; i++) {
    g.fillStyle = i < s.n ? C.dim : i === s.n ? C.acc : C.line;
    g.fillRect(x0 + i * (bw + gap), 880, i === s.n ? bw * clamp(k + .2) : bw, 4);
  }
}

// 时间线：条目横向排开，镜头跟着讲到的那一条走，讲完拉远看全貌
const TX = 560;
function drawTimeline(lt, s) {
  const d = s.data, items = d.items || [], n = items.length, t = s.t0 + lt;
  const span = (n - 1) * TX, xs = items.map((_, k) => -span / 2 + k * TX);
  let cur = -1; s.itemT.forEach((it, k) => { if (t >= it - .15) cur = k; });
  let fx = xs[0] + TX * s.itemT.slice(1).reduce((a, it) => a + eio(seg(t, it - .6, it + .2)), 0);
  const lim = Math.max(0, span / 2 - 640); fx = clamp(fx, -lim, lim);
  const lastL = LN[s.lines.at(-1)?.id], end = lastL ? lastL.t0 + lastL.voice : s.t1 - 2;
  const zOut = eio(seg(t, end + .2, end + 1.4));
  const zAll = Math.min(1, 1760 / (span + 480));
  const c = { x: lerp(fx, 0, zOut), y: 60 * zOut, z: lerp(1, zAll, zOut) * (1 + .02 * ss(seg(lt, 0, s.dur))) };
  background(c); cam(c);
  const out = fadeOut(lt, s);
  g.save(); g.globalAlpha = out;
  const y = 40, ax = ss(seg(lt, .1, .9));
  g.strokeStyle = C.line; g.lineWidth = 3; g.beginPath(); g.moveTo(xs[0] - 260, y); g.lineTo(lerp(xs[0] - 260, xs.at(-1) + 260, ax), y); g.stroke();
  if (cur >= 0) {
    const px = lerp(cur > 0 ? xs[cur - 1] : xs[0] - 260, xs[cur], eo(seg(t, s.itemT[cur] - .15, s.itemT[cur] + .35)));
    g.save(); g.strokeStyle = C.acc; g.lineWidth = 4; g.shadowColor = C.acc; g.shadowBlur = 16; g.beginPath(); g.moveTo(xs[0] - 260, y); g.lineTo(px, y); g.stroke(); g.restore();
  }
  items.forEach((it, k) => {
    const p = eo(seg(t, s.itemT[k] - .1, s.itemT[k] + .4)), on = k === cur, x = xs[k];
    if (p <= 0) { g.fillStyle = C.line; g.beginPath(); g.arc(x, y, 7, 0, TAU); g.fill(); return; }
    const a = t - s.itemT[k];
    if (a > 0 && a < .8) { g.save(); g.strokeStyle = C.acc; g.globalAlpha *= 1 - a / .8; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 10 + 60 * eo(a / .8), 0, TAU); g.stroke(); g.restore(); }
    g.save(); g.fillStyle = on ? C.acc : C.ink; if (on) { g.shadowColor = C.acc; g.shadowBlur = 20; } g.beginPath(); g.arc(x, y, 11 * p, 0, TAU); g.fill(); g.restore();
    const year = String(it.year ?? '');
    text(year, x, y - 90 + 30 * (1 - p), { size: fit(year, 76, TX - 60, { font: MONO }), weight: 700, font: MONO, color: on ? C.acc : C.ink, alpha: p, glow: on ? 14 : 0 });
    const lines = String(it.label ?? '').split('\n');
    lines.forEach((ln, j) => text(ln, x, y + 100 + j * 58 + 20 * (1 - p), { size: fit(ln, 44, TX - 50), weight: 700, color: on ? C.ink : C.dim, alpha: p }));
  });
  g.restore();
  g.setTransform(1, 0, 0, 1, 0, 0);
  text(d.title, W / 2, 150, { size: fit(d.title, 56, 1500, { weight: 800 }), weight: 800, alpha: ss(seg(lt, .3, .9)) * out, spacing: 4 });
}

function barsHi(s) {
  const items = s.data.items || [];
  if (!items.length) return -1;
  if (s.data.highlight) return items.findIndex(it => it.label === s.data.highlight);
  let j = 0; items.forEach((it, k) => { if (num(it.value) > num(items[j].value)) j = k; });
  return j;
}
function drawBars(lt, s) {
  const d = s.data, items = d.items || [], n = items.length, t = s.t0 + lt;
  const c = { x: 0, y: 0, z: lerp(.97, 1.02, ss(seg(lt, 0, s.dur))) };
  background(c); cam(c);
  const out = fadeOut(lt, s), hi = barsHi(s);
  const max = Math.max(...items.map(it => num(it.value)), 1e-9);
  const rowH = Math.min(116, 620 / Math.max(1, n)), y0 = 70 - (n - 1) * rowH / 2, bx = -440, bl = 1060;
  const labW = Math.max(...items.map(it => { g.save(); g.font = `700 44px ${ZH}`; const w = g.measureText(it.label || '').width; g.restore(); return w; }), 1);
  const labSize = Math.min(44, 44 * 400 / labW, rowH * .42);
  g.save(); g.globalAlpha = out;
  text(d.title, 0, -400, { size: fit(d.title, 64, 1600, { weight: 800 }), weight: 800, alpha: ss(seg(lt, .2, .7)), spacing: 4 });
  text(d.unit, 0, -320, { size: 30, font: fontFor(d.unit), color: C.dim, spacing: 6, alpha: ss(seg(lt, .5, 1)) });
  items.forEach((it, k) => {
    const y = y0 + k * rowH, tk = s.itemT[k], on = k === hi;
    const la = ss(seg(t, tk - .35, tk)), p = eio(seg(t, tk - .05, tk + .75));
    const v = num(it.value), len = Math.max(6, bl * v / max) * p, bh = rowH * .44;
    text(it.label, bx - 36, y, { size: labSize, weight: 700, font: fontFor(it.label), color: on ? C.ink : C.dim, align: 'right', alpha: Math.max(.25, la) });
    g.fillStyle = C.faint; rrect(bx, y - bh / 2, bl, bh, bh / 2); g.fill();
    if (p > 0) {
      g.save(); g.fillStyle = on ? C.acc : C.ink; g.globalAlpha *= on ? 1 : .72; if (on) { g.shadowColor = C.acc; g.shadowBlur = 24; }
      rrect(bx, y - bh / 2, len, bh, bh / 2); g.fill(); g.restore();
      text(fmt(v * p, decimals(it.value)), bx + len + 26, y + 2, { size: Math.min(40, rowH * .38), weight: 700, font: MONO, color: on ? C.acc : C.ink, align: 'left', alpha: ss(seg(p, .1, .4)) });
    }
  });
  g.restore();
}

// 引语：跟着配音逐字亮起，长句按标点折行
function wrap(str, max) {
  const out = []; let cur = '';
  for (const ch of str) {
    cur += ch;
    if ([...cur].length >= max || ([...cur].length >= max - 5 && /[，。；：！？、,.;:!?]/.test(ch))) { out.push(cur); cur = ''; }
  }
  if (cur) out.push(cur);
  return out;
}
function drawQuote(lt, s) {
  const d = s.data, t = s.t0 + lt, q = d.quote || '';
  const c = { x: 0, y: 0, z: lerp(1, 1.05, ss(seg(lt, 0, s.dur))) };
  background(c); cam(c);
  const out = fadeOut(lt, s);
  const per = q.length > 24 ? 14 : 12, rows = wrap(q, per), size = Math.min(88, 1500 / per);
  const top = -(rows.length - 1) * size * .72 - 40;
  g.save(); g.font = `700 ${size}px ${ZH}`; g.letterSpacing = '0px'; const widest = Math.max(...rows.map(r => g.measureText(r).width)); g.restore();
  g.save(); g.globalAlpha = out;
  text('“', -widest / 2 - size * .95, top - size * .35, { size: size * 2.4, weight: 800, color: C.warm, alpha: ss(seg(lt, .1, .6)), glow: 20 });
  let i = 0;
  rows.forEach((row, r) => {
    const chars = [...row];
    g.save(); g.font = `700 ${size}px ${ZH}`; g.letterSpacing = '0px'; const ws = chars.map(ch => g.measureText(ch).width); g.restore();
    let x = -ws.reduce((a, b) => a + b, 0) / 2;
    chars.forEach((ch, j) => {
      const a = seg(t, s.charT[i] - .05, s.charT[i] + .25);
      text(ch, x + ws[j] / 2, top + r * size * 1.45, { size, weight: 700, color: a >= 1 ? C.ink : C.dim, alpha: .18 + .82 * a });
      x += ws[j]; i++;
    });
  });
  const endT = s.charT.at(-1) ?? s.sp.t0;
  text(d.by ? '—— ' + d.by : '', 0, top + rows.length * size * 1.45 + 40, { size: 36, color: C.dim, spacing: 4, alpha: ss(seg(t, endT, endT + .6)) });
  g.restore();
}

function drawRecap(lt, s) {
  const d = s.data, rev = 2 * BEAT, after = lt - rev;
  const c = { x: 0, y: 0, z: lerp(1, 1.04, ss(seg(lt, rev, s.dur))) };
  background(c); cam(c);
  const k = eio(seg(lt, 0, rev));
  g.save(); g.strokeStyle = k > .6 ? C.acc : C.line; g.lineWidth = 4; g.shadowColor = C.acc; g.shadowBlur = after > 0 ? 26 + 60 * Math.exp(-after * 4) : 20 * k;
  const lw = lerp(W, 1100, k); g.beginPath(); g.moveTo(-lw / 2, 110); g.lineTo(lw / 2, 110); g.stroke(); g.restore();
  if (after >= 0) {
    riseChars(d.title, -30, fit(d.title, 170, 1500, { weight: 800 }), after);
    text(d.sub, 0, 200, { size: 36, font: fontFor(d.sub), color: C.acc, spacing: 8, alpha: ss(seg(after, .9, 1.5)) });
  }
  if (after >= 0 && after < .25) { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = `rgba(210,255,240,${.18 * (1 - after / .25) ** 2})`; g.fillRect(0, 0, W, H); }
}

const DRAW = { title: drawTitle, question: drawQuestion, answer: drawAnswer, stat: drawStat, point: drawPoint, timeline: drawTimeline, bars: drawBars, quote: drawQuote, recap: drawRecap };
DRAW.cta = (lt, s) => {
  const prev = TL.shots[TL.shots.length - 2], k = ss(seg(lt, 0, .5));
  if (k < 1 && prev) { g.save(); DRAW[prev.kind](prev.dur - 1e-3, prev); g.restore(); }
  const c = { x: 0, y: 0, z: lerp(1, 1.05, ss(lt / s.dur)) };
  g.save(); g.globalAlpha = k; background(c); g.restore();
  cam(c); CTA.draw(g, lt, s);
};

function captions(t) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  for (const L of TL.lines) {
    if (t < L.t0 - .1 || t > L.t1) continue;
    const a = Math.min(ss(seg(t, L.t0 - .1, L.t0 + .1)), 1 - ss(seg(t, L.t1 - .15, L.t1)));
    text(L.text, W / 2, H - 96, { size: fit(L.text, 44, 1720, { weight: 400 }), color: C.ink, alpha: a, spacing: 2 });
  }
}

const recap = TL.shots.find(s => s.kind === 'recap'), title = TL.shots.find(s => s.kind === 'title');
window.DUR = TL.DUR;
window.EV = EV;
window.CUES = TL.lines.map(L => ({ t0: +L.t0.toFixed(3), t1: +L.t1.toFixed(3), text: L.text }));
window.SHOTS = TL.shots.map(s => ({ id: s.id, kind: s.kind, music: s.music, t0: s.t0, t1: s.t1 }));
window.POSTER = recap ? recap.t0 + 2 * BEAT + 2.5 : title ? title.t0 + 3 : TL.DUR / 2;
window.render = t => {
  t = clamp(t, 0, TL.DUR - 1e-6);
  const { shot, lt } = shotAt(TL.shots, t);
  g.save(); DRAW[shot.kind](lt, shot); g.restore();
  captions(t);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const fin = seg(t, TL.DUR - .35, TL.DUR);
  if (fin > 0) { g.fillStyle = `rgba(0,0,0,${fin})`; g.fillRect(0, 0, W, H); }
};
window.render(0);
window.READY = true;
