#!/usr/bin/env node
// 钩子前3秒检查：node tools/check-hook.mjs films/<片名> [--secs 3]
// 四大死法见 docs/hook-check.md（2026-10-27 运营确认稿）。FAIL 退出码 1。
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const dir = args.find(a => !a.startsWith('--'));
const secs = +(args[args.indexOf('--secs') + 1] || 3) || 3;
if (!dir || !fs.existsSync(path.join(dir, 'lines.json'))) {
  console.error('用法：node tools/check-hook.mjs films/<片名>（需要 lines.json）');
  process.exit(2);
}
const L = JSON.parse(fs.readFileSync(path.join(dir, 'lines.json'), 'utf8'));
const lines = (L.lines || []).filter(l => typeof l.text === 'string' && l.text.trim());
if (!lines.length) { console.error('lines.json 没有台词'); process.exit(2); }

const CPS = 4.5;
let opening = [], acc = 0;
let ev = null; try { ev = JSON.parse(fs.readFileSync(path.join(dir, 'events.json'), 'utf8')); } catch {}
const timed = ev?.lines || ev?.vo || null;
for (const l of lines) {
  const t = timed?.find?.(x => x.id === l.id);
  const start = t?.t0 ?? acc;
  if (start >= secs) break;
  opening.push(l);
  acc += (t?.t1 != null && t?.t0 != null) ? Math.max(0.1, t.t1 - t.t0) : l.text.replace(/\s/g, '').length / CPS;
}
const first = lines[0].text.trim();
const text = opening.map(l => l.text).join('');
const treat = fs.existsSync(path.join(dir, 'TREATMENT.md'))
  ? fs.readFileSync(path.join(dir, 'TREATMENT.md'), 'utf8').slice(0, 1500) : '';

// 问句 / 反差 / 冲突 / 「你」/ 开场画面指令 —— 裸年代、第N、序号数字不算钩子
const hasQuestion = s => /[？?]/.test(s);
const hasContrast = s => /(还是|却|竟然|居然|反而|但是|但(?!是是)|不是.{0,12}而是|一边.{0,8}一边)/.test(s);
const hasYou = s => /你/.test(s);
const hasVisualCue = s => /(看这|镜头|画面|打开地图|先看|别划走|停一下)/.test(s);
// 具体物件：去掉年代/纯序号后仍含常见名词块（启发式）
const stripYearsNums = s => s
  .replace(/\d{3,4}\s*年/g, '')
  .replace(/第[一二三四五六七八九十\d]+[期集章节条]/g, '')
  .replace(/\d+/g, '');
const hasObject = s => {
  const t = stripYearsNums(s);
  return /[省市县州河港岛城路桥厂店车船机枪刀药饭床门窗手机电脑火箭地图急诊门诊医院]/.test(t)
    || /[\u4e00-\u9fff]{2,}(州|河|港|岛|城|店|机|药|床)/.test(t);
};
const hasHookSignal = s => hasQuestion(s) || hasContrast(s) || hasYou(s) || hasVisualCue(s) || hasObject(s);

const hits = [];

// 1 慢开场
if (/^(大家好|哈喽|hello|嗨|我是|欢迎来到|今天(我们)?(来|给大家)?(聊|讲|说)|本期|这期)/i.test(first)
  && !(hasQuestion(first) || hasContrast(first) || hasVisualCue(first))) {
  hits.push([
    '慢开场',
    '首句是招呼、自我介绍或「本期/这期」铺垫，且没有问题、反差、冲突或开场画面指令',
    '删掉招呼，直接用具体问题、反差或画面指令开口（用片里真实内容）',
  ]);
}

// 2 纯字墙（裸年代/序号数字不算钩子）
const firstLen = first.replace(/[\s，。、！？,.!?；;：:「」""]/g, '').length;
if (firstLen > 28 && !hasHookSignal(first)) {
  hits.push([
    '纯字墙',
    `首句有效字 ${firstLen}，且无问句、反差词、具体物件或「你」（裸年代/序号数字不算钩子）`,
    '把首句砍到 ≤20 字，留问句、反差、物件或「你」；其余挪到第 2 句',
  ]);
}

// 3 抽象空话
if (/在当今|随着.{0,12}(发展|到来|普及|加速)|赋能|底层逻辑|闭环|抓手|众所周知|不可否认|新时代|数字化转型|全方位|深度赋能/.test(text)) {
  hits.push([
    '抽象空话',
    '开场含空话/AI腔（在当今、随着…发展、赋能、底层逻辑、闭环、众所周知等）',
    '换成一个观众会遇到的具体场景或痛点（从 TREATMENT 里挑真实的一幕）',
  ]);
}

// 4 铺垫倒置（原「结论倒置」）：前3秒只铺年代/背景/原因，核心问题、反差或片名承诺未出现
const openingHasPromise = hasQuestion(text) || hasContrast(text) || hasVisualCue(text)
  || /(怎么|为什么|到底|千万别|先说结论|一句话)/.test(text);
const looksLikePadding = /(?:^\d{3,4}年|历史上|原因是|其实是因为|首先|先来了解|背景|刚独立|那时候|当时)/.test(text)
  || (/年/.test(text) && !openingHasPromise);
if (looksLikePadding && !openingHasPromise) {
  hits.push([
    '铺垫倒置',
    '前3秒只在铺年代、背景或原因，核心问题、反差或片名承诺未出现',
    '把核心问题、反差或片名承诺提到前3秒；年代/背景往后放',
  ]);
}

const warns = [];
if (treat && !/(画面|镜头|开场|钩子|shot|0[-–]3|0s|0:0)/i.test(treat)) {
  warns.push('TREATMENT 前段没写开场画面主体（画面仍以人看成片为准，只 WARN）');
}

const name = path.basename(path.resolve(dir));
console.log(`钩子检查 ${name}  前${secs}秒台词：「${text.slice(0, 60)}${text.length > 60 ? '…' : ''}」`);
for (const w of warns) console.log(`WARN  ${w}`);
if (!hits.length) { console.log('PASS  四大死法均未命中'); process.exit(0); }
for (const [k, why, fix] of hits) console.log(`FAIL  ${k}：${why}\n      改法：${fix}`);
process.exit(1);
