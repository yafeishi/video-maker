// 检查 lines.json：node tools/check-lines.mjs films/<片名>
// 用 core/deck.js 的片（qa、review 模板）会逐个检查镜头字段；其他模板只检查台词和结尾互动。
// ✗ 是错误（必须改，退出码 1），! 是提醒（建议改）。每条都写了在哪、怎么改。
import fs from 'fs';
import path from 'path';
import { KINDS, CAPTION_MAX, BEAT } from '../core/deck-kinds.js';

const dir = process.argv[2];
if (!dir) { console.error('用法：node tools/check-lines.mjs films/<片名>'); process.exit(2); }
const file = path.join(dir, 'lines.json');
const errs = [], warns = [];
const E = (where, msg) => errs.push(`✗ ${where}：${msg}`);
const Wn = (where, msg) => warns.push(`! ${where}：${msg}`);
const len = s => [...String(s ?? '')].length;
// 显示宽度：汉字和全角标点算 1，数字、字母、空格算半个
const wid = s => [...String(s ?? '')].reduce((a, ch) => a + (/[\x20-\x7e]/.test(ch) ? .55 : 1), 0);

if (!fs.existsSync(file)) { console.log(`✗ 找不到 ${file}`); process.exit(1); }
const raw = fs.readFileSync(file, 'utf8');
let doc;
try { doc = JSON.parse(raw); } catch (e) {
  const m = String(e.message).match(/position (\d+)/);
  let where = '';
  if (m) { const before = raw.slice(0, +m[1]); where = `第 ${before.split('\n').length} 行附近`; }
  console.log(`✗ lines.json 不是合法的 JSON（${where || e.message}）。常见原因：少了逗号、多了结尾逗号、用了中文引号 “ ” 代替英文引号 "。`);
  process.exit(1);
}
const deck = /core\/deck\.js/.test(fs.existsSync(path.join(dir, 'film.js')) ? fs.readFileSync(path.join(dir, 'film.js'), 'utf8') : '');
const lines = Array.isArray(doc) ? doc : doc.lines;
if (!Array.isArray(lines) || !lines.length) { console.log('✗ lines.json 里要有 "lines": [ ... ] 台词列表'); process.exit(1); }

// ——— 台词 ———
const ids = new Set();
lines.forEach((L, i) => {
  const at = `第 ${i + 1} 句${L.id ? `（${L.id}）` : ''}`;
  if (!L.id) E(at, '缺少 "id"（每句一个不重复的英文编号，例如 "p1"）');
  else if (ids.has(L.id)) E(at, `"id" 重复了：${L.id}`);
  else if (!/^[a-z][a-z0-9_]*$/i.test(L.id)) E(at, `"id" 只用英文字母、数字和下划线：${L.id}`);
  ids.add(L.id);
  if (!L.text || !String(L.text).trim()) { E(at, '缺少 "text"（这句要说的话，也是字幕）'); return; }
  const n = Math.round(wid(L.text));
  if (n > CAPTION_MAX) Wn(at, `台词约 ${n} 个字宽，字幕一行放不下（建议 ≤ ${CAPTION_MAX}）。拆成两句：第二句只写 "id" 和 "text"，不写 "shot"`);
  if (/[a-zA-Z]{4,}/.test(L.text) && !L.say) Wn(at, '台词里有英文单词，中文配音可能读得怪。可以加 "say" 字段写成读音（只影响配音，不影响字幕）');
  if (/\d+(\.\d+)?%/.test(L.text) && !L.say) Wn(at, '台词里有百分号，建议写成「百分之…」，或加 "say" 字段');
  if (/[“”]/.test(L.text)) Wn(at, '台词里的中文引号会原样显示在字幕里；不需要的话删掉');
});

