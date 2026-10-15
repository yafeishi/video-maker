// 《Tailscale 为啥有时慢？卫星=备胎通道》浅色竖屏 · 大图解满构图
import { clamp, lerp, seg, ss, eo, spring, hash, TAU, layout, shotAt } from '/core/lib.js';
import { makeCTA } from '/core/cta.js';

const W = 1080, H = 1920;
const C = {
  bg: '#f4f6fa', ink: '#1a2332', dim: '#5b6575', faint: '#e4e9f0', line: '#c5ced9',
  card: '#ffffff', acc: '#0d9f8a', warm: '#d97706', cool: '#2563eb', coral: '#dc2626',
};
const ZH = '"NotoSansSC", "PingFang SC", "Microsoft YaHei", sans-serif';
const MONO = '"JetBrainsMono", "NotoSansSC", monospace';
const BPM = 100, BEAT = 60 / BPM;

const cv = document.getElementById('c'); cv.width = W; cv.height = H;
const g = cv.getContext('2d');

const SHOTS = [
  { id: 'hook',  dur: 10 * BEAT, kind: 'question', music: 'calm',   lines: [{ id: 'l1', at: .4 }] },
  { id: 'home',  dur: 16 * BEAT, kind: 'point',    music: 'hit',    lines: [{ id: 'l2', at: .35 }, { id: 'l3', at: 5.2 }] },
  { id: 'lan',   dur: 16 * BEAT, kind: 'point',    music: 'groove', lines: [{ id: 'l4', at: .35 }, { id: 'l5', at: 5.0 }] },
  { id: 'fail',  dur: 16 * BEAT, kind: 'point',    music: 'groove', lines: [{ id: 'l6', at: .35 }, { id: 'l7', at: 4.8 }] },
  { id: 'spare', dur: 16 * BEAT, kind: 'point',    music: 'groove', lines: [{ id: 'l8', at: .35 }, { id: 'l9', at: 5.2 }] },
  { id: 'sat',   dur: 18 * BEAT, kind: 'point',    music: 'groove', lines: [{ id: 'l10', at: .35 }, { id: 'l11', at: 5.4 }] },
  { id: 'recap', dur: 16 * BEAT, kind: 'recap',    music: 'finale', lines: [{ id: 'l12', at: .4 }, { id: 'l13', at: 7.0 }] },
];

async function loadJSON(p, fallback) {
  try { const r = await fetch(p, { cache: 'no-store' }); return r.ok ? await r.json() : fallback; }
  catch { return fallback; }
}
const linesDoc = await loadJSON('lines.json', { lines: [] });
const TEXT = Object.fromEntries(linesDoc.lines.map(L => [L.id, L.text]));
const VDUR = await loadJSON('voices/dur.json', {});
const CTA = linesDoc.cta ? makeCTA(linesDoc.cta, {
  beat: BEAT, voiceDur: VDUR, text: TEXT,
  style: { bg: C.bg, ink: C.ink, dim: C.dim, line: C.line, acc: C.acc, zh: ZH, mono: MONO },
}) : null;
if (CTA) {
  const d1 = VDUR.cta1 ?? Math.max(1.2, (TEXT.cta1 || '').length / 4.2);
  const d2 = VDUR.cta2 ?? Math.max(1.2, (TEXT.cta2 || '').length / 4.2);
  const at1 = 0.4, at2 = at1 + d1 + 0.32;
  const grid = 2 * BEAT;
  const tight = Math.ceil((at2 + d2 + 0.35) / grid - 1e-9) * grid;
  SHOTS.push({ ...CTA.shot, dur: tight, kind: 'cta', music: 'outro', lines: [{ id: 'cta1', at: at1 }, { id: 'cta2', at: at2 }] });
}
const TL = layout(SHOTS, TEXT, VDUR, { quant: 2 * BEAT });
const S = Object.fromEntries(TL.shots.map(s => [s.id, s]));
if (CTA) CTA.bind(TL);
await Promise.all([`400 40px ${ZH}`, `700 40px ${ZH}`, `900 40px ${ZH}`, `700 40px ${MONO}`].map(f => document.fonts.load(f, '一帧abc')));

