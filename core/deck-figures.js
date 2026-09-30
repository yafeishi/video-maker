// 讲解用的动态图示。镜头的 "figure" 字段选一个，画面以图为主，标题留在上方，台词仍走字幕。
// 图的阶段对齐这个镜头的 itemT（条目）或 hitT（关键词）或每一句配音的起点（s.vt）。
import { clamp, lerp, seg, ss, eo, eio, TAU } from './lib.js';

export const FIGURES = ['fall', 'boost', 'engines', 'deploy', 'refuel', 'early', 'splash'];

const at = (s, i) => s.vt?.[i]?.t0 ?? s.sp.t0;
const show = (s, k, t) => (s.itemT && s.itemT[k] != null) ? ss(seg(t, s.itemT[k] - .08, s.itemT[k] + .4)) : 0;
const label = (s, k) => {
  const it = (s.data.items || [])[k];
  return it == null ? '' : typeof it === 'object' ? it.text ?? it.label ?? '' : String(it);
};

function quad(p0, p1, p2, t) {
  const u = 1 - t;
  return {
    x: u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    y: u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    dx: 2 * u * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]),
    dy: 2 * u * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]),
  };
}
function strokeQuad(g, p0, p1, p2) {
  g.beginPath(); g.moveTo(p0[0], p0[1]); g.quadraticCurveTo(p1[0], p1[1], p2[0], p2[1]); g.stroke();
}
function ship(g, x, y, ang, sc, color, glow = 0) {
  g.save(); g.translate(x, y); g.rotate(ang + Math.PI / 2); g.scale(sc, sc);
  if (glow) { g.shadowColor = color; g.shadowBlur = glow; }
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, -22); g.lineTo(9, 10); g.lineTo(4, 6); g.lineTo(4, 16); g.lineTo(-4, 16); g.lineTo(-4, 6); g.lineTo(-9, 10);
  g.closePath(); g.fill(); g.restore();
}
function flame(g, x, y, ang, len, color, alpha) {
  g.save(); g.translate(x, y); g.rotate(ang + Math.PI / 2); g.globalAlpha *= alpha;
  g.fillStyle = color; g.beginPath();
  g.moveTo(-5, 14); g.lineTo(0, 14 + len); g.lineTo(5, 14); g.closePath(); g.fill(); g.restore();
}
function earthDisk(g, x, y, r, C) {
  const grd = g.createRadialGradient(x - r * .35, y - r * .4, r * .15, x, y, r);
  grd.addColorStop(0, '#24507f'); grd.addColorStop(.55, '#143056'); grd.addColorStop(1, '#0b1c33');
  g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.save(); g.strokeStyle = C.acc; g.globalAlpha *= .45; g.lineWidth = 4;
  g.beginPath(); g.arc(x, y, r + 10, 0, TAU); g.stroke(); g.restore();
}
function sat(g, x, y, w, h, color, alpha = 1) {
  g.save(); g.globalAlpha *= alpha; g.translate(x, y); g.fillStyle = color;
  g.fillRect(-w / 2, -h / 2, w, h);
  g.fillStyle = '#d5ecff'; g.globalAlpha *= .8;
  g.fillRect(-w * .9, -h * .28, w * .28, h * .56);
  g.fillRect(w * .62, -h * .28, w * .28, h * .56);
  g.restore();
}

