// 《一帧一行》—— 暗色发布会风格示例片
// 页面约定：window.DUR / window.render(t) / window.READY / window.EV / window.CUES（见 docs/technique.md）
import { clamp, lerp, seg, ss, eio, eo, ei, back, spring, hash, TAU, layout, shotAt } from '/core/lib.js';
import { makeCTA } from '/core/cta.js';

const W = 1920, H = 1080;
const C = { bg: '#07090d', ink: '#e9edf3', dim: '#667085', faint: '#1b2231', line: '#2a3345', acc: '#46f0c4', warm: '#ffb14a' };
const ZH = '"NotoSansSC", "PingFang SC", "Microsoft YaHei", sans-serif';
const MONO = '"JetBrainsMono", "NotoSansSC", monospace';
const BPM = 100, BEAT = 60 / BPM;

const cv = document.getElementById('c'); cv.width = W; cv.height = H;
const g = cv.getContext('2d');

// ———————————————————— 时间线 ————————————————————
// 镜头最短时长按拍写（1 拍 = 0.6 s），配音更长时自动撑开，并对齐到 2 拍
const SHOTS = [
  { id: 'type',  dur: 8 * BEAT,  lines: [{ id: 'l1', at: 1.5 }] },
  { id: 'axis',  dur: 8 * BEAT,  lines: [{ id: 'l2', at: .4 }] },
  { id: 'sheet', dur: 10 * BEAT, lines: [{ id: 'l3', at: .6 }] },
  { id: 'fps',   dur: 8 * BEAT,  lines: [{ id: 'l4', at: 2 * BEAT + .75 }] },
  { id: 'lanes', dur: 12 * BEAT, lines: [{ id: 'l5', at: .3 }, { id: 'l6', at: 3.4 }] },
  { id: 'title', dur: 12 * BEAT, lines: [] },
  { id: 'outro', dur: 8 * BEAT,  lines: [{ id: 'l7', at: 1.1 }] },
];

async function loadJSON(p, fallback) { try { const r = await fetch(p, { cache: 'no-store' }); return r.ok ? await r.json() : fallback; } catch { return fallback; } }
const linesDoc = await loadJSON('lines.json', { lines: [] });
const TEXT = Object.fromEntries(linesDoc.lines.map(L => [L.id, L.text]));
const VDUR = await loadJSON('voices/dur.json', {});
const CTA = linesDoc.cta ? makeCTA(linesDoc.cta, { beat: BEAT, voiceDur: VDUR, text: TEXT, style: { ...C, zh: ZH, mono: MONO } }) : null;
if (CTA) SHOTS.push(CTA.shot);
const TL = layout(SHOTS, TEXT, VDUR, { quant: 2 * BEAT });
const S = Object.fromEntries(TL.shots.map(s => [s.id, s]));
if (CTA) CTA.bind(TL);

// ———————————————————— 字体与版面测量 ————————————————————
await Promise.all([`400 40px ${ZH}`, `700 40px ${ZH}`, `900 40px ${ZH}`, `400 40px ${MONO}`, `700 40px ${MONO}`].map(f => document.fonts.load(f, '一帧abc')));
const CODE = 'render(t)', CODE_PX = 150;
// 逐字位置在初始化时量好：绘制过程中 g.font 会变，不能临时再量
function charPositions(s, font) {
  g.font = font; g.letterSpacing = '0px';
  const w = g.measureText(s).width, x0 = -w / 2;
  return { x0, xs: [...Array(s.length + 1)].map((_, i) => x0 + g.measureText(s.slice(0, i)).width) };
}
const CODE_POS = charPositions(CODE, `500 ${CODE_PX}px ${MONO}`), codeX0 = CODE_POS.x0, charX = i => CODE_POS.xs[i];
const TX = (charX(7) + charX(8)) / 2;                                // 字母 t 的中心：镜头 1→2 的衔接点
const OUT = 'render(你的故事)';
const OUT_POS = charPositions(OUT, `500 118px ${MONO}`), outX0 = OUT_POS.x0, outX = i => OUT_POS.xs[i];
const TYPE1 = { start: .45, per: .1 }, TYPE7 = { start: 1.05, per: .105 };

