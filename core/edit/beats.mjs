// 节拍：谁 / 在干什么 / 情绪 / 在故事里是起承转合。
// Bot 看过 edit/frames/ 之后写 edit/beats.json，并把 source 设为 "bot"（或 "human"）。
// 没有这份文件时，这里用时长和动静打分，按镜头顺序摊成起承转合——不看画面，只为了没有 Bot 时也能出片。
import path from 'path';
import { ROLES, locked, readJSON, round, writeJSON } from './lib.mjs';

export function shotScore(s) {
  const durPart = Math.min(s.dur || 0, 10) / 10;
  const motion = Math.max(0, +s.motion || 0);
  const motPart = motion === 0 ? 0.35 : Math.exp(-((Math.log(motion + 0.05) - Math.log(0.45)) ** 2) / 0.8);
  const sil = Math.max(0, Math.min(1, +s.silenceRatio || 0));
  const silPart = sil > 0.75 ? 0.05 : 1 - sil;
  return durPart * 0.5 + motPart * 0.35 + silPart * 0.15;
}

export function roleForIndex(i, n) {
  const q = n <= 1 ? 1 : (i + 0.5) / n;
  if (q < 0.18) return '起';
  if (q < 0.50) return '承';
  if (q < 0.78) return '转';
  return '合';
}

const WHAT = {
  起: ['颜色先铺开', '开场停在这一块画面上', '故事从比较安静的地方开始'],
  承: ['事情顺着往前走', '同一条线上又近了一步', '画面接上前面的节奏'],
  转: ['节奏被推快了', '方向换了一下', '安静被打断'],
  合: ['速度收回来', '停在最后这一块颜色上', '故事在这里收住'],
};

export function fallbackBeats(shots) {
  const motions = shots.map(s => +s.motion || 0).sort((a, b) => a - b);
  const med = motions[Math.floor(motions.length / 2)] || 0;
  return {
    version: 1,
    source: 'fallback',
    lock: false,
    logline: '按镜头长短和动静排成的一条起承转合，没有经过画面理解。',
    beats: shots.map((s, i) => {
      const role = roleForIndex(i, shots.length);
      const rel = med > 0 ? (+s.motion || 0) / med : 1;
      const emotion = rel < 0.75 ? '平静' : rel < 1.6 ? '起伏' : '紧张';
      const keep = s.dur >= 1.2 && (s.silenceRatio || 0) < 0.85;
      return {
        id: `b${s.id.replace(/^s/, '')}`, shot: s.id, who: '画面', what: WHAT[role][i % 3],
        emotion, role, keep, score: round(shotScore(s), 3),
        note: 'fallback：没看画面，只看时长、动静和静音',
      };
    }),
  };
}

export function validateBeats(doc, shots) {
  if (!doc || !Array.isArray(doc.beats)) throw new Error('beats.json 需要 beats 数组');
  const ids = new Set(shots.map(s => s.id));
  for (const b of doc.beats) {
    if (!b || typeof b.shot !== 'string' || !ids.has(b.shot)) throw new Error(`beats 引用了不存在的镜头 ${b?.shot}`);
    if (b.role && !ROLES.includes(b.role)) throw new Error(`role 只能是 起 / 承 / 转 / 合，收到「${b.role}」`);
    if (b.who != null && typeof b.who !== 'string') throw new Error('who 要是字符串');
    if (b.what != null && typeof b.what !== 'string') throw new Error('what 要是字符串');
    if (b.emotion != null && typeof b.emotion !== 'string') throw new Error('emotion 要是字符串');
  }
  return doc;
}

// replace=true：这一步被点名执行，fallback 重写。source 为 bot / human 或 lock 时不覆盖（除非 FORCE=1）。
export function buildBeats(film, shots, replace) {
  const p = path.join(film, 'edit/beats.json');
  const existing = readJSON(p);
  if (existing && locked(existing) && process.env.FORCE !== '1') {
    validateBeats(existing, shots);
    console.log(`沿用 ${existing.source} 的 beats.json（${existing.beats.length} 条）。要覆盖请设 FORCE=1`);
    return existing;
  }
  if (existing && !replace && process.env.FORCE !== '1') {
    validateBeats(existing, shots);
    console.log(`沿用现有 beats.json（source: ${existing.source || '未标'}）`);
    return existing;
  }
  const doc = fallbackBeats(shots);
  validateBeats(doc, shots);
  writeJSON(p, doc);
  console.log(`edit/beats.json  ${doc.beats.length} 条，source: fallback。看过画面后把 source 改成 "bot"，否则下次构建会覆盖。`);
  return doc;
}
