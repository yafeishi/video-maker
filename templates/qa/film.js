// 问答讲解模板：疑问 → 答案 → 分点解释 → 收束 → 结尾互动（见 docs/directing.md §3「问答式讲解」）
// 镜头由 lines.json 生成：带 "shot" 的台词开一个新镜头（question / answer / point / recap），不带的接在上一个镜头里；
// cta1 / cta2 两句和 "cta" 块交给 core/cta.js。改讲什么只需要改 lines.json，改怎么画才动这个文件。
// 页面约定：window.DUR / window.render(t) / window.READY / window.EV / window.CUES（见 docs/technique.md）
import { clamp, lerp, seg, ss, eio, eo, ei, spring, hash, TAU, layout, shotAt } from '/core/lib.js';
import { makeCTA } from '/core/cta.js';

const W = 1920, H = 1080;
const C = { bg: '#07090d', ink: '#e9edf3', dim: '#667085', faint: '#1b2231', line: '#2a3345', acc: '#46f0c4', warm: '#ffb14a' };
const ZH = '"NotoSansSC", "PingFang SC", "Microsoft YaHei", sans-serif';
const MONO = '"JetBrainsMono", "NotoSansSC", monospace';
const BPM = 100, BEAT = 60 / BPM;
const DIGITS = /^[\d\s·.:%\-–/]+$/;

const cv = document.getElementById('c'); cv.width = W; cv.height = H;
const g = cv.getContext('2d');

async function loadJSON(p, fallback) { try { const r = await fetch(p, { cache: 'no-store' }); return r.ok ? await r.json() : fallback; } catch { return fallback; } }
const linesDoc = await loadJSON('lines.json', { lines: [] });
const TEXT = Object.fromEntries(linesDoc.lines.map(L => [L.id, L.text]));
const VDUR = await loadJSON('voices/dur.json', {});
const est = id => VDUR[id] ?? Math.max(1.2, (TEXT[id] || '').length / 4.2);

// ———————————————————— 由台词生成镜头 ————————————————————
const MIN_BEATS = { question: 8, answer: 8, point: 10, recap: 12 };
const FIRST_AT = { question: 1.2, answer: .5, point: .7, recap: 2 * BEAT + .5 };
const BEATS = [];
for (const L of linesDoc.lines) {
  if (/^cta\d/.test(L.id)) continue;
  if (L.shot || !BEATS.length) BEATS.push({ kind: MIN_BEATS[L.shot] ? L.shot : 'point', data: L, lines: [] });
  BEATS.at(-1).lines.push(L);
}
let pointN = 0;
const SHOTS = BEATS.map((b, i) => {
  let at = FIRST_AT[b.kind];
  const lines = b.lines.map(L => { const x = { id: L.id, at }; at += est(L.id) + .45; return x; });
  return { id: `s${i}`, kind: b.kind, data: b.data, dur: MIN_BEATS[b.kind] * BEAT, lines, point: b.kind === 'point' ? pointN++ : -1 };
});
const POINTS = pointN;
const CTA = linesDoc.cta ? makeCTA(linesDoc.cta, { beat: BEAT, voiceDur: VDUR, text: TEXT, style: { ...C, zh: ZH, mono: MONO } }) : null;
if (CTA) SHOTS.push({ ...CTA.shot, kind: 'cta' });
const TL = layout(SHOTS, TEXT, VDUR, { quant: 2 * BEAT });
if (CTA) CTA.bind(TL);
const LN = Object.fromEntries(TL.lines.map(L => [L.id, L]));
// 一个镜头里所有台词的起止，用来把要点、答案落在说到它们的时候
function speech(s) {
  const ls = s.lines.map(x => LN[x.id]).filter(Boolean);
  if (!ls.length) return { t0: s.t0 + .5, d: 2 };
  return { t0: ls[0].t0, d: ls.reduce((a, L) => a + L.voice, 0) + .45 * (ls.length - 1) };
}
for (const s of TL.shots) {
  const sp = speech(s), d = s.data || {};
  s.sp = sp;
  if (s.kind === 'answer') { const k = d.hit && d.text.includes(d.hit) ? d.text.indexOf(d.hit) / d.text.length : .35; s.hitT = sp.t0 + sp.d * k; }
  if (s.kind === 'point') s.itemT = (d.items || []).map((_, k, a) => sp.t0 + sp.d * (k + 1) / (a.length + 1));
  if (s.kind === 'question') s.markT = sp.t0 + sp.d * .75;
}
const recap = TL.shots.find(s => s.kind === 'recap');