const EV = [];
const sfx = (t, name, gain = 1, extra = {}) => EV.push({ t: +t.toFixed(4), type: 'sfx', name, gain, ...extra });
for (const s of TL.shots) EV.push({ t: s.t0, type: 'shot', id: s.id, t1: s.t1, kind: s.kind, music: s.music });
for (const L of TL.lines) EV.push({ t: L.t0, type: 'voice', id: L.id, d: L.voice });
sfx(S.hook.t0 + .08, 'whoosh', .35, { d: .5 });
sfx(S.home.t0 + .12, 'thump', .55);
sfx(S.home.t0 + 4.8, 'pop', .3);
sfx(S.lan.t0 + .1, 'whoosh', .28, { d: .4 });
sfx(S.lan.t0 + 4.6, 'pop', .3);
sfx(S.fail.t0 + .1, 'whoosh', .28, { d: .4 });
sfx(S.fail.t0 + 4.4, 'thump', .4);
sfx(S.spare.t0 + .1, 'whoosh', .3, { d: .45 });
sfx(S.spare.t0 + 4.8, 'ding', .35);
sfx(S.sat.t0 + .12, 'whoosh', .3, { d: .45 });
sfx(S.sat.t0 + 5.0, 'ding', .4);
sfx(S.recap.t0 + .2, 'riser', .45, { d: .9 });
sfx(S.recap.t0 + 1.0, 'boom', .45);
if (CTA) CTA.events(sfx);
EV.sort((a, b) => a.t - b.t);