// ——— 镜头 ———
function checkStr(at, key, v, max, required) {
  if (v == null || v === '') { if (required) E(at, `缺少 "${key}"`); return; }
  if (typeof v !== 'string') { E(at, `"${key}" 要写成文字（加英文双引号）`); return; }
  const n = Math.round(Math.max(...v.split('\n').map(wid)));
  if (max && n > max) Wn(at, `"${key}" ${n} 个字，建议 ≤ ${max}（字会自动缩小，但画面上读着吃力）`);
}
const isNum = v => (typeof v === 'number' && isFinite(v)) || (typeof v === 'string' && /^-?[\d,]+(\.\d+)?$/.test(v.trim()));
let shots = [], cur = null;
if (deck) {
  lines.forEach((L, i) => {
    if (/^cta\d/.test(L.id || '')) return;
    if (L.shot) { cur = { kind: L.shot, data: L, lines: [L], i }; shots.push(cur); }
    else if (!cur) { Wn(`第 ${i + 1} 句（${L.id}）`, '第一句没有写 "shot"，会被当成要点镜头（point）。通常第一句写 "shot": "title" 或 "question"'); cur = { kind: 'point', data: L, lines: [L], i }; shots.push(cur); }
    else cur.lines.push(L);
  });
  const known = Object.keys(KINDS).join(' / ');
  for (const s of shots) {
    const at = `镜头「${s.data.id}」`;
    const K = KINDS[s.kind];
    if (!K) { E(at, `没有 "${s.kind}" 这种镜头。可用：${known}`); continue; }
    const d = s.data, text = s.lines.map(L => L.text || '').join('');
    for (const [key, type] of Object.entries(K.fields)) {
      const req = type.endsWith('!'), t = type.replace('!', ''), v = d[key];
      if (t === 'str') checkStr(at, key, v, K.max?.[key], req);
      if (t === 'num') { if (v == null) { if (req) E(at, `缺少 "${key}"（一个数字，例如 "40" 或 "5.9"）`); } else if (!isNum(v)) E(at, `"${key}" 要是数字，写成 "40" 或 "5.9"，单位放到 "unit" 里：${v}`); }
      if (['strs', 'events', 'bars'].includes(t)) {
        if (v == null) { if (req) E(at, `缺少 "${key}" 列表`); continue; }
        if (!Array.isArray(v)) { E(at, `"${key}" 要写成列表 [ ... ]`); continue; }
        const [lo, hi] = K.items || [0, 99];
        if (v.length < lo || v.length > hi) E(at, `"${key}" 有 ${v.length} 条，这种镜头要 ${lo}–${hi} 条${v.length > hi ? '，多的拆到下一个镜头' : ''}`);
        v.forEach((it, k) => {
          const w = `${at} 第 ${k + 1} 条`;
          if (t === 'strs') checkStr(w, '条目', typeof it === 'object' ? it.text : it, K.max?.items, true);
          if (t === 'events') {
            if (typeof it !== 'object') return E(w, '要写成 { "year": "1969", "label": "登上月球" }');
            checkStr(w, 'year', it.year == null ? it.year : String(it.year), K.max?.year, true);
            checkStr(w, 'label', it.label, K.max?.label, true);
          }
          if (t === 'bars') {
            if (typeof it !== 'object') return E(w, '要写成 { "label": "木星", "value": "11.2" }');
            checkStr(w, 'label', it.label, K.max?.label, true);
            if (!isNum(it.value)) E(w, `"value" 要是数字：${it.value}`);
            else if (+String(it.value).replace(/,/g, '') < 0) E(w, '柱状图不支持负数');
          }
          if (typeof it === 'object' && it.hit && !text.includes(it.hit)) E(w, `"hit" 是「${it.hit}」，但这个镜头的台词里没有这几个字。hit 要一字不差地出现在台词里`);
        });
        const hits = v.map(it => typeof it === 'object' && it.hit ? text.indexOf(it.hit) : -1).filter(x => x >= 0);
        if (hits.some((x, k) => k && x < hits[k - 1])) E(at, '条目的 "hit" 在台词里的先后顺序和条目顺序不一致；要么调整台词顺序，要么删掉顺序不对的 hit');
      }
    }
    for (const key of Object.keys(d)) if (!['id', 'text', 'shot', 'say', 'asr', 'voice', 'rate', 'hit'].includes(key) && !(key in K.fields)) Wn(at, `"${key}" 这个字段 ${s.kind} 镜头用不到，会被忽略。可用字段：${Object.keys(K.fields).join('、')}`);
    if (d.hit && !text.includes(d.hit)) E(at, `"hit" 是「${d.hit}」，但这个镜头的台词里没有这几个字。hit 要一字不差地出现在台词里`);
    if (s.kind === 'bars' && d.highlight && Array.isArray(d.items) && !d.items.some(it => it.label === d.highlight)) E(at, `"highlight" 是「${d.highlight}」，但条目里没有这个 label`);
    if (s.kind === 'quote' && d.quote && !text.includes(d.quote.slice(0, 4))) Wn(at, '台词里没有念出引语原文，引语会按时间均匀亮起；最好在台词里完整念一遍');
  }
  const kinds = shots.map(s => s.kind);
  if (kinds.length && !['title', 'question'].includes(kinds[0])) Wn('结构', `第一个镜头是 ${kinds[0]}。前 3 秒要有钩子，通常用 title（片名）或 question（问题）开头`);
  if (kinds.includes('question') && !kinds.includes('answer')) Wn('结构', '有 question 没有 answer：提了问题要在 10 秒内给出一句话答案');
  if (kinds.length > 2 && !kinds.includes('recap')) Wn('结构', '没有 recap（收束）镜头：结尾用一句话呼应开头，片子才收得住');
}