await Promise.all([`400 40px ${ZH}`, `700 40px ${ZH}`, `800 40px ${ZH}`, `400 40px ${MONO}`, `700 40px ${MONO}`].map(f => document.fonts.load(f, '问答1')));

// ———————————————————— 事件（音效 / 配音 / 镜头），导出给混音 ————————————————————
const EV = [];
const sfx = (t, name, gain = 1, extra = {}) => EV.push({ t: +t.toFixed(4), type: 'sfx', name, gain, ...extra });
for (const s of TL.shots) EV.push({ t: s.t0, type: 'shot', id: s.id, kind: s.kind, t1: s.t1 });
for (const L of TL.lines) EV.push({ t: L.t0, type: 'voice', id: L.id, d: L.voice });
for (const s of TL.shots) {
  if (s.kind === 'question') { sfx(s.t0 + .2, 'thump', .45); sfx(s.markT, 'pop', .5); }
  if (s.kind === 'answer') sfx(s.hitT, 'thump', 1.0);
  if (s.kind === 'point') {
    sfx(s.t0 + .02, 'whoosh', .4, { d: .7 });
    sfx(s.t0 + .45, 'shutter', .4);
    s.itemT.forEach((t, k) => sfx(t, 'pop', .4, { pan: -.3 + .3 * k }));
  }
  if (s.kind === 'recap') { sfx(s.t0 - 2.0, 'riser', .6, { d: 2.0 + 2 * BEAT }); sfx(s.t0 + 2 * BEAT, 'boom', 1.0); }
}
if (CTA) CTA.events(sfx);
EV.sort((a, b) => a.t - b.t);