function wmNode(x, y, r) {
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
  g.beginPath(); g.arc(x, y, r * 0.28, 0, TAU); g.fill();
}
function wmPhone(x, y, s) {
  g.save(); g.translate(x, y); g.scale(s, s);
  roundRect(-18, -32, 36, 64, 7); g.stroke();
  g.restore();
}
function wmHouse(x, y, s) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.beginPath(); g.moveTo(0, -36); g.lineTo(40, -6); g.lineTo(40, 34); g.lineTo(-40, 34); g.lineTo(-40, -6); g.closePath(); g.stroke();
  g.restore();
}
function wmLaptop(x, y, s) {
  g.save(); g.translate(x, y); g.scale(s, s);
  roundRect(-36, -24, 72, 44, 5); g.stroke();
  g.beginPath(); g.moveTo(-48, 24); g.lineTo(48, 24); g.stroke();
  g.restore();
}
function bg() {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
  const grd = g.createLinearGradient(0, 0, 0, H * 0.4);
  grd.addColorStop(0, 'rgba(13,159,138,0.05)'); grd.addColorStop(1, 'rgba(244,246,250,0)');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.save();
  g.globalAlpha = 0.075;
  g.strokeStyle = '#8a96a8'; g.fillStyle = '#8a96a8'; g.lineWidth = 2.5;
  const mesh = [
    [140, 200], [400, 160], [680, 220], [940, 180],
    [180, 480], [520, 440], [880, 500],
    [260, 780], [600, 740], [920, 820],
    [160, 1100], [460, 1040], [840, 1120],
  ];
  for (let i = 0; i < mesh.length; i++) {
    for (let j = i + 1; j < mesh.length; j++) {
      const dx = mesh[i][0] - mesh[j][0], dy = mesh[i][1] - mesh[j][1];
      if (dx * dx + dy * dy < 240 * 240) {
        g.beginPath(); g.moveTo(mesh[i][0], mesh[i][1]); g.lineTo(mesh[j][0], mesh[j][1]); g.stroke();
      }
    }
  }
  mesh.forEach(([x, y], i) => wmNode(x, y, 11 + (i % 3) * 2));
  g.globalAlpha = 0.065;
  wmHouse(900, 1380, 1.7);
  wmLaptop(170, 1420, 1.6);
  wmPhone(500, 1440, 1.5);
  // personal mark: Hobson 小党 (faint corner watermark)
  g.globalAlpha = 0.09;
  g.font = `600 32px ${ZH}`;
  g.fillStyle = '#7a8799';
  g.textAlign = 'right'; g.textBaseline = 'bottom';
  g.fillText('Hobson 小党', W - 40, H - 40);
  g.restore();
}
function text(s, x, y, o = {}) {
  const { size = 40, weight = 400, color = C.ink, alpha = 1, align = 'center', font = ZH, glow = 0 } = o;
  if (alpha <= 0 || !s) return;
  g.save(); g.globalAlpha *= alpha; g.font = `${weight} ${size}px ${font}`;
  g.textAlign = align; g.textBaseline = 'middle';
  if (glow) { g.shadowBlur = glow; g.shadowColor = o.glowColor || C.acc; }
  g.fillStyle = color; g.fillText(s, x, y); g.restore();
}
function wrapText(s, maxW, size, weight = 700) {
  g.font = `${weight} ${size}px ${ZH}`;
  const chars = [...s];
  const lines = []; let cur = '';
  for (const ch of chars) {
    const t = cur + ch;
    if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = ch; }
    else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
function roundRect(x, y, w, h, r) {
  if (g.roundRect) { g.beginPath(); g.roundRect(x, y, w, h, r); return; }
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r); g.closePath();
}
function chip(label, x, y, a = 1, fill = C.acc) {
  if (a <= 0) return;
  g.save(); g.globalAlpha *= a; g.font = `800 36px ${ZH}`;
  const tw = g.measureText(label).width, pw = tw + 56, ph = 64;
  g.fillStyle = C.card;
  roundRect(x - pw / 2, y - ph / 2, pw, ph, 32); g.fill();
  g.strokeStyle = fill; g.lineWidth = 4; g.stroke();
  g.fillStyle = C.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, x, y + 1); g.restore();
}
function card(x, y, w, h, a = 1, accent = C.line) {
  if (a <= 0) return;
  g.save(); g.globalAlpha *= a;
  g.fillStyle = C.card;
  roundRect(x - w / 2, y - h / 2, w, h, 32); g.fill();
  g.strokeStyle = accent; g.lineWidth = 4; g.stroke();
  g.restore();
}
function node(x, y, label, a = 1, color = C.acc, r = 72) {
  if (a <= 0) return;
  g.save(); g.globalAlpha *= a;
  g.fillStyle = C.card;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.strokeStyle = color; g.lineWidth = 7; g.stroke();
  g.fillStyle = color; g.beginPath(); g.arc(x, y, r * 0.34, 0, TAU); g.fill();
  g.restore();
  if (label) text(label, x, y + r + 44, { size: 40, weight: 800, color: C.ink, alpha: a });
}
function iconPhone(x, y, a, scale = 1) {
  if (a <= 0) return;
  g.save(); g.globalAlpha *= a; g.translate(x, y); g.scale(scale, scale);
  g.fillStyle = C.card; g.strokeStyle = C.acc; g.lineWidth = 7;
  roundRect(-48, -84, 96, 168, 18); g.fill(); g.stroke();
  g.fillStyle = C.acc; roundRect(-30, -66, 60, 110, 8); g.fill();
  g.beginPath(); g.arc(0, 66, 8, 0, TAU); g.fill();
  g.restore();
}
function iconHouse(x, y, a, scale = 1) {
  if (a <= 0) return;
  g.save(); g.globalAlpha *= a; g.translate(x, y); g.scale(scale, scale);
  g.fillStyle = C.card; g.strokeStyle = C.cool; g.lineWidth = 7;
  g.beginPath(); g.moveTo(0, -95); g.lineTo(110, -10); g.lineTo(110, 95); g.lineTo(-110, 95); g.lineTo(-110, -10); g.closePath();
  g.fill(); g.stroke();
  g.fillStyle = C.cool; roundRect(-30, 15, 60, 80, 8); g.fill();
  g.restore();
}
function iconLaptop(x, y, a, scale = 1) {
  if (a <= 0) return;
  g.save(); g.globalAlpha *= a; g.translate(x, y); g.scale(scale, scale);
  g.fillStyle = C.card; g.strokeStyle = C.acc; g.lineWidth = 7;
  roundRect(-95, -68, 190, 120, 14); g.fill(); g.stroke();
  g.fillStyle = C.faint; roundRect(-78, -52, 156, 88, 8); g.fill();
  g.fillStyle = C.dim; roundRect(-120, 56, 240, 18, 5); g.fill();
  g.restore();
}
function iconNas(x, y, a, scale = 1) {
  if (a <= 0) return;
  g.save(); g.globalAlpha *= a; g.translate(x, y); g.scale(scale, scale);
  g.fillStyle = C.card; g.strokeStyle = C.warm; g.lineWidth = 7;
  roundRect(-72, -95, 144, 190, 18); g.fill(); g.stroke();
  for (let i = 0; i < 3; i++) {
    g.fillStyle = C.faint; roundRect(-52, -68 + i * 48, 104, 32, 6); g.fill();
    g.fillStyle = C.acc; g.beginPath(); g.arc(36, -52 + i * 48, 7, 0, TAU); g.fill();
  }
  g.restore();
}
function dashLine(x1, y1, x2, y2, a, color, dash = [18, 14], lw = 9) {
  if (a <= 0) return;
  g.save(); g.globalAlpha *= a;
  g.strokeStyle = color; g.lineWidth = lw; g.setLineDash(dash);
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  g.setLineDash([]); g.restore();
}
function solidLine(x1, y1, x2, y2, a, color, lw = 10) {
  if (a <= 0) return;
  g.save(); g.globalAlpha *= a;
  g.strokeStyle = color; g.lineWidth = lw; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  g.restore();
}
function packet(x, y, a, color = C.acc) {
  if (a <= 0) return;
  g.save(); g.globalAlpha *= a;
  g.fillStyle = color;
  g.beginPath(); g.arc(x, y, 16, 0, TAU); g.fill();
  g.restore();
}
function bigX(x, y, a, s = 52) {
  if (a <= 0) return;
  g.save(); g.globalAlpha *= a;
  g.strokeStyle = C.coral; g.lineWidth = 14; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x - s, y - s); g.lineTo(x + s, y + s);
  g.moveTo(x + s, y - s); g.lineTo(x - s, y + s); g.stroke();
  g.restore();
}

