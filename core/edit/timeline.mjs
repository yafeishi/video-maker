// 时间线：从镜头里选 6–12 段，排成起承转合，目标成片 60–120 秒（film.json 可改）。
// 人可以改 in / out / role。source 为 bot 或 human 时，构建不会覆盖。
// t0 / t1 是规划时算的成片时间；组装时按真实片段时长重算，以 edit/assembly.json 为准。
import fs from 'fs';
import path from 'path';
import { ROLES, inside, locked, readJSON, round, writeJSON } from './lib.mjs';
import { roleForIndex, shotScore, validateBeats } from './beats.mjs';

export function fadeOf(prev, seg, cfg) {
  if (!prev) return 0;
  const prevDur = prev.vdur ?? (prev.out - prev.in);
  const segDur = seg.vdur ?? (seg.out - seg.in);
  const cut = cfg.transition?.cut ?? 0.12;
  const role = cfg.transition?.role ?? 0.45;
  const want = prev.role && seg.role && prev.role !== seg.role ? role : cut;
  const cap = Math.min(prevDur, segDur) / 3;
  return round(Math.max(0, Math.min(want, cap)));
}

export function chainClock(durations, fades) {
  let accD = 0, accF = 0;
  const rows = durations.map((dur, i) => {
    const fade = i === 0 ? 0 : (fades[i] || 0);
    accF += fade;
    const t0 = round(accD - accF);
    accD += dur;
    return { t0, t1: round(t0 + dur), fade };
  });
  return { rows, dur: rows.length ? rows[rows.length - 1].t1 : 0 };
}

export function xfadeOffsets(durations, fades) {
  const offsets = [];
  let acc = 0, fadeSum = 0;
  for (let i = 1; i < durations.length; i++) {
    acc += durations[i - 1];
    fadeSum += fades[i] || 0;
    offsets.push(round(acc - fadeSum));
  }
  return offsets;
}

export function placeSegments(segments, cfg) {
  const fades = segments.map((seg, i) => fadeOf(i ? segments[i - 1] : null, seg, cfg));
  const durs = segments.map(s => round(s.out - s.in));
  const { rows, dur } = chainClock(durs, fades);
  return {
    dur,
    segments: segments.map((seg, i) => ({ ...seg, dur: durs[i], fade: rows[i].fade, t0: rows[i].t0, t1: rows[i].t1 })),
  };
}

function quotasFor(usable, n) {
  const W = { 起: 0.18, 承: 0.34, 转: 0.28, 合: 0.20 };
  const have = {};
  for (const r of ROLES) have[r] = usable.filter(s => s.role === r).length;
  const active = ROLES.filter(r => have[r] > 0);
  const q = Object.fromEntries(ROLES.map(r => [r, 0]));
  if (!active.length || n <= 0) return q;
  let left = n;
  if (n >= active.length) { for (const r of active) { q[r] = 1; left--; } }
  const wsum = active.reduce((a, r) => a + W[r], 0) || 1;
  const parts = active.map(r => ({ r, exact: left * W[r] / wsum }));
  for (const p of parts) {
    const add = Math.min(have[p.r] - q[p.r], Math.floor(p.exact));
    q[p.r] += Math.max(0, add);
  }
  let rem = n - ROLES.reduce((a, r) => a + q[r], 0);
  const order = [...parts].sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)));
  for (const p of order) {
    if (rem <= 0) break;
    if (q[p.r] < have[p.r]) { q[p.r]++; rem--; }
  }
  while (rem > 0) {
    const r = active.find(role => q[role] < have[role]);
    if (!r) break;
    q[r]++; rem--;
  }
  return q;
}

function outputOf(segs, cfg) {
  if (!segs.length) return 0;
  return placeSegments(segs.map(s => ({ ...s, in: s.in, out: s.out, role: s.role })), cfg).dur;
}

function shrinkTo(segs, cfg, max) {
  for (let g = 0; g < 100 && outputOf(segs, cfg) > max + 0.05; g++) {
    const seg = [...segs].sort((a, b) => (b.out - b.in) - (a.out - a.in))[0];
    if (seg.out - seg.in <= 2.5) break;
    const cut = Math.min(0.35, seg.out - seg.in - 2.5, outputOf(segs, cfg) - max);
    seg.in += cut / 2;
    seg.out -= cut / 2;
  }
}

function growTo(segs, cfg, min) {
  for (let g = 0; g < 100 && outputOf(segs, cfg) < min - 0.05; g++) {
    const room = s => Math.max(0, s.in - s.srcIn) + Math.max(0, s.srcOut - s.out);
    const seg = [...segs].sort((a, b) => room(b) - room(a))[0];
    if (room(seg) < 0.02) break;
    const add = Math.min(0.4, min - outputOf(segs, cfg), room(seg));
    const roomL = Math.max(0, seg.in - seg.srcIn), roomR = Math.max(0, seg.srcOut - seg.out);
    const l = Math.min(roomL, add / 2);
    const r = Math.min(roomR, add - l);
    seg.in -= l;
    seg.out += r;
  }
}