function figFall(a, lt, s) {
  const { g, text, C } = a, t = s.t0 + lt;
  const ground = [0, 860, 480];
  g.save();
  g.fillStyle = '#10243f'; g.beginPath(); g.arc(ground[0], ground[1], ground[2], 0, TAU); g.fill();
  g.strokeStyle = C.line; g.lineWidth = 3; g.beginPath(); g.arc(ground[0], ground[1], ground[2] + 14, Math.PI * 1.22, Math.PI * 1.78); g.stroke();
  const p0 = [-360, 300], p1 = [0, -80], p2 = [360, 300];
  g.strokeStyle = C.dim; g.lineWidth = 3; g.setLineDash([10, 12]); strokeQuad(g, p0, p1, p2); g.setLineDash([]);
  const u = clamp(lt / (s.dur - .8));
  const q = quad(p0, p1, p2, u);
  g.strokeStyle = C.warm; g.globalAlpha = .9; g.lineWidth = 4; g.beginPath();
  const steps = 28;
  for (let i = 0; i <= steps * u; i++) { const p = quad(p0, p1, p2, i / steps); i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); }
  g.stroke(); g.globalAlpha = 1;
  for (let i = 1; i <= 5; i++) {
    const p = quad(p0, p1, p2, Math.max(0, u - i * .035));
    ship(g, p.x, p.y, Math.atan2(q.dy, q.dx), .7, C.warm, 0);
    g.globalAlpha = 1;
  }
  flame(g, q.x, q.y, Math.atan2(q.dy, q.dx), 16 + 8 * Math.sin(lt * 30), C.warm, u > .02 && u < .96 ? .8 : 0);
  ship(g, q.x, q.y, Math.atan2(q.dy, q.dx), 1.15, C.ink, 16);
  const marks = [quad(p0, p1, p2, .5), quad(p0, p1, p2, .18)];
  text(label(s, 0), marks[0].x, marks[0].y - 42, { size: 28, weight: 700, alpha: show(s, 0, t) });
  text(label(s, 1), marks[1].x - 150, marks[1].y + 8, { size: 28, weight: 700, alpha: show(s, 1, t) });
  text(label(s, 2), 520, 40, { size: 28, weight: 700, color: C.warm, alpha: show(s, 2, t) });
  g.restore();
}

function figBoost(a, lt, s) {
  const { g, text, C, MONO } = a, t = s.t0 + lt, d = s.data;
  const hit = t - s.hitT, before = eo(seg(t, s.sp.t0, s.hitT));
  const x0 = -620, y = 30, wDone = 560, gap = 70, wZoom = 420;
  g.save();
  text('前面十三次', x0 + wDone / 2, y - 70, { size: 26, color: C.dim, alpha: ss(seg(lt, .3, .8)) });
  text('最后的 1%', x0 + wDone + gap + wZoom / 2, y - 70, { size: 26, color: C.acc, alpha: ss(seg(hit, -.2, .3)) });
  g.fillStyle = C.faint; g.fillRect(x0, y - 10, wDone, 20); g.fillRect(x0 + wDone + gap, y - 16, wZoom, 32);
  const f1 = wDone * before;
  g.fillStyle = C.ink; g.fillRect(x0, y - 10, f1, 20);
  const cross = hit >= 0 ? clamp(eo(seg(hit, 0, .7))) : 0;
  g.fillStyle = C.acc; g.shadowColor = C.acc; g.shadowBlur = 18;
  g.fillRect(x0 + wDone + gap, y - 16, wZoom * cross, 32); g.shadowBlur = 0;
  g.strokeStyle = C.dim; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x0 + wDone + 8, y - 28); g.lineTo(x0 + wDone + gap - 8, y - 36); g.moveTo(x0 + wDone + 8, y + 28); g.lineTo(x0 + wDone + gap - 8, y + 36); g.stroke();
  const sx = hit < 0 ? x0 + f1 : x0 + wDone + gap + wZoom * cross;
  const sy = y;
  if (hit >= 0) flame(g, sx, sy, Math.PI, 20 + 10 * Math.sin(lt * 40), C.warm, 1 - cross * .3);
  ship(g, sx, sy - 4, 0, 1.2, hit >= 0 ? C.acc : C.ink, hit >= 0 ? 18 : 0);
  const n = hit < 0 ? Math.round(19 * before) : 19;
  text(String(n), x0 + wDone + gap + wZoom / 2, y + 110, { size: 92, weight: 800, font: MONO, color: hit >= 0 ? C.acc : C.ink, glow: hit >= 0 ? 20 : 0 });
  text(d.unit || '', x0 + wDone + gap + wZoom / 2 + 90, y + 130, { size: 36, weight: 700, color: C.acc, alpha: ss(seg(hit, 0, .3)) });
  const second = at(s, 1);
  text('大约每秒快 90 米', 0, y + 210, { size: 32, color: C.dim, alpha: ss(seg(t, second, second + .5)) });
  g.restore();
}

