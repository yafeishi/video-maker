// 清点 raw/：ffprobe 每条素材的时长、分辨率、是否有声音 → edit/ingest.json
import fs from 'fs';
import path from 'path';
import { ffprobe, round, writeJSON } from './lib.mjs';

const VIDEO = /\.(mp4|mov|m4v)$/i;

function ratio(s) {
  if (!s || s === '0/0') return 0;
  const [a, b] = String(s).split('/').map(Number);
  return b ? a / b : 0;
}

export function listRaw(film) {
  const raw = path.join(film, 'raw');
  if (!fs.existsSync(raw)) return [];
  return fs.readdirSync(raw).filter(f => VIDEO.test(f)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

export async function ingest(film) {
  const names = listRaw(film);
  if (!names.length) throw new Error('raw/ 里没有 mp4 / mov / m4v。实拍放到 films/<片名>/raw/；示例片可先跑 node make-raw.mjs 生成色块。');
  if (names.length > 80) throw new Error(`raw/ 里有 ${names.length} 条视频，超过 80 条。先挑过再放进来。`);
  const files = [];
  for (const name of names) {
    const abs = path.join(film, 'raw', name);
    const j = await ffprobe(abs);
    const v = (j.streams || []).find(s => s.codec_type === 'video');
    const a = (j.streams || []).find(s => s.codec_type === 'audio');
    if (!v) { console.log('跳过（没有画面）', name); continue; }
    const dur = +j.format?.duration || +v.duration || 0;
    if (!(dur > 0.2)) { console.log('跳过（太短或没有时长）', name); continue; }
    files.push({
      file: `raw/${name}`, dur: round(dur), width: v.width || 0, height: v.height || 0,
      fps: round(ratio(v.avg_frame_rate) || ratio(v.r_frame_rate), 3),
      video: v.codec_name || '', audio: a ? (a.codec_name || '') : null, hasAudio: !!a,
    });
    console.log(`${`raw/${name}`.padEnd(28)} ${String(v.width).padStart(4)}×${String(v.height).padEnd(4)} ${dur.toFixed(1)}s  ${a ? '有声' : '无声'}`);
  }
  if (!files.length) throw new Error('raw/ 里的文件都没有可用的画面');
  const doc = { version: 1, generated: new Date().toISOString(), files };
  writeJSON(path.join(film, 'edit/ingest.json'), doc);
  console.log(`edit/ingest.json  ${files.length} 条，共 ${round(files.reduce((s, f) => s + f.dur, 0), 1)}s`);
  return doc;
}