export function planTimeline(shots, beatsDoc, cfg) {
  const warnings = [];
  const beatByShot = new Map((beatsDoc?.beats || []).map(b => [b.shot, b]));
  const usable = shots.map((s, order) => {
    const b = beatByShot.get(s.id);
    const keep = b ? b.keep !== false : s.dur >= 1.2;
    const role = b?.role && ROLES.includes(b.role) ? b.role : roleForIndex(order, shots.length);
    const score = Number.isFinite(+b?.score) ? +b.score : shotScore(s);
    return { ...s, order, keep, role, score };
  }).filter(s => s.keep && s.dur >= 1.2);
  if (!usable.length) throw new Error('没有可用镜头：都短于 1.2 秒，或在 beats.json 里 keep 为 false');

  const avail = usable.reduce((a, s) => a + s.dur, 0);
  const [segMin, segMax] = cfg.target.segments;
  const desired = Math.max(Math.min(avail, cfg.target.max), Math.min(cfg.target.min, avail));
  if (avail + 0.05 < cfg.target.min) warnings.push(`可用素材 ${round(avail, 1)}s，不到目标 ${cfg.target.min}–${cfg.target.max}s，成片会更短`);

  let n = Math.round(Math.min(desired, avail) / 8);
  n = Math.max(Math.min(segMin, usable.length), Math.min(n, segMax, usable.length));
  n = Math.min(Math.max(n, Math.min(segMin, usable.length)), Math.min(segMax, usable.length));
  const quotas = quotasFor(usable, n);

  const chosen = [];
  for (const role of ROLES) {
    const pool = usable.filter(s => s.role === role).sort((a, b) => b.score - a.score || a.order - b.order);
    chosen.push(...pool.slice(0, quotas[role] || 0));
  }
  chosen.sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || a.order - b.order);
  if (!chosen.length) throw new Error('时间线没有选中任何镜头');

  const segs = chosen.map(s => {
    const take = Math.min(s.dur, 12);
    const slack = s.dur - take;
    return { shot: s.id, src: s.src, in: s.srcIn + slack / 2, out: s.srcIn + slack / 2 + take, role: s.role, srcIn: s.srcIn, srcOut: s.srcOut };
  });
  shrinkTo(segs, cfg, cfg.target.max);
  growTo(segs, cfg, Math.min(cfg.target.min, avail));

  segs.forEach((seg, i) => {
    seg.id = `c${String(i + 1).padStart(2, '0')}`;
    seg.in = round(Math.max(seg.srcIn, seg.in));
    seg.out = round(Math.min(seg.srcOut, seg.out));
    if (seg.out <= seg.in) throw new Error(`片段 ${seg.id} 长度为 0`);
    delete seg.srcIn; delete seg.srcOut;
  });

  const placed = placeSegments(segs, cfg);
  if (placed.segments.length < segMin) warnings.push(`只有 ${placed.segments.length} 段，少于目标 ${segMin} 段`);
  if (placed.dur + 0.3 < cfg.target.min) warnings.push(`时间线 ${placed.dur.toFixed(1)}s，短于目标 ${cfg.target.min}s`);
  if (placed.dur > cfg.target.max + 0.3) warnings.push(`时间线 ${placed.dur.toFixed(1)}s，长于目标 ${cfg.target.max}s`);
  for (const r of ROLES) {
    if (placed.segments.some(s => s.role === r)) continue;
    warnings.push(usable.some(s => s.role === r) ? `时间线里没有「${r}」（素材里有，但没排进去）` : `时间线里没有「${r}」`);
  }

  return {
    version: 1,
    source: 'planner',
    lock: false,
    width: cfg.width, height: cfg.height, fps: cfg.fps,
    target: cfg.target,
    transition: cfg.transition,
    arc: [...ROLES],
    dur: placed.dur,
    segments: placed.segments.map(s => ({
      id: s.id, shot: s.shot, src: s.src, in: s.in, out: s.out, role: s.role,
      t0: s.t0, t1: s.t1, vo: `l${s.id.slice(1)}`,
    })),
    warnings,
    generated: new Date().toISOString(),
  };
}

export function validateTimeline(doc, film) {
  if (!doc || !Array.isArray(doc.segments) || !doc.segments.length) throw new Error('timeline.json 需要至少一段 segments');
  if (doc.segments.length > 40) throw new Error(`timeline 有 ${doc.segments.length} 段，超过 40 段`);
  for (const seg of doc.segments) {
    if (!seg || typeof seg.src !== 'string') throw new Error('片段缺少 src');
    if (!/\.(mp4|mov|m4v)$/i.test(seg.src)) throw new Error('片段素材必须是 mp4 / mov / m4v：' + seg.src);
    if (!Number.isFinite(+seg.in) || !Number.isFinite(+seg.out) || !(+seg.out > +seg.in)) throw new Error(`片段 ${seg.id || seg.src} 的 out 必须大于 in`);
    if (+seg.in < 0) throw new Error(`片段 ${seg.id || seg.src} 的 in 不能为负`);
    const abs = inside(film, seg.src);
    if (!fs.existsSync(abs)) throw new Error('找不到素材 ' + seg.src);
    if (seg.role && !ROLES.includes(seg.role)) throw new Error(`片段 ${seg.id || ''} 的 role 只能是 起/承/转/合`);
  }
  return doc;
}

export function buildTimeline(film, shots, beatsDoc, cfg, replace) {
  const p = path.join(film, 'edit/timeline.json');
  const existing = readJSON(p);
  if (existing && locked(existing) && process.env.FORCE !== '1') {
    validateTimeline(existing, film);
    console.log(`沿用 ${existing.source} 的 timeline.json（${existing.segments.length} 段）。要覆盖请设 FORCE=1`);
    return existing;
  }
  if (existing && !replace && process.env.FORCE !== '1') {
    validateTimeline(existing, film);
    console.log(`沿用现有 timeline.json（source: ${existing.source || '未标'}）`);
    return existing;
  }
  if (beatsDoc) validateBeats(beatsDoc, shots);
  const doc = planTimeline(shots, beatsDoc, cfg);
  validateTimeline(doc, film);
  writeJSON(p, doc);
  console.log(`edit/timeline.json  ${doc.segments.length} 段，约 ${doc.dur.toFixed(1)}s，source: planner`);
  for (const w of doc.warnings) console.log('  注意：' + w);
  console.log('改 in/out/role 后把 source 改成 "human" 或 "bot"，否则下次构建会覆盖。');
  return doc;
}