function figEngines(a, lt, s) {
  const { g, text, C } = a, t = s.t0 + lt;
  const inner = [0, 1, 2].map(i => { const ang = -Math.PI / 2 + i * TAU / 3; return [Math.cos(ang) * 86, Math.sin(ang) * 86 - 10]; });
  const outer = [0, 1, 2].map(i => { const ang = -Math.PI / 2 + i * TAU / 3; return [Math.cos(ang) * 230, Math.sin(ang) * 230 - 10]; });
  const all = [...inner, ...outer];
  const fail = 4;
  const dead = show(s, 0, t), doubt = show(s, 1, t), go = show(s, 2, t);
  g.save();
  g.strokeStyle = C.line; g.lineWidth = 2; g.beginPath(); g.arc(0, -10, 300, 0, TAU); g.stroke();
  all.forEach(([x, y], i) => {
    const off = i === fail;
    const lit = off ? 1 - dead : 1;
    const surge = off ? 0 : .35 * go;
    g.save(); g.translate(x, y);
    g.strokeStyle = off && dead > .5 ? C.warm : C.ink; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 34, 0, TAU); g.stroke();
    g.fillStyle = off && dead > .5 ? '#2a2118' : C.faint; g.beginPath(); g.arc(0, 0, 26, 0, TAU); g.fill();
    if (lit > .15) {
      const len = (46 + 14 * Math.sin(lt * 28 + i)) * (1 + surge);
      g.fillStyle = C.acc; g.globalAlpha = lit * (.55 + .25 * Math.sin(lt * 22 + i));
      g.beginPath(); g.moveTo(-8, 8); g.lineTo(0, 8 + len); g.lineTo(8, 8); g.closePath(); g.fill();
    }
    if (off && dead > .4) { g.globalAlpha = dead; g.strokeStyle = C.warm; g.lineWidth = 4; g.beginPath(); g.moveTo(-12, -12); g.lineTo(12, 12); g.moveTo(12, -12); g.lineTo(-12, 12); g.stroke(); }
    g.restore();
  });
  text(label(s, 0), 0, 250, { size: 30, weight: 700, color: C.warm, alpha: dead * (1 - go) });
  text(label(s, 1), 0, 250, { size: 30, weight: 700, color: C.dim, alpha: doubt * (1 - go) });
  text(label(s, 2), 0, 250, { size: 32, weight: 700, color: C.acc, alpha: go });
  g.restore();
}

function figDeploy(a, lt, s) {
  const { g, text, C, MONO } = a, t = s.t0 + lt;
  const L0 = s.vt?.[0], born = i => (L0 ? L0.t0 + .25 : s.sp.t0) + ((L0?.voice ?? 3) - .3) * i / 26;
  const july = ss(seg(t, at(s, 2), at(s, 2) + .6));
  const compare = ss(seg(t, at(s, 1), at(s, 1) + .5));
  g.save();
  g.translate(-560, 20);
  g.fillStyle = '#c5d4e8'; g.beginPath();
  g.moveTo(0, -34); g.lineTo(150, -34); g.lineTo(190, -14); g.lineTo(190, 14); g.lineTo(150, 34); g.lineTo(0, 34);
  g.lineTo(-16, 18); g.lineTo(-16, -18); g.closePath(); g.fill();
  g.fillStyle = C.acc; g.fillRect(168, -8, 16, 16);
  let released = 0;
  for (let i = 0; i < 26; i++) if (t >= born(i)) released = i + 1;
  for (let i = 0; i < released; i++) {
    const k = eo(seg(t, born(i), born(i) + .45));
    const dx = 250 + i * 30, dy = -90 * Math.sin((i + .5) / 26 * Math.PI);
    const fall = july * (i % 5 === 0 ? 1 : 0);
    const y = lerp(0, dy, k) + fall * 220;
    sat(g, lerp(180, dx, k), y, 26, 10, fall ? C.warm : C.ink, k * (1 - fall * .85));
  }
  g.restore();
  text(String(released).padStart(2, '0'), -500, 230, { size: 64, weight: 800, font: MONO, color: C.acc, alpha: ss(seg(lt, .4, 1)) });
  text('/ 26', -410, 244, { size: 28, font: MONO, color: C.dim, alpha: ss(seg(lt, .4, 1)) });
  text(label(s, 1), 80, 230, { size: 28, weight: 700, color: C.ink, alpha: compare * (1 - july) });
  text('七月那次，掉回去了', 420, 230, { size: 28, weight: 700, color: C.warm, alpha: july });
}

