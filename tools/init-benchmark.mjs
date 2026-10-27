#!/usr/bin/env node
// 对标入库脚手架：node tools/init-benchmark.mjs films/<片名> [--url 链接] [--raw 文件名]
// 写 benchmark.json（学结构与节奏，不拿原片画面/口播）+ 待审包清单，并把 pipeline 标为 benchmark_ready。
// 不下载、不搬运原片；链接只记录。拆解字段由 Agent 看完对标后填（没看就留空，别编）。
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dir = args[0];
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : ''; };
if (!dir || !fs.existsSync(dir)) { console.error('用法：node tools/init-benchmark.mjs films/<片名> [--url 链接] [--raw raw/xx.mp4]'); process.exit(2); }
const f = path.join(dir, 'benchmark.json');
if (fs.existsSync(f)) { console.error('benchmark.json 已存在，不覆盖'); process.exit(1); }
const bm = {
  version: 1,
  source: { url: opt('--url'), raw: opt('--raw'), platform: '', author: '', seenBy: '', seenAt: null },
  hook: { first3s: '', device: '' },          // 前3秒说了什么/给了什么画面；device：问题/反常/数字/物件
  rhythm: { durationSec: null, shots: null, avgShotSec: null, beats: [] }, // beats: [{t, role:起承转合, what}]
  subtitle: { lines: null, position: '', style: '' },
  learn: [],                                  // 学什么（结构、节奏、字幕结构）
  dontTake: ['原片画面', '原片口播原文', '原片配乐'], // 不拿什么
  diff: '',                                   // 我们的二创差异：题目/角色/画面
  source_note: '对标只学结构与节奏；画面与口播必须二创，不搬运原片。',
};
fs.writeFileSync(f, JSON.stringify(bm, null, 2) + '\n');
console.log('✓ ' + f);
spawnSync('node', [path.join(ROOT, 'tools/pipeline.mjs'), dir, 'set', 'benchmark_ready'], { stdio: 'inherit' });
console.log(`下一步（待审包，见 docs/ops-remix-pipeline.md §待审包）：
  1. 看对标（链接/raw 截帧），填 benchmark.json 的 hook/rhythm/learn/diff；没看过的字段留空
  2. 写 TREATMENT.md（含 0–3 秒画面主体、对标差异说明、封面意图）和 lines.json（过 humanizer）
  3. node tools/check-lines.mjs ${dir} && node tools/check-hook.mjs ${dir}
  4. node tools/pipeline.mjs ${dir} set remix_pending_review  → 交用户审批 A`);
