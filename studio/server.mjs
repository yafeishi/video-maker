// 视频工作台：node studio/server.mjs [--port 4400] [--host 127.0.0.1]
// 浏览器打开 http://127.0.0.1:4400 ：选片、实时预览 render(t)、拖时间轴、渲静帧 / 联系表 / 成片、看日志、播成片
// 只跑白名单里的任务（build.sh 步骤、静帧、联系表、配音检查、发布文案），项目路径限定在 templates/ 和 films/ 之下
import fs from 'fs'; import path from 'path'; import { spawn } from 'child_process'; import { fileURLToPath } from 'url';
import { serve, sendFile } from '../core/render/serve.mjs';
import { placeSegments } from '../core/edit/timeline.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = +opt('--port', process.env.STUDIO_PORT || 4400), HOST = opt('--host', process.env.STUDIO_HOST || '127.0.0.1');
const PY = fs.existsSync(path.join(ROOT, '.venv/bin/python')) ? path.join(ROOT, '.venv/bin/python') : 'python3';
const KINDS = { templates: 'template', films: 'film' };
const STEPS = ['fonts', 'voice', 'events', 'srt', 'audio', 'video', 'mux', 'poster', 'copy', 'check'];
const EDIT_STEPS = ['ingest', 'shots', 'frames', 'beats', 'timeline', 'lines', 'voice', 'assemble', 'copy', 'check'];
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;

// ———————— 项目 ————————
function projectDir(rel) {
  if (typeof rel !== 'string') return null;
  const parts = rel.split('/');
  if (parts.length !== 2 || !KINDS[parts[0]] || !NAME_RE.test(parts[1])) return null;
  const abs = path.join(ROOT, parts[0], parts[1]);
  return fs.existsSync(path.join(abs, 'index.html')) ? abs : null;
}
const exists = (...p) => fs.existsSync(path.join(...p));
const mtime = p => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } };
function describe(kind, name) {
  const rel = `${kind}/${name}`, abs = path.join(ROOT, rel);
  const html = fs.readFileSync(path.join(abs, 'index.html'), 'utf8');
  const title = (/<title>([^<]*)<\/title>/.exec(html) || [, name])[1].trim();
  const filmKind = filmKindOf(abs);
  const out = f => exists(abs, 'out', f) ? `/${rel}/out/${f}` : null;
  const stills = exists(abs, 'stills') ? fs.readdirSync(path.join(abs, 'stills')).filter(f => f.endsWith('.jpg')).sort((a, b) => mtime(path.join(abs, 'stills', b)) - mtime(path.join(abs, 'stills', a))).slice(0, 12).map(f => `/${rel}/stills/${f}`) : [];
  return {
    kind: KINDS[kind], filmKind, name, path: rel, title,
    poster: exists(abs, 'poster.jpg') ? `/${rel}/poster.jpg` : out('poster.jpg'),
    film: out(`${name}.mp4`), copy: out('copy.json'), copyTime: mtime(path.join(abs, 'out', 'copy.json')), srt: out(`${name}.srt`), mix: out('mix.wav'), mixTime: mtime(path.join(abs, 'out', 'mix.wav')),
    docs: ['STYLE.md', 'TREATMENT.md', 'CREDITS', 'publish.json', 'film.json'].filter(f => exists(abs, f)).map(f => `/${rel}/${f}`),
    build: exists(abs, 'build.sh'), stills,
    updated: Math.max(...['film.js', 'index.html', 'lines.json', 'poster.jpg'].map(f => mtime(path.join(abs, f)))),
    codeTime: Math.max(...['film.js', 'lines.json', 'audio.py'].map(f => mtime(path.join(abs, f)))),
    copySrcTime: Math.max(...['TREATMENT.md', 'lines.json', 'STYLE.md', 'CREDITS', 'publish.json', 'events.json'].map(f => mtime(path.join(abs, f)))),
  };
}
function listProjects() {
  const all = [];
  for (const kind of Object.keys(KINDS)) {
    const d = path.join(ROOT, kind); if (!fs.existsSync(d)) continue;
    for (const name of fs.readdirSync(d).sort()) if (NAME_RE.test(name) && exists(d, name, 'index.html')) all.push(describe(kind, name));
  }
  return all;
}
function newFilm(template, name) {
  const src = projectDir(`templates/${template}`);
  if (!src) throw new Error('模板不存在');
  if (!NAME_RE.test(name || '')) throw new Error('片名只能用小写字母、数字和连字符，例如 orange-cat');
  const dst = path.join(ROOT, 'films', name);
  if (fs.existsSync(dst)) throw new Error(`films/${name} 已存在`);
  const skip = new Set(['out', 'stills', 'voices', 'events.json', 'poster.jpg', 'raw']);
  fs.cpSync(src, dst, { recursive: true, filter: s => {
    const rel = path.relative(src, s);
    if (!rel) return true;
    if (skip.has(rel.split(path.sep)[0])) return false;
    if (rel === path.join('edit', 'work') || rel.startsWith(path.join('edit', 'work') + path.sep)) return false;
    if (rel === path.join('edit', 'frames') || rel.startsWith(path.join('edit', 'frames') + path.sep)) return false;
    return true;
  } });
  return `films/${name}`;
}