function figRefuel(a, lt, s) {
  const { g, text, C } = a, t = s.t0 + lt;
  const ex = -40, ey = 30, R = 150, orb = 250;
  const meet = eo(seg(t, at(s, 1) - .2, at(s, 1) + 1.4));
  const done = ss(seg(t, at(s, 1) + .8, at(s, 1) + 1.6));
  earthDisk(g, ex, ey, R, C);
  g.save(); g.strokeStyle = C.line; g.lineWidth = 3; g.setLineDash([8, 10]); g.beginPath(); g.arc(ex, ey, orb, 0, TAU); g.stroke(); g.setLineDash([]); g.restore();
  const a1 = lerp(-2.2, -1.15, ss(seg(lt, .2, s.dur * .45)));
  const a2 = lerp(-3.4, -1.42, meet);
  const shipAt = ang => [ex + Math.cos(ang) * orb, ey + Math.sin(ang) * orb, Math.atan2(Math.cos(ang), -Math.sin(ang))];
  const A = shipAt(a1), B = shipAt(a2);
  ship(g, A[0], A[1], A[2], 1, C.ink, 10);
  ship(g, B[0], B[1], B[2], .85, C.acc, 12 * meet);
  if (meet > .65) {
    const k = (meet - .65) / .35;
    for (let i = 0; i < 4; i++) {
      const u = (k + i * .2 + lt * .4) % 1;
      g.fillStyle = C.acc; g.globalAlpha = Math.sin(u * Math.PI) * .9;
      g.beginPath(); g.arc(lerp(B[0], A[0], u), lerp(B[1], A[1], u), 4, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
  }
  const mx = 560, my = -150;
  g.save(); g.globalAlpha = .35 + .65 * done; earthDisk(g, mx, my, 28, C); g.restore();
  g.save(); g.strokeStyle = C.acc; g.globalAlpha = .3 + .6 * done; g.setLineDash([6, 8]); g.lineWidth = 2;
  g.beginPath(); g.moveTo(ex + 180, ey - 120); g.lineTo(mx - 40, my + 10); g.stroke(); g.restore();
  text('登月船', A[0] + 54, A[1] + 28, { size: 24, color: C.dim, alpha: ss(seg(lt, .5, 1.1)) });
  text(label(s, 1), B[0] - 36, B[1] - 48, { size: 24, weight: 700, color: C.acc, alpha: meet });
  text('月球', mx, my + 52, { size: 24, color: done ? C.acc : C.dim, alpha: .4 + .6 * done });
  text(label(s, 2), 0, 280, { size: 30, weight: 700, color: C.acc, alpha: show(s, 2, t) });
}

function figEarly(a, lt, s) {
  const { g, text, C, MONO } = a, t = s.t0 + lt;
  const ex = 0, ey = 20, R = 120, orb = 230;
  earthDisk(g, ex, ey, R, C);
  const plan = ss(seg(t, at(s, 0), at(s, 0) + .5));
  g.save(); g.strokeStyle = C.dim; g.globalAlpha = plan; g.lineWidth = 2; g.setLineDash([7, 9]);
  g.beginPath(); g.arc(ex, ey, orb, 0, TAU); g.stroke(); g.setLineDash([]); g.restore();
  text('×6', orb - 10, ey - orb + 16, { size: 28, font: MONO, color: C.dim, alpha: plan });
  text(label(s, 0), -orb + 10, ey - orb - 24, { size: 26, color: C.dim, alpha: plan });
  const leave = eo(seg(t, at(s, 1), at(s, 1) + 2.2));
  const ang = lerp(-Math.PI * .15, Math.PI * 1.15, ss(seg(lt, .4, s.dur * .62)));
  const x = ex + Math.cos(ang) * orb, y = ey + Math.sin(ang) * orb;
  g.save(); g.strokeStyle = C.acc; g.lineWidth = 4; g.shadowColor = C.acc; g.shadowBlur = 12; g.beginPath();
  g.arc(ex, ey, orb, -Math.PI * .15, ang); g.stroke(); g.restore();
  const sx = lerp(x, 430, leave), sy = lerp(y, 200, leave);
  const head = Math.atan2(Math.cos(ang), -Math.sin(ang));
  const away = Math.atan2(200 - y, 430 - x);
  if (leave > .05) flame(g, sx, sy, leave > .2 ? away : head, 18, C.warm, leave);
  ship(g, sx, sy, leave > .2 ? away : head, 1.05, C.ink, 12);
  if (leave > .7) {
    g.save(); g.globalAlpha = (leave - .7) / .3; g.strokeStyle = C.acc; g.lineWidth = 3;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(470, 230, 18 + i * 16, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
    g.restore();
  }
  text(label(s, 1), 0, 250, { size: 28, weight: 700, color: C.warm, alpha: show(s, 1, t) * (1 - show(s, 2, t)) });
  text(label(s, 2), 430, 280, { size: 28, weight: 700, color: C.acc, alpha: show(s, 2, t) });
}

function figSplash(a, lt, s) {
  const { g, text, C } = a, t = s.t0 + lt;
  const p = eio(seg(lt, .35, s.dur * .62));
  const next = show(s, 0, t);
  g.save();
  g.translate(-340, 10); g.globalAlpha = .28 + .55 * next;
  g.fillStyle = C.dim; g.fillRect(-18, -160, 36, 300);
  g.strokeStyle = next ? C.acc : C.dim; g.lineWidth = 8;
  const arm = lerp(70, 28, next);
  g.beginPath(); g.moveTo(0, -40); g.lineTo(-arm, -70); g.moveTo(0, -40); g.lineTo(arm, -70); g.stroke();
  g.globalAlpha = .2 + .3 * (1 - next);
  ship(g, 0, -120, -Math.PI / 2, .8, C.dim, 0);
  text('发射塔', 0, 170, { size: 26, color: next ? C.acc : C.dim, alpha: 1 });
  g.restore();
  const y = lerp(-180, 36, Math.min(1, p / .55));
  const rot = p < .5 ? lerp(.9, 0, p / .5) : lerp(0, 1.25, (p - .5) / .5);
  const broke = ss(seg(p, .62, .85));
  g.save(); g.strokeStyle = '#16324f'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(40, 80); g.bezierCurveTo(200, 60, 460, 100, 680, 76); g.stroke(); g.restore();
  if (broke < .3) {
    flame(g, 220, y, -Math.PI / 2 + rot, 22, C.warm, p < .55 ? .8 : 0);
    ship(g, 220, y, -Math.PI / 2 + rot, 1.3, C.ink, 8);
  }
  if (broke > 0) {
    [[-30, -10, .2], [16, 6, -.4], [4, 24, 1.1]].forEach(([dx, dy, r], i) => {
      g.save(); g.globalAlpha = 1 - broke * .35; g.translate(220 + dx * broke * 4, y + 10 + dy * broke * 3); g.rotate(r + broke);
      g.fillStyle = i === 1 ? C.warm : C.ink; g.fillRect(-16, -8, 34, 14); g.restore();
    });
  }
  text(label(s, 0), -340, 230, { size: 26, weight: 700, color: C.acc, alpha: next });
  text('落水后解体', 240, 200, { size: 28, weight: 700, color: C.warm, alpha: broke });
  text(label(s, 2), 240, 260, { size: 26, color: C.dim, alpha: show(s, 2, t) });
}

const DRAW = { fall: figFall, boost: figBoost, engines: figEngines, deploy: figDeploy, refuel: figRefuel, early: figEarly, splash: figSplash };

export function drawFigure(api, name, lt, s) {
  const fn = DRAW[name];
  if (fn) fn(api, lt, s);
}