const DRAW = {
  hook(lt) {
    bg();
    const a = eo(seg(lt, 0.1, 0.4));
    chip('组网场景', W / 2, H * 0.16, a, C.acc);
    wrapText('Tailscale 为啥有时慢？', W - 80, 64, 900).forEach((ln, i) =>
      text(ln, W / 2, H * 0.28 + i * 78, { size: 64, weight: 900, alpha: a }));
    const a2 = eo(seg(lt, 1.3, 1.9));
    wrapText('卫星节点到底加速什么？', W - 80, 48, 800).forEach((ln, i) =>
      text(ln, W / 2, H * 0.44 + i * 62, { size: 48, weight: 800, color: C.warm, alpha: a2 }));
    const a3 = eo(seg(lt, 2.4, 3.1));
    iconPhone(W * 0.26, H * 0.64, a3, 1.55);
    iconHouse(W * 0.72, H * 0.64, a3, 1.35);
    dashLine(W * 0.36, H * 0.64, W * 0.56, H * 0.64, a3 * 0.8, C.acc, [16, 12], 8);
  },
  home(lt) {
    bg();
    const a = eo(seg(lt, 0.08, 0.3));
    chip('① 出门想连家里', W / 2, H * 0.12, a, C.cool);
    const a1 = a * eo(seg(lt, 0.15, 0.55));
    iconPhone(W * 0.26, H * 0.36, a1, 1.85);
    text('你 · 在外面', W * 0.26, H * 0.54, { size: 40, weight: 800, alpha: a1 });
    const a2 = a * eo(seg(lt, 0.8, 1.3));
    iconHouse(W * 0.72, H * 0.30, a2, 1.45);
    iconNas(W * 0.72, H * 0.52, a2, 1.15);
    text('家里 NAS / 电脑', W * 0.72, H * 0.68, { size: 38, weight: 800, alpha: a2 });
    const a3 = a * eo(seg(lt, 1.8, 2.5));
    dashLine(W * 0.38, H * 0.38, W * 0.56, H * 0.38, a3, C.acc, [18, 12], 10);
    const t = (lt * 0.35) % 1;
    if (a3 > 0.5) packet(lerp(W * 0.38, W * 0.56, t), H * 0.38, a3, C.acc);
    chip('想访问家里的东西', W / 2, H * 0.78, a * eo(seg(lt, 4.6, 5.3)), C.warm);
  },
  lan(lt) {
    bg();
    const a = eo(seg(lt, 0.08, 0.3));
    chip('② 多台像同一局域网', W / 2, H * 0.11, a, C.acc);
    const cx = W / 2, cy = H * 0.44;
    const pts = [
      { x: cx, y: cy - 200, draw: (x, y, aa) => iconPhone(x, y, aa, 1.25), lab: '手机' },
      { x: cx - 260, y: cy + 20, draw: (x, y, aa) => iconLaptop(x, y, aa, 1.15), lab: '笔记本' },
      { x: cx + 260, y: cy + 20, draw: (x, y, aa) => iconNas(x, y, aa, 1.0), lab: '家里机器' },
      { x: cx, y: cy + 240, draw: (x, y, aa) => node(x, y, '', aa, C.cool, 58), lab: '云主机' },
    ];
    const linkA = a * eo(seg(lt, 0.4, 1.1));
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        dashLine(pts[i].x, pts[i].y, pts[j].x, pts[j].y, linkA * 0.8, C.acc, [14, 12], 7);
      }
    }
    pts.forEach((p, i) => {
      const na = a * eo(seg(lt, 0.15 + i * 0.12, 0.5 + i * 0.12));
      p.draw(p.x, p.y, na);
      text(p.lab, p.x, p.y + 115, { size: 36, weight: 800, alpha: na });
    });
    chip('私有网络 · 不必开公网端口', W / 2, H * 0.80, a * eo(seg(lt, 4.5, 5.2)), C.acc);
  },
  fail(lt) {
    bg();
    const a = eo(seg(lt, 0.08, 0.3));
    chip('理想：直连最短', W / 2, H * 0.12, a, C.acc);
    const lx = W * 0.20, rx = W * 0.80, cy = H * 0.40;
    node(lx, cy, '设备 A', a, C.acc, 78);
    node(rx, cy, '设备 B', a, C.acc, 78);
    const tryA = eo(seg(lt, 0.7, 1.4));
    dashLine(lx + 85, cy, rx - 85, cy, a * tryA * 0.65, C.acc, [16, 12], 9);
    const failA = eo(seg(lt, 3.6, 4.4));
    g.save(); g.globalAlpha = a * failA;
    g.strokeStyle = C.coral; g.lineWidth = 9; g.setLineDash([14, 12]);
    g.beginPath(); g.moveTo(lx + 85, cy); g.lineTo(rx - 85, cy); g.stroke();
    g.setLineDash([]); g.restore();
    bigX(W / 2, cy, a * failA, 56);
    text('直连打不通', W / 2, cy + 120, { size: 44, weight: 900, color: C.coral, alpha: a * failA });
    chip('NAT / 防火墙挡住了', W / 2, H * 0.68, a * eo(seg(lt, 4.5, 5.2)), C.warm);
    chip('路不通 · 需要备胎', W / 2, H * 0.78, a * eo(seg(lt, 5.4, 6.1)), C.coral);
  },
  spare(lt) {
    bg();
    const a = eo(seg(lt, 0.08, 0.3));
    chip('备胎通道 · 加密中继', W / 2, H * 0.11, a, C.warm);
    const lx = W * 0.16, rx = W * 0.84, cy = H * 0.58;
    const mx = W / 2, my = H * 0.26;
    node(lx, cy, '你', a, C.acc, 70);
    node(rx, cy, '家里', a, C.acc, 70);
    const dA = a * eo(seg(lt, 0.5, 1.2));
    card(mx, my, 360, 170, dA, C.warm);
    text('远处公共中继', mx, my - 28, { size: 42, weight: 900, color: C.warm, alpha: dA });
    text('备胎通道', mx, my + 36, { size: 36, weight: 700, color: C.dim, alpha: dA });
    const rel = eo(seg(lt, 1.8, 2.6));
    solidLine(lx, cy - 55, mx - 80, my + 65, a * rel, C.warm, 10);
    solidLine(mx + 80, my + 65, rx, cy - 55, a * rel, C.warm, 10);
    const t = (lt * 0.35) % 1;
    if (rel > 0.4) {
      if (t < 0.5) packet(lerp(lx, mx, t * 2), lerp(cy - 55, my + 65, t * 2), a * rel, C.warm);
      else packet(lerp(mx, rx, (t - 0.5) * 2), lerp(my + 65, cy - 55, (t - 0.5) * 2), a * rel, C.warm);
    }
    chip('绕远了 → 体感变慢', W / 2, H * 0.80, a * eo(seg(lt, 4.7, 5.4)), C.coral);
  },
  sat(lt) {
    bg();
    const a = eo(seg(lt, 0.08, 0.3));
    chip('卫星节点 = 更近的备胎', W / 2, H * 0.11, a, C.acc);
    const lx = W * 0.14, rx = W * 0.86, cy = H * 0.60;
    node(lx, cy, '你', a, C.acc, 68);
    node(rx, cy, '家里', a, C.acc, 68);
    const far = a * eo(seg(lt, 0.2, 0.6)) * 0.45;
    card(W / 2, H * 0.22, 260, 100, far, C.line);
    text('远处中继', W / 2, H * 0.22, { size: 34, weight: 700, color: C.dim, alpha: far });
    dashLine(lx, cy - 40, W / 2 - 50, H * 0.26, far, C.line, [10, 10], 4);
    dashLine(W / 2 + 50, H * 0.26, rx, cy - 40, far, C.line, [10, 10], 4);
    const satA = a * eo(seg(lt, 1.0, 1.8));
    const sx = W / 2, sy = H * 0.34;
    card(sx, sy, 420, 180, satA, C.acc);
    text('卫星节点', sx, sy - 36, { size: 52, weight: 900, color: C.acc, alpha: satA });
    text('自己的中继 · 放近一点', sx, sy + 36, { size: 34, weight: 700, alpha: satA });
    const rel = eo(seg(lt, 2.6, 3.4));
    solidLine(lx, cy - 48, sx - 90, sy + 70, a * rel, C.acc, 11);
    solidLine(sx + 90, sy + 70, rx, cy - 48, a * rel, C.acc, 11);
    const t = (lt * 0.4) % 1;
    if (rel > 0.4) {
      if (t < 0.5) packet(lerp(lx, sx, t * 2), lerp(cy - 48, sy + 70, t * 2), a * rel, C.acc);
      else packet(lerp(sx, rx, (t - 0.5) * 2), lerp(sy + 70, cy - 48, (t - 0.5) * 2), a * rel, C.acc);
    }
    chip('备胎变短 · 不是万能加速', W / 2, H * 0.80, a * eo(seg(lt, 4.9, 5.7)), C.warm);
  },
  recap(lt) {
    bg();
    const a = eo(seg(lt, 0.1, 0.4));
    chip('记住三句', W / 2, H * 0.12, a, C.acc);
    const rows = [
      { n: '1', t: '能直连 → 直连最好', c: C.acc },
      { n: '2', t: '直连不通 → 加密中继备胎', c: C.warm },
      { n: '3', t: '自建中继 → 把备胎放近', c: C.cool },
    ];
    rows.forEach((r, i) => {
      const aa = a * eo(seg(lt, 0.35 + i * 0.65, 0.75 + i * 0.65));
      const y = H * 0.28 + i * 175;
      card(W / 2, y, W - 80, 140, aa, r.c);
      text(r.n, W * 0.16, y, { size: 56, weight: 900, color: r.c, alpha: aa, font: MONO });
      text(r.t, W * 0.58, y, { size: 38, weight: 800, alpha: aa });
    });
    chip('查状态：直连还是中继？', W / 2, H * 0.80, a * eo(seg(lt, 6.5, 7.2)), C.dim);
  },
  cta(lt, s) {
    bg();
    g.save();
    const breath = 1 + 0.02 * Math.sin(lt * 3);
    g.translate(W / 2, H * 0.42 + Math.sin(lt * 2) * 5);
    g.scale(1.02 * breath, 1.02 * breath);
    CTA.draw(g, lt, s);
    g.restore();
    const cta2 = TL.lines.find(L => L.id === 'cta2');
    const voEndLt = cta2 ? Math.max(0, cta2.t1 - s.t0) : (s.dur - 0.9);
    const fadeStart = Math.min(s.dur - 0.35, voEndLt + 0.45);
    const fade = eo(seg(lt, fadeStart, Math.max(fadeStart + 0.02, s.dur - 0.02)));
    if (fade > 0) { g.fillStyle = C.bg; g.globalAlpha = fade; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
  },
};

