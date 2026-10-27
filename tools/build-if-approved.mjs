#!/usr/bin/env node
// 审批 A 闸门：node tools/build-if-approved.mjs films/<片> [build.sh 步骤…]
// 只有 status.json 的 pipeline.state 为 remix_approved（或已 render_done 重渲）才跑 build.sh；
// 成功后标 render_done（=等审批 B）并生成 copy 交接页。没有 pipeline 的旧片请直接用 build.sh。
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [dir, ...steps] = process.argv.slice(2);
if (!dir) { console.error('用法：node tools/build-if-approved.mjs films/<片名> [步骤…]'); process.exit(2); }
const abs = path.resolve(dir);
let s = null; try { s = JSON.parse(fs.readFileSync(path.join(abs, 'status.json'), 'utf8')); } catch {}
const state = s?.pipeline?.state;
if (!['remix_approved', 'render_done', 'publish_approved'].includes(state)) {
  console.error(`✗ 闸门未开：pipeline.state=${state || '无'}。没有 remix_approved 不得渲染（docs/ops-remix-pipeline.md）。\n  等用户过审批 A 后：node tools/pipeline.mjs ${dir} approve-a --note "…"`);
  process.exit(1);
}
const run = (cmd, args) => { const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT }); if (r.status !== 0) process.exit(r.status || 1); };
run('node', [path.join(ROOT, 'tools/check-hook.mjs'), abs]);
run('sh', [path.join(abs, 'build.sh'), ...steps]);
if (state === 'remix_approved') run('node', [path.join(ROOT, 'tools/pipeline.mjs'), abs, 'set', 'render_done']);
run('node', [path.join(ROOT, 'core/publish/copy.mjs'), abs]);
console.log('出片完成 → 等审批 B。copy 交接页：' + path.join(abs, 'out/copy-handoff.md'));
