// 双审闸共享逻辑：CLI（tools/pipeline.mjs）与工作室网页按钮（POST /api/gate）共用。只改审批态，不渲染、不代发。
import fs from 'fs';
import path from 'path';
import { normalizeStatus } from '../studio/config.mjs';

export class GateError extends Error {}
const need = (ok, msg) => { if (!ok) throw new GateError(msg); };

export function applyGate(dir, cmd, { to = '', by = '', note = '' } = {}) {
  const file = path.join(dir, 'status.json');
  let line = ''; try { line = JSON.parse(fs.readFileSync(path.join(dir, 'brief.json'), 'utf8')).line || ''; } catch {}
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  const st = normalizeStatus(prev, { line });
  if (cmd === 'show') return st;
  const now = new Date().toISOString();
  const cur = st.pipeline?.state || null;
  const p = { ...(st.pipeline || {}) };
  note = String(note || '').trim(); by = String(by || '').trim() || '用户';
  switch (cmd) {
    case 'set':
      need(['benchmark_ready', 'remix_pending_review', 'render_done'].includes(to), 'set 只接受 benchmark_ready / remix_pending_review / render_done；审批用 approve-a/reject-a/approve-b');
      if (to === 'render_done') need(['remix_approved', 'render_done'].includes(cur), '没有 remix_approved 不能标 render_done');
      p.state = to; break;
    case 'approve-a': need(cur === 'remix_pending_review', `当前是 ${cur || '无'}，只有 remix_pending_review 能过审批 A`);
      p.state = 'remix_approved'; p.reviewA = { by, at: now, notes: note }; break;
    case 'reject-a':
      need(cur === 'remix_pending_review', `当前是 ${cur || '无'}，只有 remix_pending_review 能驳回`);
      need(note, '驳回要写意见');
      p.state = 'remix_rejected'; p.reviewA = { by, at: now, notes: note };
      fs.appendFileSync(path.join(dir, 'TREATMENT.md'), `\n\n## 审批 A 驳回意见（${now}）\n\n${note}\n`);
      st.notes = [st.notes, `[审批A驳回 ${now.slice(0, 10)}] ${note}`].filter(Boolean).join('\n').slice(-2000);
      break;
    case 'approve-b': need(cur === 'render_done', `当前是 ${cur || '无'}，只有 render_done 能过审批 B`);
      p.state = 'publish_approved'; p.reviewB = { by, at: now, notes: note }; break;
    case 'reject-b':
      need(cur === 'render_done', `当前是 ${cur || '无'}，只有 render_done 能驳回审批 B`);
      need(note, '驳回要写意见');
      // 成片驳回：回到 remix_approved（需返工重渲），意见写进 reviewB 与 notes。
      p.state = 'remix_approved'; p.reviewB = { by, at: now, notes: `驳回：${note}` };
      st.notes = [st.notes, `[审批B驳回 ${now.slice(0, 10)}] ${note}`].filter(Boolean).join('\n').slice(-2000);
      break;
    default: need(false, '未知命令 ' + cmd);
  }
  p.updatedAt = now;
  const next = normalizeStatus({ ...st, pipeline: p }, { line, prev, stamp: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
  return next;
}
