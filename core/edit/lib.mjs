// 素材片共用：路径白名单、film.json、ffmpeg / ffprobe
// 影片只能在仓库的 films/<片名> 或 templates/<模板> 里，片段素材也不能逃出该目录
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const NAME_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
export const ROLES = ['起', '承', '转', '合'];

export const round = (n, d = 3) => { const p = 10 ** d; return Math.round((+n) * p) / p; };
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export function say(msg) { console.log(`\n\x1b[1;36m▶ ${msg}\x1b[0m`); }

export function resolveFilm(arg) {
  if (!arg) throw new Error('用法：node core/edit/run.mjs <films/片名 | templates/模板> [步骤...]');
  const abs = path.resolve(arg);
  const rel = path.relative(ROOT, abs);
  const parts = rel.split(path.sep);
  if (rel.startsWith('..') || path.isAbsolute(rel) || parts.length !== 2 || !['films', 'templates'].includes(parts[0]) || !NAME_RE.test(parts[1])) {
    throw new Error(`影片路径必须是仓库里的 films/<片名> 或 templates/<模板>：${arg}`);
  }
  if (!fs.existsSync(abs)) throw new Error('目录不存在：' + rel.split(path.sep).join('/'));
  return abs;
}

// 把影片目录内的相对路径收成绝对路径；绝对路径、.. 和空路径都拒绝
export function inside(film, relPath) {
  if (typeof relPath !== 'string' || !relPath || path.isAbsolute(relPath)) throw new Error('非法路径：' + relPath);
  const abs = path.resolve(film, relPath);
  const rel = path.relative(film, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('路径越出影片目录：' + relPath);
  return abs;
}

export function readJSON(p, fallback = null) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
export function writeJSON(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 1) + '\n');
}

export function locked(doc) {
  return !!(doc && (doc.lock === true || doc.source === 'bot' || doc.source === 'human'));
}

function even(n) { n = Math.round(+n); if (!Number.isFinite(n)) return 0; return n % 2 ? n - 1 : n; }

export function loadFilm(film) {
  const cfg = readJSON(path.join(film, 'film.json'));
  if (!cfg || cfg.kind !== 'footage') throw new Error('这不是素材片：在 film.json 里写 "kind": "footage"（代码片请继续用 core/build.sh）');
  let width = even(cfg.width || 1920), height = even(cfg.height || 1080);
  if (width < 320 || width > 3840 || height < 320 || height > 3840) throw new Error(`分辨率 ${width}×${height} 超出 320–3840`);
  const fps = clamp(Math.round(cfg.fps || 24), 1, 60);
  let min = clamp(+cfg.target?.min || 60, 5, 600);
  let max = clamp(+cfg.target?.max || 120, 5, 600);
  if (min > max) [min, max] = [max, min];
  const seg = cfg.target?.segments || [6, 12];
  let segMin = clamp(Math.round(+seg[0] || 6), 1, 40);
  let segMax = clamp(Math.round(+seg[1] || 12), 1, 40);
  if (segMin > segMax) [segMin, segMax] = [segMax, segMin];
  const cut = clamp(+cfg.transition?.cut || 0.12, 0, 2);
  const role = clamp(+cfg.transition?.role || 0.45, 0, 2);
  return {
    kind: 'footage',
    title: cfg.title || path.basename(film),
    width, height, fps,
    sceneThreshold: clamp(cfg.sceneThreshold ?? 0.3, 0.01, 0.9),
    silenceSplit: clamp(cfg.silenceSplit ?? 0.8, 0.3, 5),
    silenceNoise: /^-?\d+(\.\d+)?dB$/.test(cfg.silenceNoise || '') ? cfg.silenceNoise : '-36dB',
    target: { min, max, segments: [segMin, segMax] },
    transition: { cut, role },
  };
}

export function pythonBin() {
  const p = path.join(ROOT, '.venv/bin/python');
  return fs.existsSync(p) ? p : 'python3';
}

export function run(cmd, args, { allowFail = false } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', d => { out += d; if (out.length > 8e6) out = out.slice(-4e6); });
    p.stderr.on('data', d => { err += d; if (err.length > 8e6) err = err.slice(-4e6); });
    p.on('error', reject);
    p.on('close', code => {
      if (code !== 0 && !allowFail) reject(new Error(`${path.basename(cmd)} 退出 ${code}\n${(err || out).slice(-2500)}`));
      else resolve({ code, out, err });
    });
  });
}

export function ffmpeg(args) {
  return run('ffmpeg', ['-hide_banner', '-nostdin', ...args]);
}

export async function ffprobe(file) {
  const { out } = await run('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file]);
  return JSON.parse(out);
}