function filmKindOf(abs) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(abs, 'film.json'), 'utf8'));
    if (j && j.kind === 'footage') return 'footage';
  } catch { /* 代码片没有 film.json */ }
  return 'code';
}
function readJSON(abs) { try { return JSON.parse(fs.readFileSync(abs, 'utf8')); } catch { return null; } }
function editStatus(abs, rel) {
  if (filmKindOf(abs) !== 'footage') return { filmKind: 'code' };
  const ingest = readJSON(path.join(abs, 'edit/ingest.json'));
  const shots = readJSON(path.join(abs, 'edit/shots.json'));
  const beats = readJSON(path.join(abs, 'edit/beats.json'));
  const timeline = readJSON(path.join(abs, 'edit/timeline.json'));
  const lines = readJSON(path.join(abs, 'lines.json'));
  const assembly = readJSON(path.join(abs, 'edit/assembly.json'));
  const events = readJSON(path.join(abs, 'events.json'));
  const byFile = new Map((ingest?.files || []).map(f => [f.file, f]));
  let rawNames = [];
  try { rawNames = fs.readdirSync(path.join(abs, 'raw')).filter(f => /\.(mp4|mov|m4v)$/i.test(f)).sort(); } catch { /* 还没有 raw */ }
  let segments = timeline?.segments || [];
  let dur = timeline?.dur || 0;
  if (segments.length && segments.every(s => Number.isFinite(+s.in) && Number.isFinite(+s.out) && +s.out > +s.in)) {
    try {
      const placed = placeSegments(segments, { transition: timeline.transition || { cut: 0.12, role: 0.45 } });
      segments = placed.segments; dur = placed.dur;
    } catch { /* 时间线还不能排时钟，就按文件里的 t0 */ }
  }
  const roles = {};
  for (const b of beats?.beats || []) if (b.role) roles[b.role] = (roles[b.role] || 0) + 1;
  const frameDir = path.join(abs, 'edit/frames');
  let frames = [];
  if (fs.existsSync(frameDir)) {
    frames = fs.readdirSync(frameDir).filter(f => /^s\d+-\d+\.jpg$/.test(f)).sort().slice(0, 60).map(f => {
      const shot = (/^(s\d+)-\d+\.jpg$/.exec(f) || [])[1];
      const listed = readJSON(path.join(abs, 'edit/frames.json'))?.frames?.find(x => x.file === `edit/frames/${f}`);
      return { shot, t: listed?.t, url: `/${rel}/edit/frames/${f}` };
    });
  }
  return {
    filmKind: 'footage',
    raw: rawNames.map(name => ({ file: `raw/${name}`, ...(byFile.get(`raw/${name}`) || {}) })),
    shots: shots?.shots ? { n: shots.shots.length, threshold: shots.threshold, method: shots.method } : null,
    beats: beats?.beats ? { n: beats.beats.length, source: beats.source || '', logline: beats.logline || '', roles } : null,
    timeline: timeline ? {
      n: segments.length, dur, source: timeline.source || '', warnings: timeline.warnings || [],
      segments: segments.map(s => ({ id: s.id, shot: s.shot, role: s.role, src: s.src, in: +s.in, out: +s.out, t0: s.t0, t1: s.t1 })),
    } : null,
    frames,
    lines: lines?.lines ? { n: lines.lines.length, source: lines.source || '' } : null,
    assembly: assembly ? { dur: assembly.dur, width: assembly.width, height: assembly.height } : null,
    cues: events?.cues || [],
  };
}

