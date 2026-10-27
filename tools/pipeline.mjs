#!/usr/bin/env node
// 双审闸状态机（只记状态，绝不渲染外的动作、绝不代发）：
//   node tools/pipeline.mjs films/<片> show
//   node tools/pipeline.mjs films/<片> set benchmark_ready|remix_pending_review|render_done
//   node tools/pipeline.mjs films/<片> approve-a [--by 用户] [--note "…"]
//   node tools/pipeline.mjs films/<片> reject-a --note "驳回意见"     → 意见追加到 TREATMENT.md 与 status.notes
//   node tools/pipeline.mjs films/<片> approve-b [--by 用户]          → publish_approved：只记状态，由用户亲自发
//   node tools/pipeline.mjs films/<片> reject-b --note "意见"        → 回 remix_approved 返工
// 审批 A/B 只能在用户明确表态后由 Agent 代记，备注写清是谁、在哪条消息拍板。
import fs from 'fs';
import path from 'path';
import { gateOf } from '../studio/config.mjs';
import { applyGate, GateError } from './pipeline-lib.mjs';

const [dir, cmd, ...rest] = process.argv.slice(2);
const opt = k => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : ''; };
if (!dir || !cmd) { console.error(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 8).join('\n')); process.exit(2); }
let st;
try { st = applyGate(dir, cmd, { to: rest[0], by: opt('--by'), note: opt('--note') }); }
catch (e) { if (e instanceof GateError) { console.error('✗ ' + e.message); process.exit(1); } throw e; }
const g = gateOf(st.pipeline);
console.log(`${path.basename(path.resolve(dir))}: ${g.state || '—'} ${g.label}${g.gate ? `（卡审批 ${g.gate}，等${g.owner}）` : ''}`);
if (g.state === 'publish_approved') console.log('只记状态：由用户亲自发帖，机器人不登录、不代发。');