// ———————————————————— 事件（音效 / 配音 / 镜头），导出给混音 ————————————————————
const EV = [];
const sfx = (t, name, gain = 1, extra = {}) => EV.push({ t: +t.toFixed(4), type: 'sfx', name, gain, ...extra });
for (const s of TL.shots) EV.push({ t: s.t0, type: 'shot', id: s.id, t1: s.t1 });
for (const L of TL.lines) EV.push({ t: L.t0, type: 'voice', id: L.id, d: L.voice });
for (let i = 0; i < CODE.length; i++) sfx(S.type.t0 + TYPE1.start + i * TYPE1.per, 'key', .55 + .3 * hash(i), { pan: (i / CODE.length - .5) * .4 });
sfx(S.axis.t0 + .15, 'whoosh', .5, { d: .9 });
for (let k = 1; k <= 5; k++) sfx(S.axis.t0 + 1.6 + k * 240 / 260, 'tick', .45, { pan: -.3 + k * .12 });
sfx(S.sheet.t0 - .25, 'whoosh', .35, { d: .5 });
for (let k = 0; k < 24; k += 4) sfx(S.sheet.t0 + .2 + k * .05, 'shutter', .5, { pan: (k % 6) / 5 - .5 });
sfx(S.sheet.t0 + 2.6, 'ding', .28);
sfx(S.sheet.t1 - .7, 'whoosh', .4, { d: .7 });
sfx(S.fps.t0 + 2 * BEAT, 'thump', 1.0);
sfx(S.fps.t1 - .6, 'whoosh', .35, { d: .6 });
for (let i = 0; i < 5; i++) sfx(S.lanes.t0 + .15 + i * .18, 'pop', .35, { pan: -.4 + i * .2 });
sfx(S.title.t0 - .1, 'riser', .75, { d: 4 * BEAT + .1 });
sfx(S.title.t0 + 4 * BEAT, 'boom', 1.0);
sfx(S.outro.t0 + .1, 'whoosh', .3, { d: .8 });
for (let i = 0; i < OUT.length; i++) sfx(S.outro.t0 + TYPE7.start + i * TYPE7.per, 'key', .5 + .3 * hash(i + 40), { pan: (i / OUT.length - .5) * .4 });
if (CTA) CTA.events(sfx);
EV.sort((a, b) => a.t - b.t);