// ———————————————————— 绘制工具 ————————————————————
function cam(c) { g.setTransform(1, 0, 0, 1, 0, 0); g.translate(W / 2, H / 2); g.scale(c.z, c.z); g.translate(-c.x, -c.y); }
function text(s, x, y, { size = 40, font = ZH, weight = 400, color = C.ink, align = 'center', alpha = 1, spacing = 0, glow = 0 } = {}) {
  if (alpha <= 0 || !s) return;
  g.save(); g.globalAlpha *= alpha; g.font = `${weight} ${size}px ${font}`; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle';
  g.letterSpacing = spacing + 'px'; if (glow) { g.shadowColor = color; g.shadowBlur = glow; }
  g.fillText(s, x, y); g.restore();
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

// ———————————————————— 四种镜头 ————————————————————
function drawQuestion(lt, s) {
  const d = s.data, t = s.t0 + lt;
  const c = { x: 0, y: 0, z: lerp(1, 1.07, ss(lt / s.dur)) };
  background(c); cam(c);
  const a = ss(seg(lt, .15, .7)), out = 1 - ss(seg(lt, s.dur - .5, s.dur));
  const big = d.big ?? (d.text || '').replace(/[？?。！!]+$/, '');
  if (big) {
    const size = Math.min(250, 1380 / [...big].length);
    text(d.sub, 0, -330, { size: 34, font: MONO, color: C.dim, spacing: 22, alpha: a * out });
    text(big, 0, -140, { size, weight: 700, font: fontFor(big), alpha: a * out, spacing: 6 });
  }
  const m = t - s.markT, p = m > 0 ? clamp(spring(m, 9, .45), 0, 1.3) : 0;
  const pulse = 1 + .03 * Math.sin(lt * TAU * .8);
  g.save(); g.translate(0, big ? 150 : -30); g.scale(p * pulse, p * pulse);
  text('?', 0, 0, { size: big ? 200 : 420, weight: 800, font: MONO, color: C.warm, glow: 40, alpha: out });
  g.restore();
}

function drawAnswer(lt, s) {
  const d = s.data, a = s.t0 + lt - s.hitT;
  const sh = a > 0 ? 14 * Math.exp(-a * 7) : 0;
  const c = { x: sh * Math.sin(a * 83), y: sh * Math.cos(a * 61), z: 1 + .03 * seg(lt, 0, s.dur) };
  background(c); cam(c);
  if (a < 0) { const p = 6 + 3 * Math.sin(lt * TAU * 1.2); g.fillStyle = C.ink; g.globalAlpha = seg(lt, 0, .3); g.beginPath(); g.arc(0, -40, p, 0, TAU); g.fill(); g.globalAlpha = 1; return; }
  const sc = lerp(1.6, 1, clamp(spring(a, 10, .45)));
  g.save(); g.translate(0, -60); g.scale(sc, sc);
  text(d.big || '', 0, 0, { size: DIGITS.test(d.big || '') ? 300 : 230, weight: 800, font: fontFor(d.big), color: C.warm, glow: 40 * Math.exp(-a * 3) });
  g.restore();
  text(d.unit, 0, 130, { size: 48, weight: 700, color: C.warm, alpha: ss(seg(a, .2, .5)) });
  const ta = ss(seg(a, .5, .8));
  if (d.tag && ta > 0) {
    g.save(); g.font = `700 34px ${ZH}`; g.letterSpacing = '4px'; const w = g.measureText(d.tag).width + 56; g.restore();
    const y = d.unit ? 220 : 170;
    g.save(); g.globalAlpha = ta; rrect(-w / 2, y - 30, w, 60, 30); g.strokeStyle = C.warm; g.lineWidth = 2.5; g.stroke(); g.restore();
    text(d.tag, 0, y + 1, { size: 34, weight: 700, color: C.warm, alpha: ta, spacing: 4 });
  }
}

// 要点排在一条横向的轨道上，镜头从上一个要点横移过来
const PX = 2200;
function pointPanel(s, t) {
  const d = s.data, x0 = s.point * PX, lt = t - s.t0;
  const st = ss(seg(lt, .45, .7));
  if (d.kicker) {
    g.save(); g.font = `700 36px ${fontFor(d.kicker)}`; g.letterSpacing = '4px'; const w = g.measureText(d.kicker).width + 60; g.restore();
    g.save(); g.globalAlpha = st; rrect(x0 - w / 2, -356, w, 68, 8); g.strokeStyle = C.dim; g.lineWidth = 2; g.stroke(); g.restore();
    text(d.kicker, x0, -321, { size: 36, weight: 700, font: fontFor(d.kicker), alpha: st, spacing: 4 });
  }
  const ta = eo(seg(lt, .6, 1.1));
  text(d.title, x0, -190 + 30 * (1 - ta), { size: 84, weight: 800, alpha: ta, spacing: 4 });
  (d.items || []).forEach((it, k, arr) => {
    const p = eo(seg(t, s.itemT[k] - .1, s.itemT[k] + .35)), last = k === arr.length - 1;
    text(it, x0, -30 + k * 118 + 26 * (1 - p), { size: 60, weight: 700, font: fontFor(it), color: last ? C.acc : C.ink, alpha: p, glow: last ? 20 * p : 0 });
  });
  text(`${String(s.point + 1).padStart(2, '0')} / ${String(POINTS).padStart(2, '0')}`, x0 - 820, -440, { size: 26, font: MONO, color: C.dim, align: 'left', alpha: st });
}
function drawPoint(lt, s) {
  const prev = TL.shots.find(x => x.kind === 'point' && x.point === s.point - 1);
  const k = eio(seg(lt, 0, .8)), fromX = prev ? prev.point * PX : s.point * PX - PX * .6;
  const c = { x: lerp(fromX, s.point * PX, k), y: 0, z: lerp(.92, 1, k) + .03 * ss(seg(lt, .8, s.dur)) };
  background(c); cam(c);
  const t = s.t0 + lt;
  if (prev && k < 1) { g.save(); g.globalAlpha = 1 - k; pointPanel(prev, prev.t1 - 1e-3); g.restore(); }
  pointPanel(s, t);
  // 底部进度：几个要点讲到第几个
  g.setTransform(1, 0, 0, 1, 0, 0);
  const bw = 60, gap = 14, x0 = W / 2 - (POINTS * bw + (POINTS - 1) * gap) / 2;
  for (let i = 0; i < POINTS; i++) {
    g.fillStyle = i < s.point ? C.dim : i === s.point ? C.acc : C.line;
    g.fillRect(x0 + i * (bw + gap), 880, i === s.point ? bw * clamp(k + .2) : bw, 4);
  }
}

function drawRecap(lt, s) {
  const d = s.data, rev = 2 * BEAT, after = lt - rev;
  const c = { x: 0, y: 0, z: lerp(1, 1.04, ss(seg(lt, rev, s.dur))) };
  background(c); cam(c);
  const k = eio(seg(lt, 0, rev));
  g.save(); g.strokeStyle = k > .6 ? C.acc : C.line; g.lineWidth = 4; g.shadowColor = C.acc; g.shadowBlur = after > 0 ? 26 + 60 * Math.exp(-after * 4) : 20 * k;
  const lw = lerp(W, 1100, k); g.beginPath(); g.moveTo(-lw / 2, 110); g.lineTo(lw / 2, 110); g.stroke(); g.restore();
  if (after >= 0) {
    const chars = [...(d.title || '')], px = chars.length > 7 ? 130 : 170;
    g.save(); g.font = `800 ${px}px ${ZH}`; g.letterSpacing = '0px'; const ws = chars.map(ch => g.measureText(ch).width); g.restore();
    const sp = px * .12, tw = ws.reduce((a, b) => a + b, 0) + sp * (chars.length - 1); let x = -tw / 2;
    chars.forEach((ch, i) => {
      const p = eo(seg(after, .05 + i * .07, .65 + i * .07));
      text(ch, x + ws[i] / 2, lerp(60, -30, p), { size: px, weight: 800, alpha: p }); x += ws[i] + sp;
    });
    text(d.sub, 0, 200, { size: 36, font: fontFor(d.sub), color: C.acc, spacing: 8, alpha: ss(seg(after, .9, 1.5)) });
  }
  if (after >= 0 && after < .25) { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = `rgba(210,255,240,${.18 * (1 - after / .25) ** 2})`; g.fillRect(0, 0, W, H); }
}

const DRAW = { question: drawQuestion, answer: drawAnswer, point: drawPoint, recap: drawRecap };
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
    if (t < L.t0 - .15 || t > L.t1 + .15) continue;
    const a = Math.min(ss(seg(t, L.t0 - .15, L.t0 + .1)), 1 - ss(seg(t, L.t1 - .1, L.t1 + .15)));
    text(L.text, W / 2, H - 96, { size: 44, color: C.ink, alpha: a, spacing: 2 });
  }
}

window.DUR = TL.DUR;
window.EV = EV;
window.CUES = TL.lines.map(L => ({ t0: +L.t0.toFixed(3), t1: +L.t1.toFixed(3), text: L.text }));
window.SHOTS = TL.shots.map(s => ({ id: s.id, kind: s.kind, t0: s.t0, t1: s.t1 }));
window.POSTER = recap ? recap.t0 + 2 * BEAT + 2.5 : TL.DUR / 2;
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
