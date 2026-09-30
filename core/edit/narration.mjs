// 旁白。Bot 可以直接写 lines.json（source: "bot"）。没有时按时间线的角色生成中文口播，再用现有 edge-tts。
import fs from 'fs';
import path from 'path';
import { ROOT, locked, pythonBin, readJSON, run, writeJSON } from './lib.mjs';

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const HEAD = { 起: '一开始', 承: '接着', 转: '转到这里', 合: '最后' };

export function fallbackLines(timeline, beatsDoc) {
  const byShot = new Map((beatsDoc?.beats || []).map(b => [b.shot, b]));
  const used = new Set();
  const lines = (timeline?.segments || []).map((seg, i) => {
    const b = byShot.get(seg.shot) || {};
    const what = b.what || '画面在往前走';
    const emotion = b.emotion ? `，情绪偏${b.emotion}` : '';
    const head = HEAD[seg.role] || '然后';
    const text = b.who && b.who !== '画面' ? `${head}，${b.who}。${what}${emotion}。` : `${head}，${what}${emotion}。`;
    let id = seg.vo && ID_RE.test(seg.vo) ? seg.vo : `l${String(i + 1).padStart(2, '0')}`;
    if (used.has(id)) id = `l${String(i + 1).padStart(2, '0')}`;
    used.add(id);
    return { id, text, segment: seg.id };
  });
  return { version: 1, source: 'fallback', lock: false, voice: 'zh-CN-YunxiNeural', rate: '-6%', pitch: '+0Hz', lines };
}

export function validateLines(doc) {
  if (!doc || !Array.isArray(doc.lines) || !doc.lines.length) throw new Error('lines.json 需要至少一句 lines');
  const ids = new Set();
  for (const ln of doc.lines) {
    if (!ln || !ID_RE.test(ln.id || '')) throw new Error('台词 id 只能用字母、数字、下划线和连字符：' + (ln && ln.id));
    if (ids.has(ln.id)) throw new Error('台词 id 重复：' + ln.id);
    ids.add(ln.id);
    if (typeof ln.text !== 'string' || !ln.text.trim()) throw new Error('台词没有 text：' + ln.id);
  }
  return doc;
}

export function buildLines(film, timeline, beatsDoc, replace) {
  if (!timeline?.segments?.length) throw new Error('还没有时间线，先跑 timeline');
  const p = path.join(film, 'lines.json');
  const existing = readJSON(p);
  if (existing && locked(existing) && process.env.FORCE !== '1') {
    validateLines(existing);
    console.log(`沿用 ${existing.source} 的 lines.json（${existing.lines.length} 句）。要覆盖请设 FORCE=1`);
    return existing;
  }
  if (existing && !replace && process.env.FORCE !== '1') {
    validateLines(existing);
    console.log(`沿用现有 lines.json（source: ${existing.source || '未标'}）`);
    return existing;
  }
  const doc = fallbackLines(timeline, beatsDoc);
  validateLines(doc);
  writeJSON(p, doc);
  console.log(`lines.json  ${doc.lines.length} 句，source: fallback。Bot 写好口播后把 source 改成 "bot"，否则下次会覆盖。`);
  return doc;
}

export async function synthesize(film) {
  const p = path.join(film, 'lines.json');
  const doc = readJSON(p);
  validateLines(doc);
  const voices = path.join(film, 'voices');
  fs.mkdirSync(voices, { recursive: true });
  await run(pythonBin(), [path.join(ROOT, 'core/tts/tts_zh.py'), p, voices]);
  console.log('voices/  配音完成（edge-tts，文本没变的句子会沿用缓存）');
}
