#!/usr/bin/env node
// 日产节奏 Pending 回报：node tools/status-pending.mjs [--json] [--all]
// 扫 films/*/status.json，列出没到「已发/已复盘」的片：节奏位、审批闸、责任人。只读，不改状态、不编播放数。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { gateOf, rhythmOf } from '../studio/config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = process.argv.includes('--json'), all = process.argv.includes('--all');
const DONE = new Set(['已发', '待复盘', '已复盘']);
const rows = [];
for (const name of fs.readdirSync(path.join(ROOT, 'films')).sort()) {
  const f = path.join(ROOT, 'films', name, 'status.json');
  if (!fs.existsSync(f)) continue;
  let s; try { s = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { rows.push({ film: name, error: 'status.json 无法解析' }); continue; }
  if (!all && DONE.has(s.stage)) continue;
  let title = name; try { title = JSON.parse(fs.readFileSync(path.join(ROOT, 'films', name, 'brief.json'), 'utf8')).topic || name; } catch {}
  const g = gateOf(s.pipeline);
  rows.push({ film: name, title, stage: s.stage, rhythm: rhythmOf(s.stage), gate: g.gate, pipeline: g.state, pipelineLabel: g.label, owner: s.owner || '', ops: s.ops, handoff: s.handoff, updatedAt: s.updatedAt || null });
}
if (json) { console.log(JSON.stringify(rows, null, 1)); process.exit(0); }
console.log(`Pending ${rows.length} 部（${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} 北京时间）`);
for (const r of rows) {
  if (r.error) { console.log(`- ${r.film}: ✗ ${r.error}`); continue; }
  const gate = r.gate ? `【卡审批${r.gate}】` : '';
  console.log(`- ${r.film}｜${r.rhythm}（${r.stage}）${gate}${r.pipeline ? ' ' + r.pipelineLabel : ''}｜责任：${r.owner || '—'}｜运营：${r.ops}｜${r.handoff}｜更新：${r.updatedAt || '—'}${r.title !== r.film ? '｜' + r.title : ''}`);
}