// ——— 结尾互动 ———
if (doc.cta) {
  const c = doc.cta;
  for (const id of ['cta1', 'cta2']) if (!ids.has(id)) E('结尾互动', `有 "cta" 块但缺少 "${id}" 台词（cta1 提问，cta2 邀请留言）`);
  checkStr('结尾互动', 'question', c.question, 12, true);
  if (/你怎么看|点赞|关注|三连/.test((c.question || '') + lines.filter(L => /^cta/.test(L.id)).map(L => L.text).join(''))) Wn('结尾互动', '问题太空泛或在要互动数据。问一个观众凭自己经历就能答、只跟这部片有关的问题（docs/directing.md §3）');
  if (c.options && (!Array.isArray(c.options) || c.options.length > 6)) E('结尾互动', '"options" 最多 6 个');
  (c.options || []).forEach((o, k) => checkStr(`结尾互动 选项 ${k + 1}`, 'label', o?.label, 6, true));
} else if (ids.has('cta1')) E('结尾互动', '有 cta1 台词但没有 "cta" 块。运行 node tools/add-cta.mjs ' + dir + ' 补上');

// ——— 时长估算 ———
if (deck) {
  let total = 0, vd = {};
  try { vd = JSON.parse(fs.readFileSync(path.join(dir, 'voices', 'dur.json'), 'utf8')); } catch {}
  const voiceT = L => vd[L.id] ?? Math.max(1.2, wid(L.text) / 5.2);
  for (const s of shots) {
    const K = KINDS[s.kind]; if (!K) continue;
    const speak = s.lines.reduce((a, L) => a + voiceT(L) + .45, K.first) - .45 + (K.tail ?? .7);
    total += Math.ceil(Math.max(K.beats * BEAT, speak) / (2 * BEAT)) * 2 * BEAT;
  }
  if (doc.cta) total += 9;
  const s = Math.round(total);
  if (s > 120) Wn('时长', `估计约 ${s} 秒，偏长。删掉最弱的一两个镜头，宁短勿拖`);
  console.log(`镜头 ${shots.length + (doc.cta ? 1 : 0)} 个（${shots.map(x => x.kind).join(' → ')}${doc.cta ? ' → cta' : ''}），估计时长约 ${s} 秒`);
}

for (const x of errs) console.log(x);
for (const x of warns) console.log(x);
if (!errs.length && !warns.length) console.log('✓ lines.json 没发现问题');
else console.log(`\n${errs.length} 个错误，${warns.length} 个提醒${errs.length ? '（先改错误再出片）' : ''}`);
process.exit(errs.length ? 1 : 0);