// ———————— 任务 ————————
const jobs = new Map(); let seq = 0;
function taskCommand(dir, task, a = {}) {
  const num = v => { const x = Number(v); if (!Number.isFinite(x) || x < 0 || x > 36000) throw new Error('时间参数不对'); return x; };
  switch (task) {
    case 'build': {
      const steps = (a.steps || []).filter(s => STEPS.includes(s));
      return ['sh', [path.join(dir, 'build.sh'), ...steps]];
    }
    case 'still': return ['node', [path.join(ROOT, 'core/render/still.mjs'), dir, num(a.t).toFixed(2)]];
    case 'sheet': {
      const step = Math.max(.25, num(a.step || 2)), dur = num(a.dur || 60);
      const sh = `set -e; rm -f "${dir}"/stills/sheet_*.jpg; node "${ROOT}/core/render/still.mjs" "${dir}" --range 0:${Math.max(0, dur - .05).toFixed(2)}:${step} --prefix sheet_ --out "${dir}/stills/sheet_tmp"; ` +
        `cd "${dir}/stills/sheet_tmp" && "${PY}" "${ROOT}/core/render/sheet.py" "../sheet_${Date.now()}.jpg" $(ls *.jpg | sort -V) --cols 5 --w 384; cd "${dir}"; rm -rf "${dir}/stills/sheet_tmp"`;
      return ['sh', ['-c', sh]];
    }
    case 'copy': return ['node', [path.join(ROOT, 'core/publish/copy.mjs'), dir]];
    case 'edit': {
      const steps = (a.steps || []).filter(s => EDIT_STEPS.includes(s));
      return ['node', [path.join(ROOT, 'core/edit/run.mjs'), dir, ...steps]];
    }
    case 'asr': return ['sh', ['-c', `"${PY}" "${ROOT}/core/tts/asr_check.py" "${dir}/lines.json" "${dir}/voices" && "${PY}" "${ROOT}/core/tts/asr_mix.py" "${dir}/out/mix.wav" "${dir}/events.json"`]];
    default: throw new Error('未知任务 ' + task);
  }
}
function startJob(rel, task, a) {
  const dir = projectDir(rel); if (!dir) throw new Error('项目不存在');
  for (const j of jobs.values()) if (j.path === rel && j.status === 'running') throw new Error('这部片已有任务在跑，等它结束或先取消');
  const [cmd, argv] = taskCommand(dir, task, a);
  const id = String(++seq);
  const p = spawn(cmd, argv, { cwd: dir, env: { ...process.env, WORKBENCH_ROOT: ROOT, FORCE_COLOR: '0' }, detached: true });
  const job = { id, path: rel, task, args: a, status: 'running', started: Date.now(), ended: 0, code: null, log: [], subs: new Set(), proc: p };
  const push = s => { for (const line of s.toString().split(/\r?\n|\r/)) { if (!line) continue; const l = line.replace(/\x1b\[[0-9;]*m/g, ''); job.log.push(l); if (job.log.length > 4000) job.log.shift(); for (const r of job.subs) r.write(`data: ${JSON.stringify({ line: l })}\n\n`); } };
  p.stdout.on('data', push); p.stderr.on('data', push);
  p.on('close', code => {
    job.status = job.status === 'cancelled' ? 'cancelled' : code === 0 ? 'done' : 'failed'; job.code = code; job.ended = Date.now();
    for (const r of job.subs) { r.write(`data: ${JSON.stringify({ end: job.status, code })}\n\n`); r.end(); }
    job.subs.clear();
  });
  jobs.set(id, job);
  if (jobs.size > 50) jobs.delete(jobs.keys().next().value);
  return job;
}
const pub = j => ({ id: j.id, path: j.path, task: j.task, args: j.args, status: j.status, started: j.started, ended: j.ended, code: j.code, tail: j.log.slice(-1)[0] || '' });

// ———————— 文件变化推送（预览自动刷新） ————————
const watchers = new Map();
function watch(rel, res) {
  const dir = projectDir(rel); if (!dir) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' }); res.write(': ok\n\n');
  let w = watchers.get(rel);
  if (!w) {
    const subs = new Set(); let timer = null;
    const fw = fs.watch(dir, { recursive: true }, (_, f) => {
      if (!f || /^(out|stills|voices)[\\/]|events\.json$|\.wav$|~$|\.swp$|^edit[\\/](work|frames)[\\/]/.test(f)) return;
      clearTimeout(timer); timer = setTimeout(() => { for (const r of subs) r.write(`data: ${JSON.stringify({ file: f })}\n\n`); }, 150);
    });
    w = { subs, fw }; watchers.set(rel, w);
  }
  w.subs.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  res.on('close', () => { clearInterval(ping); w.subs.delete(res); if (!w.subs.size) { w.fw.close(); watchers.delete(rel); } });
}

// ———————— HTTP ————————
const json = (res, code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
const body = req => new Promise((ok, bad) => { let s = ''; req.on('data', c => { s += c; if (s.length > 1e5) req.destroy(); }); req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { bad(e); } }); });

