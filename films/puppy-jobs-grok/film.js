// 《小狗打工记》—— 竖屏代码动画。页面约定：window.DUR / render(t) / READY / EV / CUES / SHOTS / POSTER
import { clamp, lerp, seg, ss, spring, hash, TAU } from '/core/lib.js';

const W = 1080, H = 1920;
const INK = '#4a3a35';
const FUR = '#fffdfb';
const GREY = '#ddd6ce';
const BLUSH = '#fdc4d0';
const COLLAR = '#feb1c4';
const APRON = '#a4e5cd';
const BERET = '#a87550';
const BERET_D = '#8a5c3c';
const FONT = 'Kuai';

const cv = document.getElementById('c');
cv.width = W; cv.height = H;
const g = cv.getContext('2d');

const DUR = 42;
const MARKS = [1.55, 3.25, 13.15, 23.05, 32.9];
const SHOTS = [
  { id: 'hook', t0: 0, t1: 1.55 },
  { id: 'title', t0: 1.55, t1: 3.25 },
  { id: 'cafe', t0: 3.25, t1: 13.15 },
  { id: 'code', t0: 13.15, t1: 23.05 },
  { id: 'deli', t0: 23.05, t1: 32.9 },
  { id: 'home', t0: 32.9, t1: DUR },
];
const CAPS = [
  ['存钱罐……空了？！', 0.08, 1.58],
  ['本汪决定：出门打工！', 1.72, 3.28],
  ['抓住？本汪最拿手！', 3.42, 5.22],
  ['轻轻地……慢慢地……', 5.32, 7.28],
  ['咦？怎么停不下来？！', 7.38, 9.22],
  ['顾客：这是拿铁还是泡泡浴？', 9.32, 11.28],
  ['噗噜噗噜……（吐泡泡）', 11.38, 13.18],
  ['写代码？小意思！', 13.32, 15.22],
  ['汪汪汪汪汪汪汪汪……', 15.32, 17.22],
  ['报错了！有 Bug！', 17.32, 19.18],
  ['Bug 竟然是真虫子？！', 19.28, 21.18],
  ['追累了……先睡五分钟……', 21.28, 23.12],
  ['外卖员出发！使命必达！', 23.22, 25.12],
  ['嗅嗅……什么东西这么香？', 25.22, 27.12],
  ['就闻一下……就一下下……', 27.22, 29.12],
  ['嗝～', 29.22, 30.82],
  ['顾客：我的大鸡腿呢？？？', 30.92, 32.92],
  ['三份工作……全搞砸了……', 33.15, 35.12],
  ['咦？有人给我留了晚饭！', 35.22, 37.12],
  ['打工好难，回家真好～', 37.22, 39.12],
];

const lin = (t, a, b) => ss(seg(t, a, b));
const on = (t, a, b) => t >= a && t < b;
let LW = 7;

function reset() {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.filter = 'none';
  g.shadowColor = 'transparent';
  g.shadowBlur = 0;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.setLineDash([]);
}
function rr(x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
function scallop(x, y, rx, ry, n, amp, rot) {
  g.beginPath();
  const steps = n * 6;
  for (let i = 0; i <= steps; i++) {
    const a = rot + (i / steps) * TAU;
    const w = 1 + amp * Math.cos(n * (a - rot));
    const px = x + Math.cos(a) * rx * w;
    const py = y + Math.sin(a) * ry * w;
    if (i) g.lineTo(px, py); else g.moveTo(px, py);
  }
  g.closePath();
}
function fur(x, y, rx, ry, n, amp, rot, fill = FUR, ink = INK) {
  scallop(x, y, rx, ry, n, amp, rot);
  g.fillStyle = fill;
  g.fill();
  if (ink) { g.strokeStyle = ink; g.lineWidth = LW; g.stroke(); }
}
function txt(s, x, y, { size = 40, color = INK, align = 'center', base = 'middle', alpha = 1, weight = '' } = {}) {
  if (!s || alpha <= 0) return;
  g.save();
  g.globalAlpha *= alpha;
  g.font = `${weight} ${size}px ${FONT}`.trim();
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = base;
  g.fillText(s, x, y);
  g.restore();
}
function outlined(s, x, y, { size = 96, fill = '#e23d4a', halo = 16, rim = 26, alpha = 1 } = {}) {
  if (alpha <= 0) return;
  g.save();
  g.globalAlpha *= alpha;
  g.font = `${size}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.miterLimit = 2;
  g.lineWidth = rim;
  g.strokeStyle = INK;
  g.strokeText(s, x, y);
  g.lineWidth = halo;
  g.strokeStyle = '#fff';
  g.strokeText(s, x, y);
  g.fillStyle = fill;
  g.fillText(s, x, y);
  g.restore();
}
function heartPath(x, y, s) {
  g.beginPath();
  g.moveTo(x, y + s * 0.35);
  g.bezierCurveTo(x - s * 1.05, y - s * 0.35, x - s * 0.45, y - s * 1.05, x, y - s * 0.35);
  g.bezierCurveTo(x + s * 0.45, y - s * 1.05, x + s * 1.05, y - s * 0.35, x, y + s * 0.35);
  g.closePath();
}
function star(x, y, r, rot = 0) {
  g.save();
  g.translate(x, y); g.rotate(rot);
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = i * TAU / 4;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    g.lineTo(Math.cos(a + Math.PI / 4) * r * 0.32, Math.sin(a + Math.PI / 4) * r * 0.32);
  }
  g.closePath();
  g.fillStyle = '#fff6c2';
  g.fill();
  g.strokeStyle = INK; g.lineWidth = 4; g.stroke();
  g.restore();
}
function sunburst(c1, c2, spin) {
  g.fillStyle = c1;
  g.fillRect(0, 0, W, H);
  g.save();
  g.translate(W / 2, H * 0.48);
  g.rotate(spin);
  g.fillStyle = c2;
  const n = 16, R = 1800;
  for (let i = 0; i < n; i++) {
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, R, (i / n) * TAU, ((i + 0.5) / n) * TAU);
    g.closePath();
    g.fill();
  }
  g.restore();
}
function stripes(a, b, w = 42) {
  for (let x = 0; x < W; x += w) {
    g.fillStyle = ((x / w) | 0) % 2 ? b : a;
    g.fillRect(x, 0, w, H);
  }
}
function puff(x, y, r, col, ink) {
  const parts = [[0, 0, 1], [-0.48, -0.02, 0.62], [0.5, -0.06, 0.58], [0.05, -0.46, 0.52], [-0.12, 0.36, 0.48], [0.36, 0.3, 0.4]];
  g.fillStyle = col;
  for (const [dx, dy, k] of parts) {
    g.beginPath();
    g.arc(x + dx * r, y + dy * r, Math.max(1, r * k), 0, TAU);
    g.fill();
  }
  if (ink) {
    g.strokeStyle = ink;
    g.lineWidth = Math.max(3, r * 0.035);
    g.beginPath();
    g.arc(x, y, r * 0.96, 0, TAU);
    g.stroke();
  }
}
function bubble(x, y, r, a = 1) {
  if (r <= 1 || a <= 0) return;
  g.save();
  g.globalAlpha *= a;
  g.beginPath(); g.arc(x, y, r, 0, TAU);
  g.fillStyle = 'rgba(255,255,255,.88)';
  g.fill();
  g.strokeStyle = 'rgba(190,160,150,.85)';
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(x - r * 0.32, y - r * 0.32, r * 0.22, 0, TAU); g.fill();
  g.restore();
}
function sceneId(t) {
  let id = SHOTS[0].id;
  for (const s of SHOTS) if (t >= s.t0) id = s.id;
  return id;
}
function cloudAt(t) {
  let a = 0;
  for (const m of MARKS) {
    const u = Math.abs(t - m) / 0.42;
    if (u < 1) a = Math.max(a, Math.cos(u * Math.PI / 2));
  }
  return a;
}
function clouds(p) {
  if (p <= 0.001) return;
  g.save();
  const cols = ['#fffdfb', '#fff1e0', '#ffe6f1', '#eefaf3', '#fff6cc'];
  for (let i = 0; i < 34; i++) {
    const delay = hash(i * 9.1) * 0.22;
    const lp = clamp((p - delay) / (1 - delay));
    if (lp <= 0) continue;
    const x = hash(i * 1.7) * W;
    const y = hash(i * 3.3) * H;
    const r = (100 + hash(i * 5.5) * 180) * (0.25 + lp * 1.25);
    g.globalAlpha = clamp(lp * 1.35);
    puff(x, y, r, cols[i % cols.length], lp > 0.4 ? 'rgba(74,58,53,.22)' : null);
  }
  g.globalAlpha = clamp((p - 0.62) / 0.22);
  g.fillStyle = '#fffaf4';
  g.fillRect(0, 0, W, H);
  g.restore();
}
function shakeAt(t) {
  const hits = [[1.05, 10, 0.28], [7.5, 26, 0.5], [11.45, 10, 0.28], [17.4, 18, 0.4], [21.28, 10, 0.28], [29.35, 20, 0.5], [31.0, 14, 0.32]];
  let x = 0, y = 0;
  for (const [t0, amp, dur] of hits) {
    const u = (t - t0) / dur;
    if (u <= 0 || u >= 1) continue;
    const a = amp * (1 - u);
    x += Math.sin(u * 46) * a;
    y += Math.cos(u * 37) * a;
  }
  return [x, y];
}
function squashAt(t) {
  const hits = [7.5, 11.45, 17.4, 21.28, 29.35, 31.0];
  let k = 0;
  for (const t0 of hits) {
    const u = (t - t0) / 0.32;
    if (u > 0 && u < 1) k = Math.max(k, Math.sin(u * Math.PI));
  }
  const br = Math.sin(t * 2.7);
  return { sx: (1 + 0.09 * k) * (1 - br * 0.018), sy: (1 - 0.11 * k) * (1 + br * 0.025), bob: br * 7 };
}

function caption(text, alpha) {
  if (!text || alpha <= 0) return;
  g.save();
  g.globalAlpha = alpha;
  let size = 70;
  g.font = `${size}px ${FONT}`;
  const maxW = 940;
  while (size > 46 && g.measureText(text).width > maxW) {
    size -= 2;
    g.font = `${size}px ${FONT}`;
  }
  const tw = g.measureText(text).width;
  const h = 125;
  const w = Math.max(240, tw + 108);
  const x = (W - w) / 2, y = 1360;
  g.filter = 'blur(7px)';
  g.fillStyle = 'rgba(60,40,32,.38)';
  rr(x + 6, y + 14, w, h, h / 2);
  g.fill();
  g.filter = 'none';
  g.fillStyle = '#f6d5dc';
  rr(x - 5, y - 5, w + 10, h + 10, (h + 10) / 2);
  g.fill();
  g.fillStyle = '#4d362b';
  rr(x, y, w, h, h / 2);
  g.fill();
  g.fillStyle = '#fff';
  g.font = `${size}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, W / 2, y + h / 2 + 4);
  g.restore();
}
function capNow(t) {
  for (const [text, a, b] of CAPS) {
    const al = Math.min(lin(t, a, a + 0.12), 1 - lin(t, b - 0.1, b));
    if (al > 0) return { text, al };
  }
  return null;
}
function badge(label, n, accent) {
  const y = 188, h = 92, h2 = 64;
  const w2 = 250, w1 = 176;
  const x = (W - (w1 + w2 - 36)) / 2;
  g.save();
  g.filter = 'blur(6px)';
  g.fillStyle = 'rgba(70,50,40,.22)';
  rr(x + 4, y + 10, w1 + w2 - 30, h, h / 2);
  g.fill();
  g.filter = 'none';
  g.fillStyle = '#fff';
  g.strokeStyle = INK;
  g.lineWidth = 6;
  rr(x + w1 - 48, y, w2, h, h / 2);
  g.fill(); g.stroke();
  g.fillStyle = accent;
  rr(x, y + (h - h2) / 2, w1, h2, h2 / 2);
  g.fill(); g.stroke();
  txt(`打工 ${n}/3`, x + w1 / 2, y + h / 2 + 2, { size: 28, color: '#fff' });
  txt(label, x + w1 - 48 + w2 / 2 + 8, y + h / 2 + 2, { size: 48, color: INK });
  g.restore();
}
function stamp(x, y, n, t, t0) {
  const u = t - t0;
  if (u < 0) return;
  const s = 1 + 0.75 * Math.exp(-u * 7) * Math.cos(u * 16);
  const rot = lerp(-0.55, -0.1, clamp(u / 0.35));
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.scale(s, s);
  g.fillStyle = '#fff';
  g.strokeStyle = '#e23b3b';
  g.lineWidth = 10;
  g.beginPath(); g.arc(0, 0, 108, 0, TAU); g.fill(); g.stroke();
  g.lineWidth = 4;
  g.setLineDash([8, 7]);
  g.beginPath(); g.arc(0, 0, 90, 0, TAU); g.stroke();
  g.setLineDash([]);
  txt('失败', 0, -16, { size: 72, color: '#e23b3b' });
  txt(`×${n}`, 0, 52, { size: 40, color: '#e23b3b' });
  g.restore();
}

