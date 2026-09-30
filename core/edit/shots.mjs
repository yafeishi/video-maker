// 镜头检测（零模型）：ffmpeg scene 分数找切点，silencedetect 记录静音，必要时在长静音处再切开
// 输出 edit/shots.json。看不懂画面，只知道「这里换了」和「这里没声音」。
import fs from 'fs';
import path from 'path';
import { ffmpeg, inside, readJSON, round, writeJSON } from './lib.mjs';

export function parseSceneMetadata(text) {
  const samples = [];
  let t = null;
  for (const line of String(text).split(/\r?\n/)) {
    const tm = /pts_time:\s*([0-9.]+)/.exec(line);
    if (tm) { t = +tm[1]; continue; }
    const sm = /lavfi\.scene_score=([0-9.]+)/.exec(line);
    if (sm && t != null) { samples.push({ t, score: +sm[1] }); t = null; }
  }
  return samples;
}

export function parseSilence(text, dur) {
  const spans = [];
  let start = null;
  for (const line of String(text).split(/\r?\n/)) {
    const a = /silence_start:\s*([0-9.]+)/.exec(line);
    if (a) { start = +a[1]; continue; }
    const b = /silence_end:\s*([0-9.]+)/.exec(line);
    if (b && start != null) { spans.push({ t0: start, t1: +b[1] }); start = null; }
  }
  if (start != null && dur > start) spans.push({ t0: start, t1: dur });
  return spans.filter(s => s.t1 > s.t0);
}

// 局部峰值，并且比阈值高。开头 0.25s 内的分数通常是解码起势，不当切点。
export function cutsFromSamples(samples, threshold) {
  const cuts = [];
  for (let i = 1; i < samples.length - 1; i++) {
    const s = samples[i];
    if (s.t < 0.25 || s.score < threshold) continue;
    if (s.score >= samples[i - 1].score && s.score > samples[i + 1].score) cuts.push(s.t);
  }
  const merged = [];
  for (const t of cuts) if (!merged.length || t - merged[merged.length - 1] > 0.4) merged.push(t);
  return merged;
}

// 阈值一个切点都没有时：只有「明显高出周围」的峰才降阈值，避免把噪点当切点
export function adaptiveCuts(samples) {
  if (samples.length < 3) return [];
  const scores = samples.map(s => s.score).sort((a, b) => a - b);
  const p90 = scores[Math.min(scores.length - 1, Math.floor(scores.length * 0.9))];
  const max = scores[scores.length - 1];
  if (max < 0.05 || max < p90 * 4 + 0.015) return [];
  return cutsFromSamples(samples, Math.max(0.05, p90 * 3));
}

export function boundaries(dur, cuts, silences, silenceSplit) {
  const marks = [0, ...cuts.filter(t => t > 0.2 && t < dur - 0.2), dur].sort((a, b) => a - b);
  const b = [];
  for (const t of marks) if (!b.length || t - b[b.length - 1] > 0.34) b.push(t);
  for (const s of silences) {
    if (s.t1 - s.t0 < silenceSplit) continue;
    const mid = (s.t0 + s.t1) / 2;
    for (let i = 0; i < b.length - 1; i++) {
      if (mid > b[i] + 0.9 && mid < b[i + 1] - 0.9) { b.splice(i + 1, 0, mid); break; }
    }
  }
  return b;
}

export function averageKey(text, key) {
  const re = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([0-9.eE+-]+)', 'g');
  let m, sum = 0, n = 0;
  while ((m = re.exec(String(text)))) { sum += +m[1]; n++; }
  return n ? sum / n : 0;
}

async function sceneSamples(abs, work) {
  const out = path.join(work, 'scene.txt');
  fs.rmSync(out, { force: true });
  await ffmpeg(['-loglevel', 'error', '-i', abs, '-vf', `select='gte(scene\\,0)',metadata=print:file=${out}`, '-an', '-f', 'null', '-']);
  return parseSceneMetadata(fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '');
}

async function silenceOf(abs, cfg, dur) {
  const { err, out } = await ffmpeg(['-nostats', '-i', abs, '-af', `silencedetect=n=${cfg.silenceNoise}:d=0.3`, '-vn', '-f', 'null', '-']);
  return parseSilence(err + '\n' + out, dur);
}

async function motionAt(abs, mid, work) {
  const out = path.join(work, 'motion.txt');
  fs.rmSync(out, { force: true });
  const ss = Math.max(0, mid - 0.2);
  await ffmpeg(['-loglevel', 'error', '-ss', ss.toFixed(3), '-t', '0.45', '-i', abs, '-vf', `tblend=all_mode=difference,signalstats,metadata=print:file=${out}`, '-an', '-f', 'null', '-']);
  return averageKey(fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '', 'lavfi.signalstats.YDIF');
}

export async function detectShots(film, cfg) {
  const ingest = readJSON(path.join(film, 'edit/ingest.json'));
  if (!ingest?.files?.length) throw new Error('还没有 edit/ingest.json，先跑 ingest');
  const work = path.join(film, 'edit/work');
  fs.mkdirSync(work, { recursive: true });
  const shots = [];
  for (const file of ingest.files) {
    const abs = inside(film, file.file);
    const samples = await sceneSamples(abs, work);
    let cuts = cutsFromSamples(samples, cfg.sceneThreshold);
    let how = `阈值 ${cfg.sceneThreshold}`;
    if (!cuts.length) {
      cuts = adaptiveCuts(samples);
      if (cuts.length) how = '自适应阈值';
    }
    const silences = file.hasAudio ? await silenceOf(abs, cfg, file.dur) : [];
    const bounds = boundaries(file.dur, cuts, silences, cfg.silenceSplit);
    const before = shots.length;
    for (let i = 0; i < bounds.length - 1; i++) {
      const srcIn = bounds[i], srcOut = bounds[i + 1];
      if (srcOut - srcIn < 0.45) continue;
      const motion = await motionAt(abs, (srcIn + srcOut) / 2, work);
      const sil = silences.filter(s => s.t1 > srcIn + 0.02 && s.t0 < srcOut - 0.02).map(s => ({
        t0: round(Math.max(0, s.t0 - srcIn)), t1: round(Math.min(srcOut, s.t1) - srcIn),
      }));
      const silDur = sil.reduce((a, s) => a + Math.max(0, s.t1 - s.t0), 0);
      const open = samples.find(s => Math.abs(s.t - srcIn) < 0.08);
      shots.push({
        id: '', src: file.file, srcIn: round(srcIn), srcOut: round(srcOut), dur: round(srcOut - srcIn),
        sceneScore: round(open?.score || 0, 4), motion: round(motion, 4),
        silence: sil, silenceRatio: round(silDur / (srcOut - srcIn), 3),
      });
    }
    console.log(`${file.file}  ${how}，切点 ${cuts.length}，静音 ${silences.length} → 镜头 ${shots.length - before}`);
  }
  if (shots.length > 400) throw new Error(`切出 ${shots.length} 个镜头，超过 400。把 sceneThreshold 调高，或先把素材剪短。`);
  shots.forEach((s, i) => { s.id = `s${String(i + 1).padStart(2, '0')}`; });
  const doc = {
    version: 1, generated: new Date().toISOString(), method: 'ffmpeg-scene+silence',
    threshold: cfg.sceneThreshold, silenceSplit: cfg.silenceSplit, shots,
  };
  writeJSON(path.join(film, 'edit/shots.json'), doc);
  console.log(`edit/shots.json  ${shots.length} 个镜头`);
  return doc;
}