// ———————————————————— 绘制工具 ————————————————————
function cam(c, par = 1) {
  const z = lerp(1, c.z, par);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.translate(W / 2, H / 2); g.rotate((c.r || 0) * par); g.scale(z, z); g.translate(-c.x * par, -c.y * par);
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
  cam(c, .45);                                                          // 远景点阵：视差 0.45
  g.fillStyle = C.faint; const step = 80;
  const x0 = Math.floor((c.x * .45 - 1400) / step) * step, y0 = Math.floor((c.y * .45 - 900) / step) * step;
  for (let x = x0; x < x0 + 2800; x += step) for (let y = y0; y < y0 + 1800; y += step) g.fillRect(x - 1.5, y - 1.5, 3, 3);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const v = g.createRadialGradient(W / 2, H / 2, H * .25, W / 2, H / 2, H * .95);
  v.addColorStop(0, 'rgba(7,9,13,0)'); v.addColorStop(1, 'rgba(3,4,6,.85)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
}
const blink = (t, on = .6) => ((t % 1) + 1) % 1 < on;

// 小画框：一个在地面上弹跳的球，就是 render(time) 的结果
function miniFrame(x, y, w, h, time, { hi = 0, alpha = 1, label = null } = {}) {
  if (alpha <= 0) return;
  g.save(); g.globalAlpha *= alpha;
  rrect(x, y, w, h, 10); g.fillStyle = '#0c1118'; g.fill();
  g.lineWidth = 2 + hi * 2; g.strokeStyle = hi ? C.acc : C.line;
  if (hi) { g.shadowColor = C.acc; g.shadowBlur = 24 * hi; }
  g.stroke(); g.shadowBlur = 0;
  const gy = y + h * .8;
  g.strokeStyle = C.line; g.lineWidth = 2; g.beginPath(); g.moveTo(x + w * .08, gy); g.lineTo(x + w * .92, gy); g.stroke();
  const ph = (time * .5) % 1, bx = x + w * (.14 + .72 * ph), by = gy - h * .44 * Math.abs(Math.sin(time * Math.PI * 1.25)) - h * .07;
  g.fillStyle = hi ? C.acc : C.ink; g.beginPath(); g.arc(bx, by, h * .07, 0, TAU); g.fill();
  g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(bx, gy + 3, h * .07 * (1.3 - (gy - by) / h), 4, 0, 0, TAU); g.fill();
  if (label) text(label, x + 12, y + 20, { size: Math.max(14, h * .11), font: MONO, color: hi ? C.acc : C.dim, align: 'left' });
  g.restore();
}

// ———————————————————— 镜头 ————————————————————
function shotType(lt, s) {
  const c = { x: 0, y: 0, z: lerp(1, 1.12, ss(lt / s.dur)) };
  background(c); cam(c);
  const n = clamp(Math.floor((lt - TYPE1.start) / TYPE1.per) + 1, 0, CODE.length);
  const fadeOthers = 1 - ss(seg(lt, s.dur - .75, s.dur - .1));
  g.font = `500 ${CODE_PX}px ${MONO}`;
  for (let i = 0; i < n; i++) {
    const isT = CODE[i] === 't' && i === 7;
    const a = isT ? 1 : fadeOthers, dy = isT ? 0 : -40 * (1 - fadeOthers);
    text(CODE[i], charX(i), dy, { size: CODE_PX, font: MONO, weight: 500, color: isT ? C.acc : C.ink, align: 'left', alpha: a, glow: isT ? 30 : 0 });
  }
  const cx = charX(n) + 6;
  if (blink(lt) && fadeOthers > .5) { g.fillStyle = C.acc; g.fillRect(cx, -CODE_PX * .42, 10, CODE_PX * .84); }
  text('// 一帧画面', codeX0, -150, { size: 30, font: MONO, color: C.dim, align: 'left', alpha: ss(seg(lt, 1.6, 2.2)) * fadeOthers });
}

function shotAxis(lt, s) {
  const k = ss(seg(lt, 0, 2.6));
  const c = { x: lerp(0, TX + 540, k), y: lerp(0, -80, k), z: lerp(1.12, .9, k) - .03 * seg(lt, 2.6, s.dur) };
  background(c); cam(c);
  const out = ss(seg(lt, s.dur - .6, s.dur));
  text('t', TX, 0, { size: CODE_PX, font: MONO, weight: 500, color: C.acc, glow: 30, alpha: 1 - out });
  const ax0 = TX + 70, len = 1500 * eo(seg(lt, .15, 1.7));
  g.globalAlpha = 1 - out;
  g.strokeStyle = C.line; g.lineWidth = 3; g.beginPath(); g.moveTo(ax0, 0); g.lineTo(ax0 + len, 0); g.stroke();
  for (let x = 0; x <= len; x += 60) {
    const major = x % 240 === 0; g.fillStyle = major ? C.dim : C.line;
    g.fillRect(ax0 + x - 1, major ? -16 : -8, 2, major ? 32 : 16);
    if (major) text(`${x / 240}s`, ax0 + x, 48, { size: 24, font: MONO, color: C.dim });
  }
  g.globalAlpha = 1;
  text('frame = render(t)', ax0 + 40, -150, { size: 40, font: MONO, color: C.dim, align: 'left', alpha: ss(seg(lt, .9, 1.5)) * (1 - out) });
  if (lt > 1.4) {
    const px = ax0 + Math.min(1500, (lt - 1.6) * 260) * (lt > 1.6), time = (px - ax0) / 240, a = ss(seg(lt, 1.4, 1.8));
    g.globalAlpha = a * (1 - out);
    g.strokeStyle = C.acc; g.lineWidth = 3; g.beginPath(); g.moveTo(px, -24); g.lineTo(px, -210); g.stroke();
    g.fillStyle = C.acc; g.beginPath(); g.moveTo(px - 12, -24); g.lineTo(px + 12, -24); g.lineTo(px, -4); g.fill();
    g.globalAlpha = 1;
    const grow = 1 + 1.4 * ei(out);
    const fw = 320 * grow, fh = 180 * grow;
    miniFrame(px - fw / 2, -210 - fh - 30 * grow + 200 * ei(out), fw, fh, time, { hi: 1, alpha: a * (1 - out * .6), label: `t=${time.toFixed(2)}` });
  }
}

const GRID = { cols: 6, rows: 4, w: 250, h: 141, gap: 22 };
function cellXY(k) {
  const { cols, rows, w, h, gap } = GRID, i = k % cols, j = Math.floor(k / cols);
  return [(i - (cols - 1) / 2) * (w + gap) - w / 2, (j - (rows - 1) / 2) * (h + gap) - h / 2 - 10];
}
function shotSheet(lt, s) {
  const c = { x: 0, y: 0, z: lerp(.9, 1.02, ss(lt / s.dur)), r: lerp(-.025, .012, ss(lt / s.dur)) };
  background(c); cam(c);
  const coll = seg(lt, s.dur - .8, s.dur - .05);
  for (let k = 0; k < 24; k++) {
    const ap = spring(lt - (.2 + k * .05), 9, .5), out = ei(clamp(coll * 1.6 - (23 - k) / 24 * .6));
    if (ap <= 0) continue;
    const [x, y] = cellXY(k), sc = ap * (1 - out), cx = x + GRID.w / 2, cy = y + GRID.h / 2;
    const hi = k === 10 ? ss(seg(lt, 2.6, 3.0)) * (1 - out) : 0;
    g.save(); g.translate(lerp(cx, 0, out), lerp(cy, 0, out)); g.scale(sc, sc);
    miniFrame(-GRID.w / 2, -GRID.h / 2, GRID.w, GRID.h, k * .125, { hi, label: `t=${(k * .125).toFixed(3)}`, alpha: clamp(ap) });
    g.restore();
  }
  const la = ss(seg(lt, 2.8, 3.2)) * (1 - ss(coll * 3));
  if (la > 0) {
    const [x, y] = cellXY(10), cx = x + GRID.w / 2, cy = y - 30;
    g.save(); g.globalAlpha = la; rrect(cx - 130, cy - 24, 260, 48, 24); g.fillStyle = C.bg; g.fill(); g.strokeStyle = C.acc; g.lineWidth = 2; g.stroke(); g.restore();
    text('render(1.250)', cx, cy + 1, { size: 26, font: MONO, color: C.acc, alpha: la });
  }
}

function shotFps(lt, s) {
  const slam = 2 * BEAT, a = lt - slam;
  const shake = a > 0 ? 16 * Math.exp(-a * 7) : 0;
  const out = ss(seg(lt, s.dur - .75, s.dur - .05));
  const c = { x: shake * Math.sin(a * 83), y: shake * Math.cos(a * 61) - 60 * out, z: 1 + .03 * seg(lt, slam, s.dur) };
  background(c); cam(c);
  if (lt < slam + .05) {
    const p = 6 + 3 * Math.sin(lt * TAU * 1.2);
    g.fillStyle = C.ink; g.globalAlpha = seg(lt, 0, .3) * (1 - seg(lt, slam - .05, slam + .05)); g.beginPath(); g.arc(0, 0, p, 0, TAU); g.fill(); g.globalAlpha = 1;
  }
  if (a > 0) {
    const sc = lerp(1.7, 1, clamp(spring(a, 10, .45))) * lerp(1, .26, out), y = lerp(-20, -330, out);
    g.save(); g.translate(0, y); g.scale(sc, sc);
    text('24', 0, 0, { size: 420, weight: 900, color: C.ink, glow: 40 * Math.exp(-a * 3), glowColor: C.acc });
    g.restore();
    const sub = ss(seg(a, .25, .7)) * (1 - out);
    text('帧 / 秒', 0, 250, { size: 50, weight: 400, color: C.dim, alpha: sub, spacing: 12 });
    const ring = ss(seg(a, .1, .5)) * (1 - out), lit = Math.floor(a * 24) % 24;
    for (let i = 0; i < 24; i++) {
      const ang = -Math.PI / 2 + i / 24 * TAU, on = i <= lit;
      g.save(); g.globalAlpha = ring * (on ? 1 : .35); g.translate(Math.cos(ang) * 360, Math.sin(ang) * 360 - 10); g.rotate(ang);
      g.fillStyle = on ? C.acc : C.line; g.fillRect(-14, -3, 28, 6); g.restore();
    }
  }
}

const LANES = [['画面', 'VIDEO'], ['配音', 'VOICE'], ['字幕', 'CAPTION'], ['音乐', 'MUSIC'], ['音效', 'SFX']];
const LX0 = -660, LX1 = 800, LGAP = 132;
function laneContent(i, x0, x1, y, head, bright, conv = 0) {
  // 每条轨道画自己的内容；x < head 的部分已被播放头扫过，提亮
  const lit = x => x < head ? 1 : .45;
  if (i === 0) for (let x = x0 + 10; x < x1 - 100; x += 118) { g.globalAlpha = bright * lit(x); rrect(x, y - 34, 104, 60, 6); g.strokeStyle = x < head ? C.ink : C.dim; g.lineWidth = 2; g.stroke(); g.fillStyle = x < head ? C.acc : C.line; g.beginPath(); g.arc(x + 26 + (x % 50), y + 4 - 14 * Math.abs(Math.sin(x * .03)), 7, 0, TAU); g.fill(); }
  if (i === 1) for (let x = x0 + 10, k = 0; x < x1; x += 9, k++) { const cl = Math.sin(k * .09) > -.2 ? 1 : .08; const hgt = (8 + 44 * hash(k * 1.7) * cl) * (1 - conv); g.globalAlpha = bright * lit(x); g.fillStyle = x < head ? C.acc : C.dim; g.fillRect(x, y - hgt / 2, 5, hgt); }
  if (i === 2) { const caps = ['每一帧画面', '时间的函数', '还你一帧', '二十四次', '同一条时间线']; caps.forEach((s, k) => { const x = x0 + 20 + k * 290; g.globalAlpha = bright * lit(x); rrect(x, y - 24, 250, 48, 24); g.fillStyle = x < head ? 'rgba(70,240,196,.16)' : 'rgba(255,255,255,.04)'; g.fill(); text(s, x + 125, y + 1, { size: 24, color: x < head ? C.ink : C.dim, alpha: 1 - conv }); }); }
  if (i === 3) for (let k = 0; k < 40; k++) { const x = x0 + 16 + k * 36, p = [0, 3, 5, 7, 3, 5, 10, 7][k % 8] + (k >= 24 ? 2 : 0); g.globalAlpha = bright * lit(x); g.fillStyle = x < head ? C.warm : C.dim; g.fillRect(x, y + 28 - p * 5 * (1 - conv), 30, 7); }
  if (i === 4) for (let k = 0; k < 11; k++) { const x = x0 + 60 + k * 128 + 40 * hash(k * 3.1); g.globalAlpha = bright * lit(x); g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillStyle = x < head ? C.ink : C.dim; const r = 13 * (1 - conv * .5); g.fillRect(-r, -r, 2 * r, 2 * r); g.restore(); }
  g.globalAlpha = 1;
}
function shotLanes(lt, s) {
  const head = lerp(LX0, LX1, seg(lt, 1.2, s.dur - .2));
  const c = { x: lerp(-60, 140, ss(seg(lt, 1.2, s.dur))), y: 0, z: lerp(.86, .94, ss(lt / s.dur)) };
  background(c); cam(c);
  const top = ss(seg(lt, 0, .5));
  g.save(); g.translate(0, -410); g.scale(.26, .26); text('24', 0, 0, { size: 420, weight: 900, color: C.ink, alpha: 1 - ss(seg(lt, .3, .9)) }); g.restore();
  text('一条时间线', LX0 - 30, -400, { size: 30, color: C.dim, align: 'left', alpha: top * ss(seg(lt, .6, 1.1)), spacing: 6 });
  LANES.forEach(([zh, en], i) => {
    const y = (i - 2) * LGAP, st = .15 + i * .18, grow = eo(seg(lt, st, st + .7));
    if (grow <= 0) return;
    text(zh, LX0 - 40, y - 8, { size: 36, weight: 700, color: C.ink, align: 'right', alpha: grow });
    text(en, LX0 - 40, y + 26, { size: 16, font: MONO, color: C.dim, align: 'right', alpha: grow, spacing: 3 });
    g.strokeStyle = C.line; g.lineWidth = 2; g.beginPath(); g.moveTo(LX0, y + 48); g.lineTo(lerp(LX0, LX1, grow), y + 48); g.stroke();
    g.save(); g.beginPath(); g.rect(LX0, y - 70, (LX1 - LX0) * grow, 140); g.clip(); laneContent(i, LX0, LX1, y, head, grow); g.restore();
  });
  if (lt > 1.1) {
    const a = ss(seg(lt, 1.1, 1.4));
    g.globalAlpha = a; g.strokeStyle = C.acc; g.lineWidth = 3; g.shadowColor = C.acc; g.shadowBlur = 20;
    g.beginPath(); g.moveTo(head, -2.5 * LGAP - 40); g.lineTo(head, 2.5 * LGAP + 20); g.stroke(); g.shadowBlur = 0;
    text(`t=${((head - LX0) / 60).toFixed(2)}`, head, -2.5 * LGAP - 64, { size: 22, font: MONO, color: C.acc, alpha: a });
    g.globalAlpha = 1;
  }
}

const TITLE = '视频工作台', TPX = 176, TSP = 26;
function titleLayout() {
  g.font = `700 ${TPX}px ${ZH}`; g.letterSpacing = TSP + 'px';
  const w = g.measureText(TITLE).width - TSP; g.letterSpacing = '0px';
  const cw = (w - TSP * (TITLE.length - 1)) / TITLE.length;
  return [...TITLE].map((ch, i) => ({ ch, x: -w / 2 + cw / 2 + i * (cw + TSP) }));
}
function shotTitle(lt, s) {
  const rev = 4 * BEAT, conv = eio(seg(lt, 0, rev)), after = lt - rev;
  const c = { x: lerp(140, 0, conv), y: lerp(0, -10, conv), z: lerp(.94, 1.04, conv) - .05 * ss(seg(lt, rev, s.dur)) };
  background(c); cam(c);
  if (after < .15) {
    const br = lerp(.9, 1.4, conv);
    LANES.forEach((_, i) => {
      const y = lerp((i - 2) * LGAP, 110, conv), x0 = lerp(LX0, -575, conv), x1 = lerp(LX1, 575, conv);
      g.save(); g.globalAlpha = clamp(br - conv * .6); g.beginPath(); g.rect(x0, y - 70, x1 - x0, 140); g.clip(); laneContent(i, x0, x1, y, x1 + 1, 1, conv); g.restore();
      g.strokeStyle = conv > .5 ? C.acc : C.line; g.globalAlpha = .4 + .6 * conv; g.lineWidth = 2 + 2 * conv; g.beginPath(); g.moveTo(x0, y + 48 * (1 - conv)); g.lineTo(x1, y + 48 * (1 - conv)); g.stroke(); g.globalAlpha = 1;
    });
  }
  if (after >= 0) {
    g.strokeStyle = C.acc; g.lineWidth = 4; g.shadowColor = C.acc; g.shadowBlur = 26 + 60 * Math.exp(-after * 4);
    const lw = 1150 * lerp(1, .92, eo(seg(after, 0, 1.2)));
    g.beginPath(); g.moveTo(-lw / 2, 110); g.lineTo(lw / 2, 110); g.stroke(); g.shadowBlur = 0;
    titleLayout().forEach(({ ch, x }, i) => {
      const p = eo(seg(after, .05 + i * .08, .65 + i * .08));
      text(ch, x, lerp(70, -20, p), { size: TPX, weight: 700, color: C.ink, alpha: p });
    });
    text('VIDEO  WORKBENCH', 0, 176, { size: 30, font: MONO, color: C.dim, spacing: 18, alpha: ss(seg(after, .7, 1.3)) });
    text('写代码，出成片', 0, 250, { size: 30, color: C.dim, spacing: 10, alpha: ss(seg(after, 1.2, 1.8)) * .8 });
  }
  if (after >= 0 && after < .25) { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = `rgba(210,255,240,${.2 * (1 - after / .25) ** 2})`; g.fillRect(0, 0, W, H); }
}

function shotOutro(lt, s) {
  const c = { x: 0, y: 0, z: lerp(1.0, 1.1, ss(seg(lt, .8, s.dur))) };
  background(c); cam(c);
  const d = ss(seg(lt, 0, .9));
  titleLayout().forEach(({ ch, x }, i) => text(ch, x, -20 - 60 * ss(seg(lt, i * .05, .6 + i * .05)), { size: TPX, weight: 700, color: C.ink, alpha: 1 - ss(seg(lt, i * .05, .6 + i * .05)) }));
  text('VIDEO  WORKBENCH', 0, 176, { size: 30, font: MONO, color: C.dim, spacing: 18, alpha: 1 - d });
  const k = eio(seg(lt, .1, 1.0));
  const cw = lerp(1150 * .92, 10, k), ch = lerp(4, 100, ss(seg(lt, .6, 1.0))), cx = lerp(0, outX0 + 5, k), cy = lerp(110, 0, k);
  const n = clamp(Math.floor((lt - TYPE7.start) / TYPE7.per) + 1, 0, OUT.length);
  const end = 1 - ss(seg(lt, s.dur - .8, s.dur - .1));
  for (let i = 0; i < n; i++) {
    const zh = i >= 7 && i < 11;
    text(OUT[i], outX(i), 0, { size: 118, font: MONO, weight: 500, color: zh ? C.warm : C.ink, align: 'left', alpha: end, glow: zh ? 22 : 0 });
  }
  const typing = lt > TYPE7.start;
  const curX = typing ? outX(n) + 6 : cx - cw / 2;
  if (!typing || blink(lt) || lt < TYPE7.start + OUT.length * TYPE7.per) {
    g.globalAlpha = typing ? end : 1; g.fillStyle = C.acc; g.shadowColor = C.acc; g.shadowBlur = 20;
    g.fillRect(typing ? curX : cx - cw / 2, (typing ? 0 : cy) - (typing ? 50 : ch / 2), typing ? 10 : cw, typing ? 100 : ch);
    g.shadowBlur = 0; g.globalAlpha = 1;
  }
}

const DRAW = { type: shotType, axis: shotAxis, sheet: shotSheet, fps: shotFps, lanes: shotLanes, title: shotTitle, outro: shotOutro };
// 结尾互动（lines.json 里有 "cta" 块时才出现，见 core/cta.js）：上一镜淡出，问题和评论框淡入
if (CTA) DRAW.cta = (lt, s) => {
  const prev = TL.shots[TL.shots.length - 2], k = ss(seg(lt, 0, .5));
  if (k < 1 && prev) { g.save(); DRAW[prev.id](prev.dur - 1e-3, prev); g.restore(); }
  const c = { x: 0, y: 0, z: lerp(1, 1.05, ss(lt / s.dur)) };
  g.save(); g.globalAlpha = k; background(c); g.restore();
  cam(c); CTA.draw(g, lt, s);
};


// 字幕：画在屏幕空间，底部居中
function captions(t) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  for (const L of TL.lines) {
    if (t < L.t0 - .15 || t > L.t1 + .15) continue;
    const a = Math.min(ss(seg(t, L.t0 - .15, L.t0 + .1)), 1 - ss(seg(t, L.t1 - .1, L.t1 + .15)));
    text(L.text, W / 2, H - 104, { size: 46, weight: 400, color: C.ink, alpha: a, spacing: 3, glow: 12, glowColor: 'rgba(0,0,0,.9)' });
  }
}

window.DUR = TL.DUR;
window.EV = EV;
window.CUES = TL.lines.map(L => ({ t0: +L.t0.toFixed(3), t1: +L.t1.toFixed(3), text: L.text }));
window.SHOTS = TL.shots.map(s => ({ id: s.id, t0: s.t0, t1: s.t1 }));
window.POSTER = S.title.t0 + 4 * BEAT + 2.2;
window.render = t => {
  t = clamp(t, 0, TL.DUR - 1e-6);
  const { shot, lt } = shotAt(TL.shots, t);
  g.save(); DRAW[shot.id](lt, shot); g.restore();
  captions(t);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const fin = seg(t, TL.DUR - .35, TL.DUR);
  if (fin > 0) { g.fillStyle = `rgba(0,0,0,${fin})`; g.fillRect(0, 0, W, H); }
};
window.render(0);
window.READY = true;