function captions(t) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  const cy = H * 0.905;
  for (const L of TL.lines) {
    if (L.id.startsWith('cta')) continue;
    const a = Math.min(ss(seg(t, L.t0 - 0.1, L.t0 + 0.08)), 1 - ss(seg(t, L.t1 - 0.08, L.t1 + 0.12)));
    if (a <= 0) continue;
    const lines = wrapText(L.text, W - 70, 34, 700);
    const bh = lines.length * 42 + 22;
    g.save(); g.globalAlpha = a * 0.92;
    g.fillStyle = 'rgba(255,255,255,0.94)';
    roundRect(32, cy - bh / 2 - 4, W - 64, bh, 16); g.fill();
    g.strokeStyle = C.line; g.lineWidth = 2; roundRect(32, cy - bh / 2 - 4, W - 64, bh, 16); g.stroke();
    g.restore();
    lines.forEach((ln, i) => {
      text(ln, W / 2, cy + (i - (lines.length - 1) / 2) * 42, { size: 34, weight: 700, color: C.ink, alpha: a });
    });
  }
}

window.DUR = TL.DUR;
window.EV = EV;
window.CUES = TL.lines.map(L => ({ t0: L.t0, t1: L.t1, text: L.text }));
window.SHOTS = TL.shots.map(s => ({ id: s.id, kind: s.kind, music: s.music, t0: s.t0, t1: s.t1 }));
window.POSTER = S.hook ? S.hook.t0 + Math.min(1.6, S.hook.dur * 0.5) : 1.0;
window.render = t => {
  t = clamp(t, 0, TL.DUR - 1e-6);
  const { shot, lt } = shotAt(TL.shots, t);
  g.save();
  if (DRAW[shot.id]) DRAW[shot.id](lt, shot);
  g.restore();
  captions(t);
};
window.render(0);
window.READY = true;