function brows(mood) {
  g.strokeStyle = INK;
  g.lineWidth = LW * 1.55;
  g.lineCap = 'round';
  const q = (a, b, c) => { g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(b[0], b[1], c[0], c[1]); g.stroke(); };
  if (mood === 'happy' || mood === 'joy' || mood === 'heart') {
    q([-66, -42], [-46, -64], [-26, -44]);
    q([66, -42], [46, -64], [26, -44]);
  } else if (mood === 'sad' || mood === 'worry') {
    q([-66, -34], [-46, -28], [-24, -50]);
    q([66, -34], [46, -28], [24, -50]);
  } else if (mood === 'shock' || mood === 'panic') {
    q([-68, -66], [-46, -82], [-24, -62]);
    q([68, -66], [46, -82], [24, -62]);
  } else if (mood === 'sleep') {
    q([-58, -30], [-42, -42], [-24, -32]);
    q([58, -30], [42, -42], [24, -32]);
  } else if (mood === 'focus') {
    q([-68, -50], [-46, -40], [-24, -36]);
    q([68, -50], [46, -40], [24, -36]);
  } else {
    q([-70, -58], [-46, -42], [-22, -32]);
    q([70, -58], [46, -42], [22, -32]);
  }
}
function eyeOpen(x, y, sc, wide) {
  const rx = 18 * sc * (wide ? 1.18 : 1), ry = 22 * sc * (wide ? 1.18 : 1);
  g.fillStyle = '#1c1412';
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill();
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(x - rx * 0.32, y - ry * 0.32, rx * 0.38, 0, TAU); g.fill();
  g.beginPath(); g.arc(x + rx * 0.28, y + ry * 0.22, rx * 0.18, 0, TAU); g.fill();
}
function eyeShut(x, y, kind) {
  g.strokeStyle = INK;
  g.lineWidth = LW * 1.15;
  g.beginPath();
  if (kind === 'happy') g.arc(x, y + 4, 16, Math.PI * 1.12, Math.PI * 1.88);
  else g.arc(x, y + 2, 16, Math.PI * 0.15, Math.PI * 0.85);
  g.stroke();
}
function eyeHeart(x, y) {
  heartPath(x, y + 2, 16);
  g.fillStyle = '#ff6d9a';
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = LW * 0.85;
  g.stroke();
}
function eyeSpiral(x, y) {
  g.strokeStyle = INK;
  g.lineWidth = LW * 0.7;
  g.beginPath();
  for (let i = 0; i <= 36; i++) {
    const a = i / 36 * TAU * 2.1;
    const r = 2 + i * 0.48;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i) g.lineTo(px, py); else g.moveTo(px, py);
  }
  g.stroke();
}
function mouth(mood) {
  g.strokeStyle = INK;
  g.lineWidth = LW * 1.05;
  g.lineCap = 'round';
  if (mood === 'shock' || mood === 'worry') {
    g.fillStyle = '#2a211f';
    g.beginPath(); g.ellipse(0, 46, 10, 12, 0, 0, TAU); g.fill();
    return;
  }
  if (mood === 'sad') {
    g.beginPath(); g.arc(0, 58, 14, Math.PI * 1.15, Math.PI * 1.85, true); g.stroke();
    return;
  }
  if (mood === 'dizzy' || mood === 'panic') {
    g.beginPath();
    g.moveTo(-16, 44);
    g.quadraticCurveTo(-8, 56, 0, 44);
    g.quadraticCurveTo(8, 32, 16, 46);
    g.stroke();
    return;
  }
  if (mood === 'focus') {
    g.beginPath(); g.moveTo(-14, 46); g.quadraticCurveTo(0, 54, 14, 46); g.stroke();
    return;
  }
  if (mood === 'determined') {
    g.beginPath();
    g.moveTo(-16, 42);
    g.quadraticCurveTo(-8, 54, 0, 44);
    g.quadraticCurveTo(8, 54, 16, 42);
    g.stroke();
    return;
  }
  g.fillStyle = '#3a2a28';
  g.beginPath(); g.ellipse(0, 48, 16, 13, 0, 0, TAU); g.fill();
  g.fillStyle = '#f08aa0';
  g.beginPath(); g.ellipse(0, 54, 10, 7, 0, 0, Math.PI); g.fill();
}
function face(mood, t, o) {
  const blink = (mood === 'determined' || mood === 'focus' || mood === 'worry') && ((t % 3.6) > 3.28);
  const shut = blink || mood === 'happy' || mood === 'joy' || mood === 'sleep';
  brows(mood);
  const ey = mood === 'shock' ? -6 : -2;
  if (mood === 'heart') { eyeHeart(-38, ey); eyeHeart(38, ey); }
  else if (mood === 'dizzy') { eyeSpiral(-38, ey); eyeSpiral(38, ey); }
  else if (shut) {
    const k = mood === 'sleep' ? 'flat' : 'happy';
    eyeShut(-38, ey, k); eyeShut(38, ey, k);
  } else {
    eyeOpen(-38, ey, 1, mood === 'shock' || mood === 'panic');
    eyeOpen(38, ey, 1, mood === 'shock' || mood === 'panic');
  }
  g.save();
  g.globalAlpha = 0.95;
  g.fillStyle = BLUSH;
  g.beginPath(); g.ellipse(-64, 24, 22, 14, -0.2, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(64, 24, 22, 14, 0.2, 0, TAU); g.fill();
  g.restore();
  g.fillStyle = '#2b221f';
  g.beginPath(); g.ellipse(0, 22, 13, 10, 0, 0, TAU); g.fill();
  g.fillStyle = '#fff';
  g.beginPath(); g.ellipse(-4, 18, 4, 3, -0.5, 0, TAU); g.fill();
  mouth(mood);
  if (o.tear) {
    const u = (t * 0.85) % 1;
    g.fillStyle = '#8fd4f5';
    g.beginPath(); g.ellipse(-46, 28 + u * 46, 6, 8, 0, 0, TAU); g.fill();
    g.strokeStyle = INK; g.lineWidth = LW * 0.6; g.stroke();
  }
}
function bow() {
  g.fillStyle = '#ff9ec0';
  g.strokeStyle = INK;
  g.lineWidth = LW;
  g.beginPath(); g.ellipse(-24, 6, 20, 13, -0.45, 0, TAU); g.fill(); g.stroke();
  g.beginPath(); g.ellipse(24, 6, 20, 13, 0.45, 0, TAU); g.fill(); g.stroke();
  g.beginPath(); g.arc(0, 8, 8, 0, TAU); g.fill(); g.stroke();
  g.beginPath();
  g.moveTo(-8, 14); g.lineTo(-22, 34); g.lineTo(-4, 24); g.closePath();
  g.fill(); g.stroke();
  g.beginPath();
  g.moveTo(8, 14); g.lineTo(22, 34); g.lineTo(4, 24); g.closePath();
  g.fill(); g.stroke();
}
function collar() {
  g.beginPath();
  g.moveTo(-92, 102);
  g.quadraticCurveTo(0, 82, 92, 102);
  g.lineTo(92, 112);
  const n = 8;
  for (let i = n - 1; i >= 0; i--) {
    const xR = -92 + (184 * (i + 1)) / n;
    const xL = -92 + (184 * i) / n;
    g.quadraticCurveTo((xR + xL) / 2, 134, xL, 114);
  }
  g.closePath();
  g.fillStyle = COLLAR;
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = LW;
  g.stroke();
  g.fillStyle = '#fff';
  for (let i = 0; i < 7; i++) {
    g.beginPath();
    g.arc(-60 + i * 20, 112, 3.6, 0, TAU);
    g.fill();
  }
}
function apron() {
  g.beginPath();
  g.moveTo(-72, 128);
  g.quadraticCurveTo(-80, 230, 0, 248);
  g.quadraticCurveTo(80, 230, 72, 128);
  g.quadraticCurveTo(0, 116, -72, 128);
  g.closePath();
  g.fillStyle = APRON;
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = LW;
  g.stroke();
  heartPath(0, 196, 15);
  g.fillStyle = '#ff8fb3';
  g.fill();
  g.lineWidth = LW * 0.8;
  g.stroke();
}
function beret() {
  g.save();
  g.translate(6, -108);
  g.rotate(-0.2);
  g.fillStyle = BERET;
  g.beginPath(); g.ellipse(0, 0, 76, 34, 0, 0, TAU); g.fill();
  g.strokeStyle = INK; g.lineWidth = LW; g.stroke();
  g.fillStyle = BERET_D;
  g.beginPath(); g.ellipse(0, 12, 66, 14, 0, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = BERET;
  g.beginPath(); g.arc(22, -30, 8, 0, TAU); g.fill(); g.stroke();
  g.restore();
}
function helmet() {
  g.fillStyle = '#f6c445';
  g.strokeStyle = INK;
  g.lineWidth = LW;
  g.beginPath();
  g.moveTo(-92, -48);
  g.bezierCurveTo(-108, -130, -40, -168, 0, -162);
  g.bezierCurveTo(48, -168, 112, -124, 94, -48);
  g.closePath();
  g.fill(); g.stroke();
  g.fillStyle = '#e7b534';
  g.beginPath();
  g.ellipse(-28, -118, 22, 12, -0.6, 0, TAU);
  g.fill();
  g.fillStyle = '#f6c445';
  g.beginPath(); g.ellipse(0, -46, 112, 20, 0, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = '#e7b534';
  g.beginPath(); g.ellipse(0, -40, 78, 8, 0, 0, TAU); g.fill();
  g.strokeStyle = '#8a5c3c';
  g.lineWidth = LW * 0.7;
  g.beginPath();
  g.moveTo(-78, -40); g.quadraticCurveTo(-86, -8, -70, 8);
  g.moveTo(78, -40); g.quadraticCurveTo(86, -8, 70, 8);
  g.stroke();
  g.fillStyle = '#c9844a';
  g.beginPath(); g.ellipse(0, -148, 8, 6, 0, 0, TAU); g.fill();
}
function phoneBand() {
  g.beginPath();
  g.arc(0, -6, 118, Math.PI * 1.08, Math.PI * 1.92);
  g.arc(0, -6, 98, Math.PI * 1.92, Math.PI * 1.08, true);
  g.closePath();
  g.fillStyle = '#ffb3cc';
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = LW;
  g.stroke();
}
function phoneCups() {
  for (const x of [-104, 104]) {
    g.fillStyle = '#ff9ec4';
    g.beginPath(); g.ellipse(x, 10, 30, 38, 0, 0, TAU); g.fill();
    g.strokeStyle = INK; g.lineWidth = LW; g.stroke();
    g.fillStyle = '#ffd6e6';
    g.beginPath(); g.ellipse(x, 10, 14, 20, 0, 0, TAU); g.fill();
  }
}
function glasses() {
  g.lineWidth = LW * 0.9;
  g.strokeStyle = INK;
  for (const x of [-40, 40]) {
    g.beginPath(); g.ellipse(x, 0, 32, 30, 0, 0, TAU);
    g.fillStyle = 'rgba(255,255,255,.28)';
    g.fill();
    g.stroke();
  }
  g.beginPath();
  g.moveTo(-8, 0); g.lineTo(8, 0);
  g.moveTo(-72, 2); g.lineTo(-108, 16);
  g.moveTo(72, 2); g.lineTo(108, 16);
  g.stroke();
}
function pawPoints(pose, t) {
  const tap = Math.sin(t * 16) * 6;
  switch (pose) {
    case 'up': return [[-132, -8, -0.5], [132, -4, 0.5]];
    case 'oneUp': return [[-36, 168, 0.1], [128, -20 + tap, 0.6]];
    case 'hold': return [[-78, 86, -0.35], [78, 90, 0.35]];
    case 'serve': return [[-70, 150, -0.3], [158, 28, 0.15]];
    case 'type': return [[-24, 172 + tap, 0.15], [36, 176 - tap, -0.1]];
    case 'drive': return [[-16, 124, 0.15], [64, 116, 0.05]];
    case 'sniff': return [[-136, 8, -0.9], [48, 100, 0.2]];
    case 'joy': return [[-120, 6, -0.8], [116, 20, 0.85]];
    default: return [[-72, 168, -0.25], [78, 172, 0.3]];
  }
}
function shoulders(pose) {
  if (pose === 'up' || pose === 'joy' || pose === 'sniff') return [[-62, 36], [62, 34]];
  if (pose === 'oneUp') return [[-40, 130], [58, 40]];
  if (pose === 'drive') return [[8, 112], [48, 108]];
  if (pose === 'hold' || pose === 'serve') return [[-50, 78], [54, 76]];
  return [[-46, 128], [50, 130]];
}
function arm(x0, y0, x1, y1) {
  g.lineCap = 'round';
  g.strokeStyle = INK;
  g.lineWidth = 34 + LW * 2;
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  g.strokeStyle = FUR;
  g.lineWidth = 34;
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
}
function drawPaws(pose, t) {
  const sh = shoulders(pose);
  const pts = pawPoints(pose, t);
  pts.forEach((p, i) => arm(sh[i][0], sh[i][1], p[0], p[1]));
  const pr = pose === 'drive' ? 20 : 32;
  pts.forEach((p) => {
    fur(p[0], p[1], pr, pr * 0.92, 7, 0.08, p[2]);
  });
}
function foot(x, y, rx = 26, ry = 18) {
  g.fillStyle = FUR;
  g.strokeStyle = INK;
  g.lineWidth = LW;
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill(); g.stroke();
}
function drawDog(cx, cy, sc, o) {
  const sx = sc * (o.sx || 1), sy = sc * (o.sy || 1);
  g.save();
  g.translate(cx, cy + (o.bob || 0));
  g.rotate(o.rot || 0);
  g.scale(sx, sy);
  LW = 7 / ((Math.abs(sx) + Math.abs(sy)) / 2);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  if (o.phones) phoneBand();
  if (!o.bust) {
    if (!o.seat) {
      foot(-36, 262);
      foot(40, 266);
      fur(98, 176, 30, 26, 6, 0.09, 0.4);
    } else {
      foot(-48, 210, 34, 20);
      foot(52, 214, 34, 20);
    }
    rr(-58, 112, 116, o.seat ? 100 : 140, 48);
    g.fillStyle = FUR;
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = LW;
    g.stroke();
  }
  // 外轮廓：6–8 个扇贝毛团先画，再盖上一块干净的脸
  fur(-118, 8, 50, 44, 7, 0.09, 0.3);
  fur(118, 8, 50, 44, 7, 0.09, 1.2);
  fur(-62, -88, 42, 36, 6, 0.1, 0.2);
  fur(0, -108, 48, 40, 7, 0.09, 0.7);
  fur(66, -86, 42, 36, 6, 0.1, 1.5);
  fur(-28, -70, 26, 22, 6, 0.08, 0.4);
  fur(34, -64, 24, 20, 6, 0.08, 1.1);
  scallop(0, 6, 104, 96, 14, 0.055, 0.25);
  g.fillStyle = FUR;
  g.fill();
  g.fillStyle = GREY;
  g.beginPath(); g.ellipse(-18, -36, 22, 14, -0.4, 0, TAU); g.fill();
  g.fillStyle = '#d5cfc8';
  g.beginPath(); g.ellipse(20, -24, 16, 11, 0.35, 0, TAU); g.fill();
  scallop(0, 6, 104, 96, 14, 0.055, 0.25);
  g.strokeStyle = INK;
  g.lineWidth = LW;
  g.stroke();
  if (o.hat === 'beret') beret();
  if (o.hat === 'helmet') helmet();
  face(o.mood || 'happy', o.t || 0, o);
  if (o.glasses) glasses();
  if (o.phones) phoneCups();
  collar();
  if (!o.bust) apron();
  else {
    g.beginPath();
    g.moveTo(-72, 118);
    g.quadraticCurveTo(0, 108, 72, 118);
    g.lineTo(64, 168);
    g.quadraticCurveTo(0, 180, -64, 168);
    g.closePath();
    g.fillStyle = APRON;
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = LW;
    g.stroke();
    heartPath(0, 150, 12);
    g.fillStyle = '#ff8fb3';
    g.fill();
  }
  g.save();
  g.translate(0, 116);
  bow();
  g.restore();
  if (o.paws !== false) drawPaws(o.pose || 'down', o.t || 0);
  g.restore();
}

function piggy(x, y, s, t) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.lineWidth = 6;
  g.strokeStyle = INK;
  g.fillStyle = '#ffb7cf';
  g.beginPath(); g.ellipse(0, 10, 78, 64, 0, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = '#ff9fbe';
  g.beginPath(); g.ellipse(-46, 8, 16, 20, -0.4, 0, TAU); g.fill(); g.stroke();
  g.beginPath(); g.ellipse(36, -36, 18, 22, 0.5, 0, TAU); g.fill(); g.stroke();
  g.beginPath(); g.ellipse(-20, -40, 16, 20, -0.2, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = '#ffc4d6';
  g.beginPath(); g.ellipse(-52, 16, 16, 12, 0, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = '#5c463f';
  g.beginPath(); g.arc(-58, 12, 3, 0, TAU); g.fill();
  g.beginPath(); g.arc(-46, 18, 3, 0, TAU); g.fill();
  g.fillStyle = '#2b221f';
  g.beginPath(); g.arc(-18, -4, 4, 0, TAU); g.fill();
  g.strokeStyle = INK;
  g.lineWidth = 4;
  g.beginPath(); g.moveTo(-8, -28); g.lineTo(18, -28); g.stroke();
  txt('0元', 16, 18, { size: 32, color: '#fff' });
  g.fillStyle = 'rgba(255,255,255,.7)';
  g.beginPath(); g.ellipse(-20, -8, 10, 6, -0.6, 0, TAU); g.fill();
  g.restore();
}
function fly(x, y, t) {
  const wing = Math.sin(t * 42) * 7;
  g.save();
  g.translate(x, y);
  g.fillStyle = 'rgba(180,180,180,.85)';
  g.beginPath(); g.ellipse(-7, -wing, 9, 4, -0.5, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(7, -wing, 9, 4, 0.5, 0, TAU); g.fill();
  g.fillStyle = '#4a4a4a';
  g.strokeStyle = INK;
  g.lineWidth = 3;
  g.beginPath(); g.ellipse(0, 2, 8, 6, 0, 0, TAU); g.fill(); g.stroke();
  g.restore();
}
function counter(y) {
  g.fillStyle = '#c68a58';
  g.fillRect(0, y, W, H - y);
  g.strokeStyle = 'rgba(90,52,30,.22)';
  g.lineWidth = 3;
  for (let x = 28; x < W; x += 78) {
    g.beginPath();
    g.moveTo(x, y + 20);
    g.bezierCurveTo(x + 6, y + 200, x - 4, y + 500, x + 10, H);
    g.stroke();
  }
  g.fillStyle = '#a56e42';
  g.fillRect(0, y, W, 22);
  g.strokeStyle = INK;
  g.lineWidth = 7;
  g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
}
function lamp(x, y) {
  g.strokeStyle = INK;
  g.lineWidth = 4;
  g.beginPath(); g.moveTo(x, 0); g.lineTo(x, y - 54); g.stroke();
  g.save();
  g.filter = 'blur(16px)';
  g.fillStyle = 'rgba(255,214,120,.7)';
  g.beginPath(); g.ellipse(x, y + 36, 100, 28, 0, 0, TAU); g.fill();
  g.restore();
  g.fillStyle = '#ff8fb8';
  g.strokeStyle = INK;
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(x - 72, y + 8);
  g.bezierCurveTo(x - 72, y - 78, x + 72, y - 78, x + 72, y + 8);
  g.closePath();
  g.fill(); g.stroke();
  g.fillStyle = '#ffd0e2';
  g.beginPath(); g.ellipse(x, y + 8, 72, 14, 0, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = '#ffe08a';
  g.beginPath(); g.arc(x, y + 16, 12, 0, TAU); g.fill();
}
function menu() {
  g.save();
  g.translate(56, 300);
  g.fillStyle = '#6b4a38';
  rr(0, 0, 430, 360, 16); g.fill();
  g.strokeStyle = INK; g.lineWidth = 7; g.stroke();
  g.fillStyle = '#34504a';
  rr(16, 16, 398, 328, 10); g.fill();
  txt('今日菜单', 215, 70, { size: 44, color: '#f3e2a0' });
  const rows = [['拿铁', '#f7a8c4'], ['卡布奇诺', '#9be7c8'], ['小狗特调', '#ffe08a']];
  rows.forEach((r, i) => {
    txt(r[0], 150, 150 + i * 70, { size: 36, color: '#f7f4ee', align: 'left' });
    g.fillStyle = r[1];
    g.beginPath(); g.arc(360, 150 + i * 70, 9, 0, TAU); g.fill();
  });
  g.restore();
}
function bubbleSay(x, y, s) {
  g.save();
  g.fillStyle = '#fff';
  g.strokeStyle = INK;
  g.lineWidth = 5;
  const w = 168, h = 64;
  rr(x, y, w, h, 28); g.fill(); g.stroke();
  g.beginPath();
  g.moveTo(x + 30, y + h - 2);
  g.lineTo(x + 18, y + h + 18);
  g.lineTo(x + 58, y + h - 2);
  g.fill(); g.stroke();
  txt(s, x + w / 2, y + h / 2 + 1, { size: 28 });
  g.restore();
}
function machine(x, y) {
  g.fillStyle = '#d5dde6';
  g.strokeStyle = INK;
  g.lineWidth = 6;
  rr(x, y, 230, 300, 18); g.fill(); g.stroke();
  g.fillStyle = '#bfc8d2';
  rr(x + 28, y + 36, 174, 70, 10); g.fill(); g.stroke();
  g.fillStyle = '#f48aaa';
  g.beginPath(); g.arc(x + 70, y + 150, 16, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = '#7dcea0';
  g.beginPath(); g.arc(x + 120, y + 150, 16, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = '#4a403c';
  rr(x + 78, y + 200, 70, 78, 8); g.fill();
}
function cup(x, y, steam) {
  g.save();
  g.translate(x, y);
  g.strokeStyle = INK;
  g.lineWidth = 6;
  g.fillStyle = '#f4efe8';
  g.beginPath(); g.ellipse(0, 48, 74, 16, 0, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(-50, -36);
  g.lineTo(50, -36);
  g.lineTo(40, 36);
  g.lineTo(-40, 36);
  g.closePath();
  g.fill(); g.stroke();
  g.fillStyle = '#a4e5cd';
  g.beginPath();
  g.moveTo(-48, 0); g.lineTo(48, 0); g.lineTo(45, 16); g.lineTo(-45, 16); g.closePath();
  g.fill();
  g.fillStyle = '#6a3d2e';
  g.beginPath(); g.ellipse(0, -36, 48, 14, 0, 0, TAU); g.fill();
  g.strokeStyle = INK;
  g.lineWidth = 6;
  g.beginPath(); g.arc(58, 0, 16, -1.15, 1.15); g.stroke();
  if (steam) {
    g.strokeStyle = 'rgba(255,255,255,.95)';
    g.lineWidth = 4;
    for (let i = 0; i < 3; i++) {
      const yy = (steam * 36 + i * 22) % 60;
      g.beginPath();
      g.moveTo(-16 + i * 16, -48 - yy * 0.15);
      g.quadraticCurveTo(-4 + i * 16, -70 - yy, -16 + i * 16, -88 - yy * 0.2);
      g.stroke();
    }
  }
  g.restore();
}
function monitor(x, y, w, h, mode, t) {
  g.save();
  g.fillStyle = 'rgba(50,40,40,.18)';
  rr(x + 8, y + 12, w, h, 16); g.fill();
  g.fillStyle = '#3e3936';
  g.strokeStyle = INK;
  g.lineWidth = 7;
  rr(x, y, w, h, 16); g.fill(); g.stroke();
  const sx = x + 18, sy = y + 18, sw = w - 36, sh = h - 36;
  rr(sx, sy, sw, sh, 8);
  g.fillStyle = mode === 'error' ? '#e23d45' : '#1c2433';
  g.fill();
  g.save();
  g.clip();
  if (mode === 'bars') {
    const cols = ['#f48fb1', '#80deea', '#aed581', '#fff176', '#90caf9', '#ffcc80'];
    for (let i = 0; i < 7; i++) {
      const yy = sy + 28 + i * 46 + Math.sin(t * 2 + i) * 2;
      g.fillStyle = cols[i % cols.length];
      const ww = sw * (0.35 + hash(i + 3) * 0.5);
      rr(sx + 24, yy, ww, 16, 8); g.fill();
    }
  } else if (mode === 'wang') {
    g.fillStyle = '#f6e27a';
    g.font = `30px ${FONT}`;
    g.textAlign = 'left';
    g.textBaseline = 'top';
    const lh = 40, off = (t * 90) % lh;
    for (let i = -1; i < 12; i++) g.fillText('汪'.repeat(10), sx + 16, sy + off + i * lh);
  } else if (mode === 'error') {
    txt('ERROR', x + w / 2, y + h * 0.38, { size: 64, color: '#fff' });
    txt('发现 Bug!', x + w / 2, y + h * 0.62, { size: 36, color: '#ffe08a' });
  } else {
    g.fillStyle = '#9bb0c8';
    g.font = `28px ${FONT}`;
    g.textAlign = 'left';
    g.textBaseline = 'top';
    for (let i = 0; i < 8; i++) g.fillText('z'.repeat(6 + (i % 4)), sx + 20, sy + 16 + i * 40);
  }
  g.restore();
  g.fillStyle = '#5c636c';
  g.fillRect(x + w / 2 - 14, y + h, 28, 64);
  g.beginPath(); g.ellipse(x + w / 2, y + h + 64, 64, 14, 0, 0, TAU); g.fill();
  g.strokeStyle = INK; g.lineWidth = 5; g.stroke();
  g.restore();
}
function sticky(x, y, rot, col) {
  g.save();
  g.translate(x, y); g.rotate(rot);
  g.fillStyle = col;
  rr(-42, -34, 84, 72, 8); g.fill();
  g.strokeStyle = INK; g.lineWidth = 4; g.stroke();
  g.strokeStyle = 'rgba(74,58,53,.4)';
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(-22, -4); g.lineTo(22, -4); g.moveTo(-22, 10); g.lineTo(12, 10); g.stroke();
  g.restore();
}
function dayWindow(x, y, w, h, t) {
  g.fillStyle = '#fff';
  g.strokeStyle = INK;
  g.lineWidth = 6;
  rr(x, y, w, h, 12); g.fill(); g.stroke();
  g.save();
  rr(x + 8, y + 8, w - 16, h - 16, 6); g.clip();
  g.fillStyle = '#bfe7fb';
  g.fillRect(x, y, w, h);
  g.fillStyle = '#ffe9a0';
  g.beginPath(); g.arc(x + w - 48, y + 48, 22, 0, TAU); g.fill();
  g.fillStyle = '#fff';
  g.beginPath(); g.ellipse(x + 70 + Math.sin(t * 0.4) * 8, y + 80, 36, 18, 0, 0, TAU); g.fill();
  g.restore();
  g.strokeStyle = '#fff';
  g.lineWidth = 8;
  g.beginPath();
  g.moveTo(x + w / 2, y + 8); g.lineTo(x + w / 2, y + h - 8);
  g.moveTo(x + 8, y + h / 2); g.lineTo(x + w - 8, y + h / 2);
  g.stroke();
  g.strokeStyle = INK; g.lineWidth = 6;
  rr(x, y, w, h, 12); g.stroke();
}
function keyboard(x, y, w, t) {
  g.fillStyle = '#f7f3ee';
  g.strokeStyle = INK;
  g.lineWidth = 5;
  rr(x, y, w, 54, 10); g.fill(); g.stroke();
  for (let r = 0; r < 2; r++) for (let c = 0; c < 11; c++) {
    const press = Math.sin(t * 18 + c * 0.7 + r) > 0.55;
    g.fillStyle = press ? '#e4ddd4' : '#fff';
    rr(x + 10 + c * ((w - 20) / 11), y + 8 + r * 22, (w - 20) / 11 - 4, 16, 3);
    g.fill(); g.stroke();
  }
}
function mug(x, y, t) {
  g.save();
  g.translate(x, y);
  g.fillStyle = '#ffb3cc';
  g.strokeStyle = INK;
  g.lineWidth = 5;
  rr(-20, -8, 44, 48, 8); g.fill(); g.stroke();
  g.beginPath(); g.arc(28, 16, 12, -1.2, 1.2); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.85)';
  g.lineWidth = 3;
  const yy = (t * 24) % 30;
  g.beginPath(); g.moveTo(0, -16 - yy * 0.2); g.quadraticCurveTo(10, -36 - yy, 0, -52 - yy * 0.2); g.stroke();
  g.restore();
}
function ladybug(x, y, s, rot) {
  g.save();
  g.translate(x, y); g.rotate(rot); g.scale(s, s);
  g.fillStyle = '#e23b3b';
  g.strokeStyle = INK;
  g.lineWidth = 4;
  g.beginPath(); g.ellipse(0, 6, 22, 18, 0, 0, TAU); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(0, -10); g.lineTo(0, 22); g.stroke();
  g.fillStyle = INK;
  g.beginPath(); g.arc(0, -12, 10, 0, TAU); g.fill();
  g.fillStyle = '#2a1816';
  for (const [dx, dy] of [[-8, 2], [8, 0], [-5, 12], [8, 11]]) {
    g.beginPath(); g.arc(dx, dy, 3.4, 0, TAU); g.fill();
  }
  g.restore();
}
function noteGlyph(x, y, s, rot) {
  g.save();
  g.translate(x, y); g.rotate(rot); g.scale(s, s);
  g.fillStyle = '#f48ab0';
  g.strokeStyle = INK;
  g.lineWidth = 3;
  g.beginPath(); g.ellipse(0, 0, 7, 5, -0.5, 0, TAU); g.fill(); g.stroke();
  g.fillRect(6, -28, 3, 28);
  g.restore();
}
function drumstick(x, y, rot, s) {
  g.save();
  g.translate(x, y); g.rotate(rot); g.scale(s, s);
  g.fillStyle = '#f2c14e';
  g.strokeStyle = INK;
  g.lineWidth = 4;
  rr(-6, 0, 12, 40, 4); g.fill(); g.stroke();
  g.fillStyle = '#e07a3d';
  g.beginPath(); g.arc(0, 2, 18, 0, TAU); g.fill(); g.stroke();
  g.restore();
}
function buildings(scroll) {
  const spec = [
    ['#f7c1d9', '#e48aaa', 160, 300],
    ['#ffe3a8', '#f0a05a', 140, 360],
    ['#b7ecda', '#e48aaa', 170, 280],
    ['#d5def8', '#f0a05a', 150, 390],
    ['#f7c1d9', '#e48aaa', 150, 260],
    ['#fff0b8', '#f0a05a', 130, 330],
    ['#c9f0e4', '#7ec8a4', 160, 300],
  ];
  const base = 1040;
  const total = spec.reduce((s, b) => s + b[2] + 28, 0);
  let x = -((scroll % total) + total) % total - 40;
  for (let k = 0; k < 3; k++) {
    for (const b of spec) {
      const [c, roof, w, h] = b;
      if (x < W + 40) {
        g.fillStyle = '#7dce8a';
        g.strokeStyle = INK;
        g.lineWidth = 5;
        g.beginPath(); g.arc(x - 10, base - 20, 26, 0, TAU); g.fill(); g.stroke();
        g.fillStyle = c;
        rr(x, base - h, w, h, 8); g.fill(); g.stroke();
        g.fillStyle = roof;
        g.beginPath();
        g.moveTo(x - 10, base - h + 20);
        g.lineTo(x + w / 2, base - h - 48);
        g.lineTo(x + w + 10, base - h + 20);
        g.closePath(); g.fill(); g.stroke();
        for (let r = 0; r < 4; r++) for (let c2 = 0; c2 < 2; c2++) {
          g.fillStyle = '#fff';
          rr(x + 22 + c2 * (w * 0.42), base - h + 36 + r * 58, 36, 32, 4);
          g.fill(); g.stroke();
        }
      }
      x += w + 28;
    }
  }
}
function road(y, dash) {
  g.fillStyle = '#6a6e78';
  g.fillRect(0, y, W, 160);
  g.strokeStyle = INK;
  g.lineWidth = 6;
  g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
  g.fillStyle = '#fff';
  const off = dash % 90;
  for (let x = -90 + (90 - off); x < W; x += 90) rr(x, y + 72, 44, 10, 4), g.fill();
  g.fillStyle = '#f3e0c8';
  g.fillRect(0, y + 160, W, H - y - 160);
  g.strokeStyle = 'rgba(120,82,48,.2)';
  g.lineWidth = 3;
  for (let x = 24; x < W; x += 70) {
    g.beginPath(); g.moveTo(x, y + 160); g.lineTo(x + 12, H); g.stroke();
  }
}
function scooter(x, y, t, spin) {
  g.save();
  g.translate(x, y);
  g.scale(2.15, 2.15);
  for (const wx of [-118, 128]) {
    g.save();
    g.translate(wx, 78);
    g.rotate(spin);
    g.fillStyle = '#3a3538';
    g.beginPath(); g.arc(0, 0, 34, 0, TAU); g.fill();
    g.strokeStyle = INK; g.lineWidth = 6; g.stroke();
    g.strokeStyle = '#e6e0da';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(-16, 0); g.lineTo(16, 0);
    g.moveTo(0, -16); g.lineTo(0, 16);
    g.stroke();
    g.fillStyle = '#f4f1ec';
    g.beginPath(); g.arc(0, 0, 8, 0, TAU); g.fill();
    g.restore();
  }
  g.fillStyle = '#8fd8bf';
  g.strokeStyle = INK;
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(-188, 40);
  g.quadraticCurveTo(-210, -48, -36, -52);
  g.lineTo(168, -16);
  g.quadraticCurveTo(210, 8, 172, 56);
  g.quadraticCurveTo(10, 108, -188, 40);
  g.closePath();
  g.fill(); g.stroke();
  g.fillStyle = '#b7ebda';
  g.beginPath();
  g.moveTo(-150, 18);
  g.quadraticCurveTo(-40, -28, 120, 4);
  g.lineTo(130, 28);
  g.quadraticCurveTo(-20, 8, -140, 36);
  g.closePath();
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(96, -10);
  g.quadraticCurveTo(168, -78, 138, -128);
  g.stroke();
  g.fillStyle = '#4a403c';
  rr(116, -140, 50, 16, 6); g.fill();
  g.restore();
}
function nightWin(x, y, r) {
  g.strokeStyle = INK;
  g.lineWidth = 8;
  g.fillStyle = '#ffb7d0';
  g.beginPath();
  g.moveTo(x - r - 20, y - r);
  g.quadraticCurveTo(x - r + 10, y, x - r - 10, y + r);
  g.lineTo(x - r + 16, y + r * 0.7);
  g.quadraticCurveTo(x - r + 30, y, x - r + 6, y - r * 0.8);
  g.closePath();
  g.fill(); g.stroke();
  g.beginPath();
  g.moveTo(x + r + 20, y - r);
  g.quadraticCurveTo(x + r - 10, y, x + r + 10, y + r);
  g.lineTo(x + r - 16, y + r * 0.7);
  g.quadraticCurveTo(x + r - 30, y, x + r - 6, y - r * 0.8);
  g.closePath();
  g.fill(); g.stroke();
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(x, y, r + 10, 0, TAU); g.fill(); g.stroke();
  g.save();
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip();
  g.fillStyle = '#2a3a68';
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.fillStyle = '#ffe7a3';
  g.beginPath(); g.arc(x + 20, y + 10, r * 0.28, 0, TAU); g.fill();
  g.fillStyle = '#2a3a68';
  g.beginPath(); g.arc(x + 32, y + 4, r * 0.22, 0, TAU); g.fill();
  g.fillStyle = '#fff4c4';
  for (let i = 0; i < 7; i++) {
    g.beginPath();
    g.arc(x - r * 0.6 + hash(i) * r * 1.2, y - r * 0.55 + hash(i + 4) * r, 2.4, 0, TAU);
    g.fill();
  }
  g.restore();
  g.strokeStyle = '#fff';
  g.lineWidth = 6;
  g.beginPath(); g.moveTo(x, y - r); g.lineTo(x, y + r); g.stroke();
  g.strokeStyle = INK; g.lineWidth = 8;
  g.beginPath(); g.arc(x, y, r + 10, 0, TAU); g.stroke();
}
function floorLamp(x, y) {
  g.strokeStyle = '#a87550';
  g.lineWidth = 8;
  g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 420); g.stroke();
  g.fillStyle = '#f6d56a';
  g.strokeStyle = INK;
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(x - 70, y - 400);
  g.lineTo(x + 70, y - 400);
  g.lineTo(x + 46, y - 500);
  g.lineTo(x - 46, y - 500);
  g.closePath();
  g.fill(); g.stroke();
  g.save();
  g.filter = 'blur(16px)';
  g.fillStyle = 'rgba(255,220,140,.45)';
  g.beginPath(); g.ellipse(x, y - 380, 80, 20, 0, 0, TAU); g.fill();
  g.restore();
}
function plankFloor(y) {
  const grd = g.createLinearGradient(0, 0, 0, y);
  grd.addColorStop(0, '#f8dcc4');
  grd.addColorStop(1, '#f3c9a8');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, y);
  g.fillStyle = '#e7c091';
  g.fillRect(0, y, W, H - y);
  g.strokeStyle = 'rgba(140,90,50,.28)';
  g.lineWidth = 3;
  for (let yy = y + 36; yy < H; yy += 56) {
    g.beginPath(); g.moveTo(0, yy); g.lineTo(W, yy); g.stroke();
  }
  g.strokeStyle = INK;
  g.lineWidth = 6;
  g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
}
function noteCard(x, y, s, a = 1) {
  if (a <= 0 || s <= 0) return;
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.globalAlpha *= a;
  g.fillStyle = 'rgba(80,50,40,.15)';
  rr(-150, -110, 300, 230, 16); g.fill();
  g.fillStyle = '#fffdfb';
  g.strokeStyle = INK;
  g.lineWidth = 6;
  rr(-156, -120, 312, 230, 16); g.fill(); g.stroke();
  g.fillStyle = '#ffb7d0';
  g.save(); g.rotate(-0.08);
  rr(-28, -148, 70, 28, 4); g.fill();
  g.restore();
  txt('辛苦啦', 0, -36, { size: 64, color: '#f07098' });
  txt('小宝贝', 0, 40, { size: 56, color: INK });
  g.restore();
}
function bone(x, y, s) {
  g.save();
  g.translate(x, y); g.scale(s, s); g.rotate(-0.4);
  g.fillStyle = '#f4e2c4';
  g.strokeStyle = INK;
  g.lineWidth = 4;
  rr(-16, -8, 50, 16, 8); g.fill(); g.stroke();
  for (const [dx, dy] of [[-16, -8], [-16, 8], [28, -8], [28, 8]]) {
    g.beginPath(); g.arc(dx, dy, 9, 0, TAU); g.fill(); g.stroke();
  }
  g.restore();
}

function actAt(t) {
  const q = squashAt(t);
  const base = { t, sx: q.sx, sy: q.sy, bob: q.bob, rot: 0, paws: true, tear: false, glasses: false, phones: false, hat: null, seat: false, pose: 'down', mood: 'happy' };
  if (t < 1.55) return { ...base, mood: t < 1.12 ? 'worry' : 'determined', pose: 'hold' };
  if (t < 3.25) return { ...base, mood: 'determined', pose: 'down' };
  if (t < 13.15) {
    let mood = 'happy', pose = 'serve';
    if (t >= 5.32 && t < 7.45) { mood = 'focus'; pose = 'up'; }
    else if (t >= 7.45 && t < 9.3) { mood = 'shock'; pose = 'up'; }
    else if (t >= 9.3 && t < 11.38) { mood = 'panic'; pose = 'up'; }
    else if (t >= 11.38) { mood = 'sleep'; pose = 'up'; }
    else if (t >= 4.3) { mood = 'determined'; pose = 'up'; }
    return { ...base, mood, pose, hat: 'beret' };
  }
  if (t < 23.05) {
    let mood = 'determined', pose = 'oneUp', glasses = true, phones = true;
    if (t >= 15.32 && t < 17.32) { mood = 'happy'; pose = 'type'; }
    else if (t >= 17.32 && t < 19.28) { mood = 'shock'; pose = 'oneUp'; }
    else if (t >= 19.28 && t < 21.28) { mood = 'worry'; pose = 'oneUp'; }
    else if (t >= 21.28) { mood = 'sleep'; pose = 'type'; }
    return { ...base, mood, pose, glasses, phones };
  }
  if (t < 32.9) {
    let mood = 'happy', pose = 'drive';
    if (t >= 25.22 && t < 27.22) { mood = 'focus'; pose = 'sniff'; }
    else if (t >= 27.22 && t < 29.22) { mood = 'heart'; pose = 'sniff'; }
    else if (t >= 29.22 && t < 30.92) { mood = 'dizzy'; pose = 'drive'; }
    else if (t >= 30.92) { mood = 'sad'; pose = 'drive'; }
    const wob = t >= 29.22 && t < 31.2 ? Math.sin(t * 14) * 0.08 : Math.sin(t * 6) * 0.02;
    return { ...base, mood, pose, hat: 'helmet', rot: wob, tear: t >= 30.92 };
  }
  const seated = t >= 33.7;
  let mood = 'sad', pose = 'down';
  if (t >= 35.22 && t < 37.15) { mood = 'joy'; pose = 'joy'; }
  else if (t >= 37.15) { mood = 'joy'; pose = 'joy'; }
  return { ...base, mood, pose, seat: seated, tear: t < 35.22 && seated, bob: q.bob + (t < 33.7 ? Math.abs(Math.sin(t * 12)) * -10 : 0) };
}

function drawHook(t, o) {
  sunburst('#f7b7d4', '#fde3ef', t * 0.05);
  const yel = lin(t, 1.02, 1.5);
  if (yel > 0) {
    g.save(); g.globalAlpha = yel;
    sunburst('#ffe56b', '#fff3b0', t * 0.08);
    g.restore();
  }
  const titleA = 1 - lin(t, 1.2, 1.7);
  if (titleA > 0) {
    const pop = spring(t * 1.1, 6.5, 0.38);
    g.save();
    g.translate(W / 2, 300);
    g.scale(pop, pop);
    outlined('小狗破产了？！', 0, 0, { size: 92, fill: yel > 0.4 ? '#f3d7a4' : '#e23d4a', alpha: titleA });
    g.restore();
  }
  g.save();
  g.filter = 'blur(8px)';
  g.fillStyle = 'rgba(80,50,40,.18)';
  g.beginPath(); g.ellipse(540, 1180, 180, 28, 0, 0, TAU); g.fill();
  g.restore();
  const cx = 540, cy = 760;
  drawDog(cx, cy, 1.72, { ...o, paws: false });
  piggy(cx, cy + 150, 1.15, t);
  g.save();
  g.translate(cx, cy + (o.bob || 0));
  g.scale(1.72 * o.sx, 1.72 * o.sy);
  LW = 7 / 1.72;
  drawPaws('hold', t);
  g.restore();
  if (t > 1.05) fly(cx + lerp(180, 90, lin(t, 1.05, 1.35)), cy - 150, t);
}
function drawTitle(t, o) {
  sunburst('#ffe56b', '#fff3b0', t * 0.12);
  for (let i = 0; i < 5; i++) {
    const a = lin(t, 1.7 + i * 0.08, 2.05 + i * 0.08);
    if (a <= 0) continue;
    const pos = [[180, 460], [900, 420], [140, 980], [940, 900], [820, 640]][i];
    g.save(); g.globalAlpha = a;
    star(pos[0], pos[1], 18 + (i % 3) * 6, t + i);
    g.restore();
  }
  const pop = spring(t - 1.62, 6.2, 0.4);
  g.save();
  g.translate(W / 2, 300);
  g.scale(pop, pop);
  outlined('小狗打工记', 0, 0, { size: 108, fill: '#f48ab0', halo: 18, rim: 28 });
  g.restore();
  g.save();
  g.filter = 'blur(8px)';
  g.fillStyle = 'rgba(80,50,40,.16)';
  g.beginPath(); g.ellipse(540, 1240, 200, 30, 0, 0, TAU); g.fill();
  g.restore();
  drawDog(540, 820, 1.78, o);
}
function drawCafe(t, o) {
  stripes('#f8e6d8', '#f3d3c4', 46);
  lamp(860, 300);
  menu();
  machine(48, 760);
  bubbleSay(620, 330, '汪汪咖啡');
  badge('咖啡师', 1, '#c4a06a');
  const foamT = lin(t, 7.45, 8.15);
  const foamHold = t >= 8.15 ? 1 : foamT;
  const faceFoam = lin(t, 8.3, 9.1) * (t < 13.15 ? 1 : 0);
  drawDog(530, 800, 1.9, o);
  if (foamHold > 0) {
    puff(760, 990 - foamHold * 50, 36 + foamHold * 48, '#fff7ee', null);
    puff(680, 930 - foamHold * 40, 28 + foamHold * 36, '#fff4e6', null);
  }
  // 奶泡先盖住整张脸，再退开，露出惊慌的表情
  const cover = lin(t, 8.15, 8.7) * (1 - lin(t, 9.15, 9.7));
  if (cover > 0.04) {
    const s = 0.45 + cover * 0.7;
    puff(500, 860, 200 * s, '#fff6ee', null);
    puff(620, 800, 170 * s, '#fffaf4', null);
    puff(430, 740, 150 * s, '#fff3e6', null);
    puff(560, 680, 160 * s, '#fffdf8', null);
    puff(680, 900, 140 * s, '#fff1e2', null);
    for (let i = 0; i < 8; i++) {
      bubble(400 + hash(i + 1) * 340, 640 + hash(i + 4) * 260, 8 + hash(i + 8) * 16, 0.8);
    }
  }
  if (faceFoam > 0) {
    for (let i = 0; i < 11; i++) {
      const life = (t * 0.75 + hash(i)) % 1;
      bubble(420 + hash(i + 2) * 320, 980 - life * 280, (1 - life) * (12 + hash(i + 5) * 16), 0.35 + 0.65 * (1 - life));
    }
  }
  counter(1120);
  const shake = Math.sin(t * 40) * lin(t, 7.2, 7.5) * (1 - lin(t, 7.7, 8.0)) * 8;
  cup(800 + shake, 1048, t);
  if (t >= 11.45) stamp(430, 620, 1, t, 11.45);
}
function drawCode(t, o) {
  g.fillStyle = '#e4ebfb';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 46; i++) {
    g.fillStyle = 'rgba(255,255,255,.75)';
    g.beginPath();
    g.arc(hash(i * 2.2) * W, hash(i * 4.4) * 1000, 3 + hash(i) * 3.5, 0, TAU);
    g.fill();
  }
  sticky(90, 390, -0.12, '#fff1a8');
  sticky(190, 410, 0.08, '#ffd0e0');
  sticky(280, 378, -0.04, '#c9f3e4');
  dayWindow(720, 250, 280, 230, t);
  badge('程序员', 2, '#5c7fd6');
  let mode = 'bars';
  if (t >= 15.32 && t < 17.32) mode = 'wang';
  else if (t >= 17.32 && t < 21.28) mode = 'error';
  else if (t >= 21.28) mode = 'zzz';
  const mx = t >= 17.32 && t < 18.2 ? Math.sin(t * 40) * 8 : 0;
  monitor(70 + mx, 430, 500, 420, mode, t);
  if (t >= 17.32 && t < 19.3) {
    g.fillStyle = '#f0b429';
    g.strokeStyle = INK;
    g.lineWidth = 5;
    g.beginPath(); g.arc(560, 470, 28, 0, TAU); g.fill(); g.stroke();
    txt('!', 560, 474, { size: 36, color: '#fff' });
  }
  drawDog(720, 860, 1.72, o);
  if (t >= 19.28) {
    const u = lin(t, 19.28, 20.05);
    const bx = lerp(300, 760, u) + Math.sin(t * 7) * 10;
    const by = lerp(520, 760, u) + Math.cos(t * 6) * 12;
    const rest = t >= 21.28 ? 0 : 1;
    ladybug(t >= 21.28 ? 800 : bx, t >= 21.28 ? 740 : by, 1.15, Math.sin(t * 4) * 0.3 * rest);
  }
  if (t >= 21.28) {
    for (let i = 0; i < 3; i++) {
      const u = ((t * 0.45) + i * 0.33) % 1;
      txt('Z', 860 + u * 20, 700 - u * 120, { size: 28 + u * 20, color: '#7aa0d8', alpha: 1 - u });
    }
  }
  g.fillStyle = '#e8cba6';
  g.fillRect(0, 1040, W, 70);
  g.fillStyle = '#d7b48c';
  g.fillRect(0, 1040, W, 16);
  g.strokeStyle = INK; g.lineWidth = 6;
  g.beginPath(); g.moveTo(0, 1040); g.lineTo(W, 1040); g.stroke();
  g.fillStyle = '#f6e2c8';
  g.fillRect(0, 1110, W, H - 1110);
  keyboard(560, 1000, 300, t >= 15.32 && t < 17.4 ? t : 0);
  mug(900, 980, t);
  if (t >= 21.28) stamp(430, 560, 2, t, 21.28);
}
function drawDeli(t, o) {
  const grd = g.createLinearGradient(0, 0, 0, 900);
  grd.addColorStop(0, '#8fd0f5');
  grd.addColorStop(1, '#e5f6ff');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 4; i++) {
    const x = (hash(i) * W + t * (12 + i * 4)) % (W + 200) - 100;
    puff(x, 180 + i * 70, 50 + i * 8, '#fff', null);
  }
  const moving = t < 27.2;
  const scroll = moving ? t * 160 : 27.2 * 160;
  buildings(scroll);
  badge('外卖员', 3, '#f0a04a');
  road(1040, moving ? t * 220 : 0);
  const cx = 540, cy = 620;
  const lid = lin(t, 27.2, 27.7);
  if (t >= 23.3 && t < 25.3) {
    noteGlyph(760, 640 + Math.sin(t * 6) * 8, 1.4, -0.2);
    noteGlyph(820, 700 + Math.cos(t * 5) * 6, 1.1, 0.3);
  }
  if (t >= 25.2 && t < 27.3) {
    txt('?', 300, 640 + Math.sin(t * 5) * 6, { size: 54, color: '#f0a04a' });
  }
  drawDog(cx, cy, 1.55, { ...o, paws: false, bust: true });
  scooter(cx + 10, 900, t, moving ? t * 10 : t);
  g.save();
  g.translate(168, 700);
  g.fillStyle = '#f29a4a';
  g.strokeStyle = INK;
  g.lineWidth = 6;
  rr(0, 0, 168, 118, 14); g.fill(); g.stroke();
  txt('汪汪外卖', 84, 74, { size: 28, color: '#fff' });
  if (lid > 0.35) drumstick(70, 36, -0.4, 0.85);
  g.save();
  g.translate(0, 0);
  g.rotate(-lid * 1.25);
  g.fillStyle = '#ffb15e';
  rr(0, -20, 168, 30, 8); g.fill(); g.stroke();
  g.restore();
  g.restore();
  g.save();
  g.translate(cx, cy + (o.bob || 0));
  g.rotate(o.rot || 0);
  g.scale(1.55 * o.sx, 1.55 * o.sy);
  LW = 7 / 1.55;
  drawPaws(o.pose === 'sniff' ? 'sniff' : 'drive', t);
  g.restore();
  if (t >= 29.3 && t < 31) {
    for (let i = 0; i < 3; i++) bubble(cx + 80, cy - 40 - ((t * 50 + i * 20) % 80), 10, 0.7);
  }
  if (t >= 30.95) {
    for (let i = 0; i < 3; i++) {
      const u = clamp((t - 31.0) / 0.5);
      const spot = [[120, 460, -1.1], [300, 400, -0.3], [460, 480, 0.7]][i];
      drumstick(lerp(240, spot[0], u), lerp(720, spot[1], u), spot[2], 1.45);
    }
    stamp(360, 640, 3, t, 31.0);
    g.save();
    g.fillStyle = '#fff';
    g.strokeStyle = INK;
    g.lineWidth = 5;
    rr(620, 300, 280, 90, 24); g.fill(); g.stroke();
    g.fillStyle = '#f0b429';
    g.beginPath(); g.arc(668, 344, 22, 0, TAU); g.fill(); g.stroke();
    txt('?', 668, 346, { size: 28, color: '#fff' });
    txt('已送达?', 790, 346, { size: 32 });
    g.fillStyle = '#e23b3b';
    g.beginPath(); g.arc(880, 314, 16, 0, TAU); g.fill();
    txt('3', 880, 316, { size: 20, color: '#fff' });
    g.restore();
  }
}
function drawHome(t, o) {
  plankFloor(1240);
  nightWin(250, 420, 150);
  floorLamp(860, 1220);
  g.save();
  g.strokeStyle = '#f3b7cf';
  g.setLineDash([10, 8]);
  g.lineWidth = 4;
  g.beginPath(); g.ellipse(520, 1260, 340, 90, 0, 0, TAU); g.stroke();
  g.restore();
  g.fillStyle = '#f7b9d2';
  g.strokeStyle = INK;
  g.lineWidth = 6;
  g.beginPath(); g.ellipse(560, 1224, 280, 86, 0, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = '#ffd0e2';
  g.beginPath(); g.ellipse(560, 1196, 240, 52, 0, 0, TAU); g.fill();
  const walk = lin(t, 33.0, 33.65);
  const cx = lerp(980, 560, walk);
  const onCushion = lin(t, 37.05, 37.55);
  const cy = lerp(990, 960, onCushion);
  g.save();
  g.translate(150, 1160);
  g.rotate(1.15);
  piggy(0, 0, 0.7, t);
  g.restore();
  if (t >= 35.15) {
    g.fillStyle = '#b7ebda';
    g.strokeStyle = INK;
    g.lineWidth = 5;
    rr(250, 1120, 150, 70, 12); g.fill(); g.stroke();
    bone(300, 1148, 0.8);
  }
  const notePop = spring(Math.max(0, t - 35.28), 7, 0.42);
  const noteDown = lin(t, 37.05, 37.6);
  if (notePop > 0) {
    const nx = lerp(cx, 310, noteDown);
    const ny = lerp(cy - 390, 1090, noteDown);
    const ns = lerp(1.05, 0.42, noteDown) * clamp(notePop, 0, 1.08);
    noteCard(nx, ny, ns, 1);
  }
  if (t > 37.2) {
    for (let i = 0; i < 6; i++) {
      const u = ((t - 37.2) * 0.45 + i * 0.17) % 1;
      heartPath(620 + Math.sin(i * 2 + t) * 40, 900 - u * 280, 10 + (i % 3) * 3);
      g.globalAlpha = 1 - u;
      g.fillStyle = i % 2 ? '#ffb3cc' : '#ff8fb3';
      g.fill();
      g.globalAlpha = 1;
    }
  }
  const blanket = lin(t, 39.0, 39.4);
  drawDog(cx, cy, 1.16, { ...o, seat: t >= 33.65 });
  if (blanket > 0) {
    g.save();
    g.globalAlpha = blanket;
    g.fillStyle = '#b7ebda';
    g.strokeStyle = INK;
    g.lineWidth = 6;
    g.beginPath(); g.ellipse(560, 1160, 200, 48, 0, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#ff8fb3';
    for (const dx of [-70, 0, 70]) {
      heartPath(560 + dx, 1164, 10); g.fill();
    }
    g.restore();
  }
  if (t >= 39.2) askCard(t);
}
function askCard(t) {
  const p = clamp(spring(t - 39.2, 6.5, 0.45), 0, 1.12);
  if (p <= 0) return;
  g.save();
  g.translate(W / 2, 640);
  g.scale(p, p);
  g.fillStyle = 'rgba(80,50,40,.16)';
  rr(-400, -250, 820, 540, 36); g.fill();
  g.fillStyle = '#fffdfb';
  g.strokeStyle = INK;
  g.lineWidth = 7;
  rr(-410, -270, 820, 540, 36); g.fill(); g.stroke();
  g.strokeStyle = '#f3b0c4';
  g.lineWidth = 4;
  g.setLineDash([10, 8]);
  rr(-386, -248, 772, 496, 28); g.stroke();
  g.setLineDash([]);
  txt('如果小狗来你家打工', 0, -150, { size: 46 });
  txt('你会给它安排什么工作？', 0, -80, { size: 46, color: '#f07098' });
  const btns = [['暖床员', '#a4e5cd', 39.55], ['陪玩员', '#ffd56a', 40.05], ['试吃员', '#ffb3cc', 40.55]];
  btns.forEach((b, i) => {
    const bp = t < b[2] ? 0 : clamp(spring(t - b[2], 8, 0.42), 0, 1.12);
    if (bp <= 0) return;
    g.save();
    g.translate(-250 + i * 250, 40);
    g.scale(bp, bp);
    g.fillStyle = b[1];
    g.strokeStyle = INK;
    g.lineWidth = 5;
    rr(-90, -36, 180, 72, 36); g.fill(); g.stroke();
    txt(b[0], 0, 2, { size: 32 });
    g.restore();
  });
  const fp = t < 40.9 ? 0 : lin(t, 40.9, 41.15);
  txt('— 评论区告诉我！—', 0, 150, { size: 40, color: '#e23b3b', alpha: fp });
  g.restore();
}

const DRAW = { hook: drawHook, title: drawTitle, cafe: drawCafe, code: drawCode, deli: drawDeli, home: drawHome };

function buildEV() {
  const EV = [];
  const sfx = (t, name, gain = 0.6, extra = {}) => EV.push({ t: +t.toFixed(3), type: 'sfx', name, gain, ...extra });
  for (const s of SHOTS) EV.push({ t: s.t0, type: 'shot', id: s.id, t1: s.t1 });
  sfx(0.12, 'pop', 0.45);
  sfx(1.08, 'whoosh', 0.35, { d: 0.5 });
  sfx(1.62, 'pop', 0.5);
  sfx(1.7, 'ding', 0.25, { f: 1174 });
  for (const m of MARKS) sfx(m - 0.05, 'whoosh', 0.4, { d: 0.55 });
  sfx(3.5, 'pop', 0.4);
  sfx(5.4, 'tick', 0.25);
  sfx(7.5, 'boom', 0.7);
  sfx(7.7, 'pop', 0.35);
  sfx(9.4, 'pop', 0.4);
  sfx(11.45, 'thump', 0.7);
  sfx(11.5, 'shutter', 0.4);
  for (let i = 0; i < 8; i++) sfx(15.4 + i * 0.22, 'key', 0.18);
  sfx(17.4, 'glitch', 0.55, { d: 0.28 });
  sfx(17.45, 'thump', 0.4);
  sfx(19.35, 'pop', 0.45);
  sfx(21.28, 'thump', 0.65);
  sfx(21.35, 'shutter', 0.35);
  sfx(23.3, 'pop', 0.4);
  sfx(23.5, 'whoosh', 0.28, { d: 0.8, lo: 300, hi: 1800 });
  sfx(27.25, 'pop', 0.5);
  sfx(29.35, 'pop', 0.55);
  sfx(29.5, 'whoosh', 0.3, { d: 0.4 });
  sfx(31.0, 'thump', 0.75);
  sfx(31.08, 'shutter', 0.4);
  sfx(35.3, 'pop', 0.5);
  sfx(35.4, 'ding', 0.4, { f: 1568 });
  sfx(37.25, 'ding', 0.28, { f: 1318 });
  sfx(37.55, 'ding', 0.22, { f: 1760 });
  sfx(39.25, 'whoosh', 0.3, { d: 0.45 });
  sfx(39.55, 'pop', 0.4);
  sfx(40.05, 'pop', 0.4);
  sfx(40.55, 'pop', 0.45);
  sfx(40.95, 'ding', 0.3, { f: 1975 });
  EV.sort((a, b) => a.t - b.t);
  return EV;
}

window.DUR = DUR;
window.EV = buildEV();
window.CUES = [
  ...CAPS.map(([text, t0, t1]) => ({ t0, t1, text })),
  { t0: 39.3, t1: DUR, text: '如果小狗来你家打工，你会给它安排什么工作？' },
];
window.SHOTS = SHOTS;
window.POSTER = 2.15;
window.render = (t) => {
  reset();
  t = clamp(t, 0, DUR - 1e-4);
  const o = actAt(t);
  const [sx, sy] = shakeAt(t);
  g.save();
  g.translate(sx, sy);
  DRAW[sceneId(t)](t, o);
  g.restore();
  clouds(cloudAt(t));
  const cap = capNow(t);
  if (cap) caption(cap.text, cap.al);
};
await document.fonts.load(`70px ${FONT}`, '小狗打工记存钱罐轻轻地');
await document.fonts.ready;
window.READY = true;