async function api(req, res, u) {
  if (u === '/' || u === '/index.html') { sendFile(req, res, ROOT, '/studio/index.html'); return true; }
  if (!u.startsWith('/api/')) return false;
  const q = new URL(req.url, 'http://x').searchParams;
  try {
    if (u === '/api/projects' && req.method === 'GET') return json(res, 200, listProjects()), true;
    if (u === '/api/edit' && req.method === 'GET') {
      const dir = projectDir(q.get('path'));
      if (!dir) return json(res, 404, { error: '项目不存在' }), true;
      return json(res, 200, editStatus(dir, q.get('path'))), true;
    }
    if (u === '/api/new' && req.method === 'POST') { const b = await body(req); return json(res, 200, { path: newFilm(b.template, b.name) }), true; }
    if (u === '/api/jobs' && req.method === 'GET') return json(res, 200, [...jobs.values()].reverse().map(pub)), true;
    if (u === '/api/jobs' && req.method === 'POST') { const b = await body(req); return json(res, 200, pub(startJob(b.path, b.task, b.args || {}))), true; }
    if (u === '/api/watch') return watch(q.get('path'), res), true;
    let m;
    if ((m = /^\/api\/jobs\/(\d+)\/log$/.exec(u))) {
      const j = jobs.get(m[1]); if (!j) return json(res, 404, { error: '没有这个任务' }), true;
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      for (const line of j.log) res.write(`data: ${JSON.stringify({ line })}\n\n`);
      if (j.status !== 'running') { res.write(`data: ${JSON.stringify({ end: j.status, code: j.code })}\n\n`); res.end(); }
      else { j.subs.add(res); res.on('close', () => j.subs.delete(res)); }
      return true;
    }
    if ((m = /^\/api\/jobs\/(\d+)\/cancel$/.exec(u)) && req.method === 'POST') {
      const j = jobs.get(m[1]); if (!j) return json(res, 404, { error: '没有这个任务' }), true;
      if (j.status === 'running') { j.status = 'cancelled'; try { process.kill(-j.proc.pid, 'SIGTERM'); } catch { j.proc.kill('SIGTERM'); } }
      return json(res, 200, pub(j)), true;
    }
    return json(res, 404, { error: 'not found' }), true;
  } catch (e) { return json(res, 400, { error: e.message }), true; }
}

const { port } = await serve(ROOT, PORT, HOST, api);
console.log(`视频工作台 → http://${HOST === '0.0.0.0' ? '127.0.0.1' : HOST}:${port}`);
const bye = () => { for (const j of jobs.values()) if (j.status === 'running') try { process.kill(-j.proc.pid, 'SIGTERM'); } catch { } process.exit(0); };
process.on('SIGINT', bye); process.on('SIGTERM', bye);
