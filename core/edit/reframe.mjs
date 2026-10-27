// 竖屏主体智能裁：横素材进竖画布时，按人脸框把主体放在画面偏上（安全区内），检测不到回退 letterbox。
// segment / film.json 的 framing: "auto" | "letterbox" | { x, y, w, h }（源像素裁框）。竖画布默认 auto，横画布默认 letterbox。
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pythonBin } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const even = v => Math.max(2, Math.floor(v / 2) * 2);

// 纯函数：源 srcW×srcH、目标区域 dstW×dstH、归一化主体框 box → 源像素裁框。主体中心放在裁框 headroom（默认 0.38）高度处。
export function cropFor({ srcW, srcH, dstW, dstH, box, headroom = 0.38 }) {
  const aspect = dstW / dstH;
  let w = srcW, h = srcH;
  if (srcW / srcH > aspect) w = srcH * aspect; else h = srcW / aspect;
  w = even(w); h = even(h);
  const cx = box ? (box[0] + box[2] / 2) * srcW : srcW / 2;
  const cy = box ? (box[1] + box[3] / 2) * srcH : srcH / 2;
  const clamp = (v, max) => Math.round(Math.min(Math.max(0, v), max));
  return { x: clamp(cx - w / 2, srcW - w), y: clamp(cy - h * (box ? headroom : 0.5), srcH - h), w, h };
}

export function framingMode(seg, cfg) {
  const f = seg.framing ?? cfg.framing;
  if (f && typeof f === 'object') return 'crop';
  if (f === 'auto' || f === 'letterbox') return f;
  return cfg.height > cfg.width ? 'auto' : 'letterbox';
}

export function detectSubject(abs, t0, t1, { python = process.env.VM_PYTHON || pythonBin(), samples = 5 } = {}) {
  return new Promise(ok => {
    execFile(python, [path.join(HERE, 'detect_subject.py'), abs, String(t0), String(t1), String(samples)], { timeout: 120000 }, (err, out, errOut) => {
      if (err) { ok({ error: (errOut || err.message).trim().split('\n').pop() }); return; }
      try { ok(JSON.parse(out.trim().split('\n').pop())); } catch (e) { ok({ error: '检测输出无法解析' }); }
    });
  });
}

// 返回 ffmpeg -vf 的缩放/裁切部分。detect 可注入（单测 mock）。
export async function framingFilter(abs, seg, cfg, { srcW, srcH }, detect = detectSubject) {
  const b = cfg.safe?.box;
  const area = b || { x: 0, y: 0, w: cfg.width, h: cfg.height };
  const letterbox = () => [
    `scale=${area.w}:${area.h}:force_original_aspect_ratio=decrease:flags=lanczos`,
    `pad=${cfg.width}:${cfg.height}:${area.x}+(${area.w}-iw)/2:${area.y}+(${area.h}-ih)/2:black`,
  ];
  const mode = framingMode(seg, cfg);
  const fill = c => [`crop=${c.w}:${c.h}:${c.x}:${c.y}`, `scale=${area.w}:${area.h}:flags=lanczos`,
    `pad=${cfg.width}:${cfg.height}:${area.x}:${area.y}:black`];
  if (mode === 'letterbox') return { vf: letterbox(), how: 'letterbox' };
  const f = seg.framing ?? cfg.framing;
  if (mode === 'crop') return { vf: fill({ x: f.x | 0, y: f.y | 0, w: even(f.w), h: even(f.h) }), how: 'crop' };
  // auto：只在源比目标区域更宽（横转竖）时裁
  if (!(srcW / srcH > area.w / area.h + 0.01)) return { vf: letterbox(), how: 'letterbox(源不更宽)' };
  const r = await detect(abs, seg.in, seg.out);
  if (!r?.box) return { vf: letterbox(), how: `letterbox(回退：${r?.error || '未检出人脸'})` };
  const c = cropFor({ srcW, srcH, dstW: area.w, dstH: area.h, box: r.box });
  return { vf: fill(c), how: `auto ${c.w}x${c.h}+${c.x}+${c.y}` };
}
