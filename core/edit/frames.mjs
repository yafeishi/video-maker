// 每个镜头抽 1–3 张中间帧到 edit/frames/，给 Bot 看画面。不调用模型。
import fs from 'fs';
import path from 'path';
import { ffmpeg, inside, readJSON, round, writeJSON } from './lib.mjs';

export function frameTimes(shot) {
  const d = shot.srcOut - shot.srcIn;
  const rel = d < 2.5 ? [0.5] : d < 6 ? [0.35, 0.7] : [0.25, 0.5, 0.75];
  return rel.map(r => round(shot.srcIn + d * r));
}

export async function extractFrames(film) {
  const doc = readJSON(path.join(film, 'edit/shots.json'));
  if (!doc?.shots?.length) throw new Error('还没有 edit/shots.json，先跑 shots');
  const dir = path.join(film, 'edit/frames');
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (/^s\d+-\d+\.jpg$/.test(f)) fs.unlinkSync(path.join(dir, f));
  const frames = [];
  for (const shot of doc.shots) {
    const abs = inside(film, shot.src);
    const times = frameTimes(shot);
    times.forEach((t, i) => {
      const file = `edit/frames/${shot.id}-${i + 1}.jpg`;
      frames.push({ shot: shot.id, t, file, abs, out: path.join(film, file) });
    });
  }
  // 逐张抽。素材片的帧数就是镜头数的两三倍，不值得并行把磁盘打满。
  for (const f of frames) {
    await ffmpeg(['-loglevel', 'error', '-y', '-ss', f.t.toFixed(3), '-i', f.abs, '-frames:v', '1', '-q:v', '3', f.out]);
  }
  const meta = { version: 1, generated: new Date().toISOString(), frames: frames.map(({ shot, t, file }) => ({ shot, t, file })) };
  writeJSON(path.join(film, 'edit/frames.json'), meta);
  console.log(`edit/frames/  ${meta.frames.length} 张（每镜 1–3 张，给 Bot 看，不是成片）`);
  return meta;
}
