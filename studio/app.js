// 视频工作台前端：预览 iframe 里的 render(t)，时间轴、任务、成片
const $ = s => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) k === 'class' ? e.className = v : k.startsWith('on') ? e.addEventListener(k.slice(2), v) : e.setAttribute(k, v); e.append(...kids); return e; };
const fmt = t => { t = Math.max(0, t); const m = Math.floor(t / 60), s = t - m * 60; return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`; };
const api = async (u, body) => { const r = await fetch(u, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.statusText); return j; };

const S = { projects: [], cur: null, fw: null, dur: 0, t: 0, playing: false, clock0: 0, t0: 0, lastFrame: -1, tl: { shots: [], cues: [], ev: [] }, job: null, es: null, watch: null, lineFilter: '', view: 'board', brief: null, catalog: null };
const view = $('#view'), audio = $('#mix'), tl = $('#tl');
setView('board');

// ———————— 项目列表 ————————
async function loadProjects() {
  S.projects = await api('/api/projects');
  const films = S.projects.filter(p => p.kind === 'film' && (!S.lineFilter || p.task?.line === S.lineFilter));
  const temps = S.projects.filter(p => p.kind === 'template');
  const sub = p => p.task ? [p.task.line || '未分线', p.task.stage, p.task.owner].filter(Boolean).join(' · ') : '';
  const item = p => el('li', { class: S.cur?.path === p.path ? 'on' : '', 'data-path': p.path, onclick: () => select(p.path) },
    el('div', { class: 'thumb', style: p.poster ? `background-image:url("${p.poster}?${p.updated}")` : '' }, p.poster ? '' : (p.filmKind === 'footage' ? '素材' : 'render(t)')),
    el('div', { class: 'meta' }, p.film ? el('span', { class: 'badge' }, '已出片') : (p.filmKind === 'footage' ? el('span', { class: 'badge' }, '素材') : ''), el('b', {}, p.title), el('span', { class: 'sub' }, sub(p) || p.path)));
  $('#listFilms').replaceChildren(...films.map(item)); $('#emptyFilms').style.display = films.length ? 'none' : '';
  $('#listTemplates').replaceChildren(...temps.map(item));
  $('#newTemplate').replaceChildren(...temps.map(p => el('option', { value: p.name }, `${p.title}（${p.name}）`)));
  if (S.cur) { S.cur = S.projects.find(p => p.path === S.cur.path) || S.cur; renderOutputs(); mixState(); }
  renderBoard();
  if (S.cur?.kind === 'film') paintTask(S.cur.task);
}

async function select(path, keepT = false) {
  const p = S.projects.find(x => x.path === path); if (!p) return;
  const same = S.cur?.path === path;
  S.cur = p; location.hash = path;
  document.querySelectorAll('.plist li').forEach(li => li.classList.toggle('on', li.dataset.path === path));
  $('#nowTitle').innerHTML = ''; $('#nowTitle').append(el('b', {}, p.title), `  ·  ${p.path}`);
  document.body.dataset.kind = p.filmKind || 'code';
  const footage = p.filmKind === 'footage';
  $('#footageStage').hidden = !footage;
  $('#frameWrap').style.display = footage ? 'none' : '';
  if (!same || !keepT) S.t = 0;
  pause();
  if (footage) { view.src = 'about:blank'; S.fw = null; $('#stageEmpty').style.display = 'none'; status(''); await loadFootage(); }
  else await loadFrame();
  audio.src = p.mix ? `${p.mix}?${p.mixTime}` : ''; mixState();
  renderOutputs(); attachRunningJob();
  if (!same) { S.brief = null; S.briefPath = ''; watchProject(); loadBrief(); if (p.kind === 'film') paintTask(p.task, true); }
  renderBoard();
}

// ———————— 预览 ————————
function status(msg, bad = false) { const s = $('#stageStatus'); s.textContent = msg; s.className = 'stage-status' + (msg ? ' show' : '') + (bad ? ' bad' : ''); }
function loadFrame() {
  return new Promise(res => {
    status('加载中…'); $('#stageEmpty').style.display = 'none';
    S.fw = null; let tries = 0;
    view.onload = () => {
      const w = view.contentWindow;
      w.addEventListener('error', e => status('页面报错：' + (e.message || e), true));
      w.addEventListener('unhandledrejection', e => status('页面报错：' + (e.reason?.message || e.reason), true));
      const poll = () => {
        if (w.READY === true && typeof w.render === 'function') {
          S.fw = w; S.dur = +w.DUR || 0;
          S.tl = { shots: w.SHOTS || [], cues: w.CUES || [], ev: w.EV || [] };
          $('#tcDur').textContent = fmt(S.dur); S.t = Math.min(S.t, S.dur); S.lastFrame = -1;
          draw(S.t, true); status(''); renderInfo(); res(true); return;
        }
        if (++tries > 300) { status('页面没有就绪：检查 window.READY / window.render，并看浏览器控制台', true); res(false); return; }
        setTimeout(poll, 50);
      };
      poll();
    };
    view.src = `/${S.cur.path}/index.html?studio=1&v=${Date.now()}`;
  });
}
function fit() {
  const st = $('#stage'), w = st.clientWidth, h = st.clientHeight, k = Math.min(w / 1920, h / 1080);
  $('#frameWrap').style.transform = `translate(${(w - 1920 * k) / 2}px, ${(h - 1080 * k) / 2}px) scale(${k})`;
}
function frameTime(t) { const fps = +$('#selFps').value; return fps ? Math.floor(t * fps + 1e-6) / fps : t; }
function draw(t, force = false) {
  S.t = Math.max(0, Math.min(t, S.dur));
  const ft = frameTime(S.t), fid = Math.round(ft * 1000);
  if (S.fw && (force || fid !== S.lastFrame)) {
    try { S.fw.render(ft); S.lastFrame = fid; } catch (e) { status('render 报错：' + e.message, true); pause(); }
  }
  $('#tcNow').textContent = fmt(S.t); $('#tcFrame').textContent = '#' + Math.floor(S.t * 24 + 1e-6);
  drawTimeline();
}

// ———————— 播放 ————————
const useAudio = () => $('#chkAudio').checked && S.cur?.mix && audio.src;
function play() {
  if (!S.fw) return;
  if (S.t >= S.dur - 1e-3) S.t = 0;
  S.playing = true; $('#btnPlay').textContent = '❚❚';
  S.t0 = S.t; S.clock0 = performance.now();
  if (useAudio()) { audio.currentTime = S.t; audio.play().catch(() => { }); }
  requestAnimationFrame(tick);
}
function pause() { S.playing = false; $('#btnPlay').textContent = '▶'; audio.pause(); }
function tick() {
  if (!S.playing) return;
  let t = useAudio() && !audio.paused ? audio.currentTime : S.t0 + (performance.now() - S.clock0) / 1000;
  if (t >= S.dur) {
    if ($('#chkLoop').checked) { draw(0, true); S.t0 = 0; S.clock0 = performance.now(); if (useAudio()) audio.currentTime = 0; requestAnimationFrame(tick); return; }
    draw(S.dur); pause(); return;
  }
  draw(t); requestAnimationFrame(tick);
}
function seek(t) { const was = S.playing; pause(); draw(t, true); if (was) play(); }
function step(d) { pause(); const fps = +$('#selFps').value || 24; draw(Math.round(S.t * fps + d) / fps, true); }

// ———————— 时间轴 ————————
function drawTimeline() {
  const dpr = devicePixelRatio || 1, W = tl.clientWidth, H = tl.clientHeight;
  if (tl.width !== W * dpr || tl.height !== H * dpr) { tl.width = W * dpr; tl.height = H * dpr; }
  const g = tl.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  if (!S.dur) return;
  const pad = 10, X = t => pad + (W - 2 * pad) * t / S.dur;
  const rows = { ruler: 4, shot: 24, cue: 56, ev: 88 };
  g.font = '11px "JetBrains Mono", monospace'; g.textBaseline = 'middle';
  const every = [1, 2, 5, 10, 15, 30, 60].find(s => (W - 2 * pad) / S.dur * s > 46) || 60;
  for (let s = 0; s <= S.dur; s += 1) {
    const major = s % every === 0; g.fillStyle = major ? '#4a5569' : '#222b3a'; g.fillRect(X(s), rows.ruler + (major ? 0 : 8), 1, major ? 14 : 6);
    if (major) { g.fillStyle = '#8390a5'; g.fillText(`${s}s`, X(s) + 3, rows.ruler + 8); }
  }
  S.tl.shots.forEach((s, i) => {
    const x0 = X(s.t0), x1 = X(s.t1); g.fillStyle = i % 2 ? '#1c2331' : '#232c3d'; g.fillRect(x0, rows.shot, x1 - x0 - 1, 26);
    g.save(); g.beginPath(); g.rect(x0, rows.shot, x1 - x0 - 4, 26); g.clip(); g.fillStyle = '#c9d2e0'; g.fillText(s.id, x0 + 6, rows.shot + 13); g.restore();
  });
  g.font = '12px "PingFang SC", "Noto Sans SC", sans-serif';
  for (const c of S.tl.cues) {
    const x0 = X(c.t0), x1 = X(c.t1); g.fillStyle = 'rgba(70,240,196,.16)'; g.fillRect(x0, rows.cue, x1 - x0, 26);
    g.fillStyle = 'rgba(70,240,196,.7)'; g.fillRect(x0, rows.cue, 2, 26);
    g.save(); g.beginPath(); g.rect(x0, rows.cue, x1 - x0 - 2, 26); g.clip(); g.fillStyle = '#dff'; g.fillText(c.text, x0 + 6, rows.cue + 13); g.restore();
  }
  for (const e of S.tl.ev) {
    if (e.type === 'voice') { g.fillStyle = '#46f0c4'; g.fillRect(X(e.t), rows.ev + 4, Math.max(2, X(e.t + (e.d || 1)) - X(e.t)), 8); }
    else if (e.type === 'sfx') { g.fillStyle = '#ffb14a'; g.fillRect(X(e.t) - 1, rows.ev + 16, 2, 14); }
  }
  const px = X(S.t); g.fillStyle = '#46f0c4'; g.fillRect(px - 1, 0, 2, H);
  g.beginPath(); g.moveTo(px - 6, 0); g.lineTo(px + 6, 0); g.lineTo(px, 8); g.fill();
}
let scrubbing = false;
const tAt = e => { const r = tl.getBoundingClientRect(); return Math.max(0, Math.min(S.dur, (e.clientX - r.left - 10) / (r.width - 20) * S.dur)); };
tl.addEventListener('pointerdown', e => { if (!S.fw) return; scrubbing = true; tl.setPointerCapture(e.pointerId); pause(); draw(tAt(e), true); });
tl.addEventListener('pointermove', e => { if (scrubbing) draw(tAt(e)); });
tl.addEventListener('pointerup', () => { scrubbing = false; });

// ———————— 任务 ————————
function setJobHead(j) {
  const h = $('#jobHead');
  if (!j) { h.textContent = '没有正在运行的任务'; h.className = 'job-head'; $('#btnCancel').disabled = true; return; }
  const label = { running: '运行中', done: '完成', failed: '失败', cancelled: '已取消' }[j.status] || j.status;
  const secs = (((j.ended || Date.now()) - j.started) / 1000).toFixed(0);
  h.textContent = `#${j.id} ${j.task}${j.args?.steps?.length ? ' ' + j.args.steps.join(' ') : ''} · ${label} · ${secs}s`;
  h.className = 'job-head ' + j.status; $('#btnCancel').disabled = j.status !== 'running';
}
function follow(j) {
  S.es?.close(); S.job = j; setJobHead(j);
  const log = $('#log'); log.textContent = '';
  const es = new EventSource(`/api/jobs/${j.id}/log`); S.es = es;
  const timer = setInterval(() => setJobHead(S.job), 1000);
  es.onmessage = ev => {
    const d = JSON.parse(ev.data);
    if (d.line !== undefined) { const stick = log.scrollTop + log.clientHeight >= log.scrollHeight - 30; log.textContent += d.line + '\n'; if (stick) log.scrollTop = log.scrollHeight; }
    if (d.end) {
      es.close(); clearInterval(timer); S.job = { ...S.job, status: d.end, code: d.code, ended: Date.now() }; setJobHead(S.job);
      const footage = document.body.dataset.kind === 'footage';
      loadProjects().then(() => {
        if (S.cur?.mix) audio.src = `${S.cur.mix}?${S.cur.mixTime}`;
        if (d.end !== 'done') return;
        if (footage) loadFootage();
        if (['still', 'sheet'].includes(j.task)) tab('output');
        if (j.task === 'copy') tab('publish');
        if (footage && (j.task === 'build' || j.args?.steps?.includes?.('assemble'))) tab('output');
      });
      if (!footage && (j.args?.steps?.some?.(s => ['events', 'voice'].includes(s)) || j.task === 'build')) loadFrame();
    }
  };
  es.onerror = () => { es.close(); clearInterval(timer); };
}
async function run(task, args = {}) {
  if (!S.cur) return;
  try { follow(await api('/api/jobs', { path: S.cur.path, task, args })); tab('render'); }
  catch (e) { $('#log').textContent = '✗ ' + e.message; }
}
async function attachRunningJob() {
  const js = await api('/api/jobs'); const j = js.find(x => x.path === S.cur.path && x.status === 'running') || js.find(x => x.path === S.cur.path);
  if (j) follow(j); else { S.es?.close(); S.job = null; setJobHead(null); $('#log').textContent = ''; }
}
document.querySelectorAll('[data-job]').forEach(b => b.addEventListener('click', () => {
  const task = b.dataset.job;
  if (task === 'build') run('build', { steps: (b.dataset.steps || '').split(' ').filter(Boolean) });
  else if (task === 'edit') run('edit', { steps: (b.dataset.steps || '').split(' ').filter(Boolean) });
  else if (task === 'still') run('still', { t: frameTime(S.t) });
  else if (task === 'sheet') run('sheet', { step: +$('#sheetStep').value || 2, dur: S.dur });
  else run(task);
}));
$('#btnCancel').onclick = () => S.job && api(`/api/jobs/${S.job.id}/cancel`, {});

// ———————— 自动刷新 ————————
function watchProject() {
  S.watch?.close(); if (!S.cur) return;
  const es = new EventSource(`/api/watch?path=${encodeURIComponent(S.cur.path)}`); S.watch = es;
  let timer = null;
  es.onmessage = () => { clearTimeout(timer); timer = setTimeout(async () => {
    const was = S.playing; pause();
    if (document.body.dataset.kind === 'footage') await loadFootage(); else await loadFrame();
    mixState(); if (was && document.body.dataset.kind !== 'footage') play();
  }, 250); };
}

// ———————— 面板 ————————
function tab(name) { document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name)); document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.id === 'tab-' + name)); }
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => tab(b.dataset.tab));
function mixState() {
  const m = $('#mixState'), p = S.cur;
  if (!p) { m.textContent = ''; return; }
  if (!p.mix) { m.textContent = '无混音（出片后可带声音预览）'; m.className = 'mix-state'; return; }
  const stale = p.codeTime > p.mixTime + 1000;
  m.textContent = stale ? '代码比混音新：声音可能对不上，重混音即可' : '混音 ' + new Date(p.mixTime).toLocaleTimeString();
  m.className = 'mix-state' + (stale ? ' warn' : '');
}
async function loadFootage() {
  if (!S.cur || S.cur.filmKind !== 'footage') return;
  let d;
  try { d = await api('/api/edit?path=' + encodeURIComponent(S.cur.path)); }
  catch (e) { status(e.message, true); return; }
  if (S.cur?.filmKind !== 'footage') return;
  const segs = d.timeline?.segments || [];
  S.dur = d.assembly?.dur || d.timeline?.dur || 0;
  S.tl = {
    shots: segs.map(s => ({ id: `${s.role || ''} ${s.id || ''}`.trim(), t0: s.t0 || 0, t1: s.t1 || s.t0 || 0 })),
    cues: d.cues || [],
    ev: (d.cues || []).map(c => ({ t: c.t0, type: 'voice', d: Math.max(0, c.t1 - c.t0) })),
  };
  $('#tcDur').textContent = fmt(S.dur); S.t = Math.min(S.t, S.dur || 0); draw(S.t, true);
  const chip = (ok, text) => el('span', { class: 'chip' + (ok ? ' ok' : '') }, text);
  $('#editChips').replaceChildren(
    chip(d.raw?.length, `素材 ${d.raw?.length || 0}`),
    chip(d.shots, `镜头 ${d.shots?.n ?? '—'}`),
    chip(d.frames?.length, `抽帧 ${d.frames?.length || 0}`),
    chip(d.beats, `节拍 ${d.beats ? (d.beats.source || '未标') + ' ' + d.beats.n : '—'}`),
    chip(d.timeline, `时间线 ${d.timeline ? d.timeline.n + ' 段' : '—'}`),
    chip(d.lines, `旁白 ${d.lines ? (d.lines.source || '') : '—'}`),
    chip(d.assembly, d.assembly ? `${d.assembly.width}×${d.assembly.height}` : '未出片'),
  );
  const durTxt = d.timeline?.dur != null ? `规划 ${Number(d.timeline.dur).toFixed(1)}s` : '还没有时间线';
  $('#editSummary').textContent = [d.beats?.logline, durTxt, d.timeline?.source, ...(d.timeline?.warnings || [])].filter(Boolean).join(' · ');
  $('#editSegments').replaceChildren(...(segs.length ? segs.map(s => el('tr', { onclick: () => seekFootage(s.t0) },
    el('td', { class: 'n' }, fmt(s.t0 || 0)), el('td', {}, `${s.role || ''} ${s.id || ''}`), el('td', { class: 'n' }, `${Math.max(0, (s.out || 0) - (s.in || 0)).toFixed(1)}s`)))
    : [el('tr', {}, el('td', {}, '还没有时间线'))]));
  $('#filmstrip').replaceChildren(...(d.frames?.length ? d.frames.map(f => el('figure', { onclick: () => { const seg = segs.find(s => s.shot === f.shot); if (seg) seekFootage(seg.t0); } },
    el('img', { src: `${f.url}?${Date.now()}`, alt: f.shot || '', loading: 'lazy' }),
    el('figcaption', {}, `${f.shot || ''}  ${f.t != null ? Number(f.t).toFixed(1) : ''}`)))
    : [el('p', { class: 'hint' }, '还没有抽帧。在「素材」里点「检测并抽帧」，或在「渲染」里一键出片。')]));
  $('#footageStatus').textContent = d.assembly ? '成片在上面，点镜头或时间线可跳转。' : '检测、抽帧、排时间线之后，在这里看结构。组装完成后可以播放。';
  renderInfo();
}
function seekFootage(t) {
  S.t = t || 0; draw(S.t, true);
  const v = $('#footageVideo');
  if (v?.src && !v.hidden) v.currentTime = S.t;
}

function renderOutputs() {
  const p = S.cur, v = $('#film');
  const fv = $('#footageVideo');
  if (fv) {
    if (p.filmKind === 'footage' && p.film) { const src = `${p.film}?${p.mixTime}`; if (!fv.src.endsWith(src)) fv.src = src; fv.hidden = false; }
    else { fv.removeAttribute('src'); fv.load(); fv.hidden = true; }
  }
  if (p.film) { const src = `${p.film}?${p.mixTime}`; if (!v.src.endsWith(src)) v.src = src; v.classList.add('show'); $('#filmNone').style.display = 'none'; }
  else { v.removeAttribute('src'); v.load(); v.classList.remove('show'); $('#filmNone').style.display = ''; }
  const links = [[p.film, '下载 mp4'], [p.srt, '字幕 .srt'], [p.mix, '混音 .wav'], [p.poster, '海报'], [p.copy, '发布文案 .json']].filter(([u]) => u);
  $('#filmLinks').replaceChildren(...links.map(([u, t]) => el('a', { href: u, target: '_blank', download: '' }, t)));
  $('#stills').replaceChildren(...(p.stills.length ? p.stills.map(u => el('a', { href: u, target: '_blank' }, el('img', { src: u + '?' + Date.now(), loading: 'lazy' }), el('span', {}, u.split('/').pop())))
    : [el('p', { class: 'hint' }, '还没有静帧。在「渲染」里点「渲当前静帧」或「联系表」。')]));
  renderCopy();
}

// ———————— 发布文案 ————————
async function copyText(text, btn) {
  try { await navigator.clipboard.writeText(text); }
  catch { const ta = el('textarea', { style: 'position:fixed;opacity:0' }); ta.value = text; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
  const was = btn.textContent; btn.textContent = '已复制 ✓'; btn.classList.add('ok'); setTimeout(() => { btn.textContent = was; btn.classList.remove('ok'); }, 1200);
}
let copyKey = '';
async function renderCopy() {
  const p = S.cur, key = `${p.path}@${p.copyTime}`;
  if (key === copyKey) return; copyKey = key;
  const state = $('#copyState'), cards = $('#copyCards');
  if (!p.copy) {
    state.textContent = '还没有文案。点「生成文案」，或在「渲染」里一键出片（最后会自动生成）。'; state.className = 'hint';
    $('#copyLinks').replaceChildren(); cards.replaceChildren(); return;
  }
  let d; try { d = await (await fetch(`${p.copy}?${p.copyTime}`)).json(); } catch { state.textContent = 'copy.json 读取失败，重新生成一次'; return; }
  if (S.cur?.path !== p.path) return;
  const stale = p.copySrcTime > p.copyTime + 1000;
  const templates = (d.platforms || []).filter(x => x.template && x.template !== 'channels' && x.template !== 'x' && x.template !== 'xhs' && x.template !== 'douyin').map(x => `${x.name} ${x.template}`);
  state.textContent = (stale ? '素材比文案新，建议重新生成 · ' : '') + `生成于 ${new Date(d.generated).toLocaleString()} · 素材：${d.source.files.join('、') || 'index.html'}${d.source.dur ? ` · ${d.source.dur.toFixed(1)} 秒` : ''}${templates.length ? ' · 模板 ' + templates.join('、') : ''}`;
  state.className = 'hint' + (stale ? ' warn' : '');
  const base = p.copy.replace(/copy\.json$/, '');
  $('#copyLinks').replaceChildren(el('a', { href: p.copy, target: '_blank', download: '' }, 'copy.json'),
    ...d.platforms.map(x => el('a', { href: `${base}copy-${x.id}.md`, target: '_blank', download: '' }, `${x.name} .md`)));
  const limit = (n, l) => l ? `${n}/${Array.isArray(l) ? l[1] : l}` : `${n}`;
  cards.replaceChildren(...d.platforms.map(x => el('div', { class: 'copy-card', 'data-platform': x.id },
    el('div', { class: 'copy-head' }, el('b', {}, x.name), el('span', { class: 'n' }, `${x.id === 'x' ? '' : '标题 ' + limit(x.counts.title, x.limits.title) + ' · '}正文 ${limit(x.counts.body, x.limits.body)}`)),
    x.id === 'x' ? '' : el('div', { class: 'copy-title' }, x.title),
    el('pre', { class: 'copy-body' }, x.body),
    ...x.warnings.map(w => el('p', { class: 'copy-warn' }, '⚠ ' + w)),
    el('div', { class: 'btns' },
      x.id === 'x' ? '' : el('button', { class: 'tiny', onclick: e => copyText(x.title, e.target) }, '复制标题'),
      el('button', { class: 'tiny', onclick: e => copyText(x.body, e.target) }, x.id === 'x' ? '复制推文' : '复制正文'),
      x.tags?.length ? el('button', { class: 'tiny', onclick: e => copyText(x.tags.join(' '), e.target) }, '复制话题') : '',
      x.id === 'x' ? '' : el('button', { class: 'tiny primary', onclick: e => copyText(x.text, e.target) }, '全部复制')),
    x.notes?.length ? el('p', { class: 'hint' }, x.notes.join('；')) : '')));
}
function renderInfo() {
  const p = S.cur;
  $('#docs').replaceChildren(...p.docs.map(u => el('a', { href: u, target: '_blank' }, u.split('/').pop())), el('a', { href: `/${p.path}/index.html`, target: '_blank' }, '单独打开页面'));
  $('#shots').replaceChildren(...S.tl.shots.map(s => el('tr', { onclick: () => seek(s.t0) }, el('td', { class: 'n' }, `${fmt(s.t0)}`), el('td', {}, s.id), el('td', { class: 'n' }, `${(s.t1 - s.t0).toFixed(1)}s`))));
  $('#cues').replaceChildren(...S.tl.cues.map(c => el('tr', { onclick: () => seek(c.t0) }, el('td', { class: 'n' }, fmt(c.t0)), el('td', {}, c.text))));
}

// ———————— 目录、简报、任务 ————————
S.catalog = await api('/api/catalog');

function packsOf(line) { return S.catalog.stylePacks.filter(p => p.line === line); }
function packBy(line, id) { return packsOf(line).find(p => p.id === id || p.style === id) || null; }
function lineDefaults(line) {
  const d = S.catalog.lineDefaults[line];
  return { stylePack: d.stylePack, styleCustom: '', voice: d.voice, voiceRate: d.voiceRate, watermarkOn: !!d.watermark, watermark: d.watermark, aspect: d.aspect };
}
function ownerFor(stageId, line) {
  const stage = S.catalog.stages.find(s => s.id === stageId);
  if (!stage) return '';
  return typeof stage.owner === 'string' ? stage.owner : (stage.owner[line] || '');
}
function mountBrief(host, { radio, slot = [] } = {}) {
  host.replaceChildren($('#tplBrief').content.cloneNode(true));
  const root = host.querySelector('.brief-form');
  root.querySelectorAll('[data-brief=line] input').forEach(r => { r.name = radio; });
  const slotEl = root.querySelector('[data-brief=slot]');
  if (slot.length) slotEl.replaceWith(...slot); else slotEl.remove();
  const q = s => root.querySelector(s);
  const radios = () => [...root.querySelectorAll('[data-brief=line] input')];
  const styleSel = q('[data-brief=style]');
  const voiceSel = q('[data-brief=voice]');
  const rateSel = q('[data-brief=voiceRate]');
  const aspectSel = q('[data-brief=aspect]');
  const mem = {};
  let lineNow = '科普';
  const currentLine = () => radios().find(r => r.checked)?.value || '科普';
  voiceSel.replaceChildren(...S.catalog.voices.map(v => el('option', { value: v.id }, v.label)));
  aspectSel.replaceChildren(...S.catalog.aspects.map(a => el('option', { value: a.id }, a.label)));
  function fillRates(value) {
    const list = [...S.catalog.voiceRates];
    if (value && !list.includes(value)) list.push(value);
    rateSel.replaceChildren(...list.map(id => el('option', { value: id }, id)));
    rateSel.value = value && list.includes(value) ? value : list[0];
  }
  function fillStyles(line, value) {
    const list = packsOf(line);
    styleSel.replaceChildren(...list.map(p => el('option', { value: p.id }, p.label)));
    q('[data-brief=styleLabel]').textContent = line === '泡芙' ? '泡芙定版' : '视觉风格包';
    const pick = list.some(p => p.id === value) ? value : lineDefaults(line).stylePack;
    styleSel.value = pick;
  }
  function snapshot() {
    return {
      stylePack: styleSel.value,
      styleCustom: q('[data-brief=styleCustom]').value,
      voice: voiceSel.value,
      voiceRate: rateSel.value,
      watermarkOn: q('[data-brief=watermarkOn]').checked,
      watermark: q('[data-brief=watermark]').value,
      aspect: aspectSel.value,
    };
  }
  function applyCombo(state) {
    fillStyles(currentLine(), state.stylePack);
    fillRates(state.voiceRate);
    q('[data-brief=styleCustom]').value = state.styleCustom || '';
    if ([...voiceSel.options].some(o => o.value === state.voice)) voiceSel.value = state.voice;
    aspectSel.value = state.aspect || lineDefaults(currentLine()).aspect;
    q('[data-brief=watermarkOn]').checked = !!state.watermarkOn;
    q('[data-brief=watermark]').value = state.watermarkOn ? (state.watermark || '') : '';
  }
  function sync() {
    const line = currentLine(), pack = packBy(line, styleSel.value);
    q('[data-brief=customWrap]').hidden = pack?.id !== 'custom';
    q('[data-brief=durWrap]').hidden = q('[data-brief=duration]').value !== 'custom';
    q('[data-brief=styleHint]').textContent = pack?.hint || '';
    const on = q('[data-brief=watermarkOn]').checked;
    q('[data-brief=watermark]').disabled = !on;
    q('[data-brief=watermark]').placeholder = line === '泡芙' ? '不要填 Hobson 小党' : 'Hobson 小党';
    if (!on) q('[data-brief=watermark]').value = '';
  }
  function write(b) {
    const line = b?.line === '泡芙' ? '泡芙' : '科普';
    const d = lineDefaults(line);
    let stylePack = b?.stylePack || '';
    if (b && !stylePack && b.style) stylePack = packBy(line, b.style)?.id || (line === '科普' ? 'custom' : d.stylePack);
    if (!b || !stylePack) stylePack = d.stylePack;
    const state = b ? {
      stylePack,
      styleCustom: b.styleCustom || (stylePack === 'custom' ? (b.style && b.style !== '其他自定义' ? b.style : '') : ''),
      voice: b.voice || d.voice,
      voiceRate: b.voiceRate || d.voiceRate,
      watermarkOn: !!b.watermark,
      watermark: b.watermark || '',
      aspect: b.aspect || d.aspect,
    } : d;
    lineNow = line;
    mem[line] = state;
    radios().forEach(r => { r.checked = r.value === line; });
    applyCombo(state);
    q('[data-brief=topic]').value = b?.topic || '';
    const dur = b?.durationSec;
    if (dur == null || dur === '') { q('[data-brief=duration]').value = ''; q('[data-brief=durationCustom]').value = ''; }
    else if (['15', '30', '60', '120'].includes(String(dur))) { q('[data-brief=duration]').value = String(dur); q('[data-brief=durationCustom]').value = ''; }
    else { q('[data-brief=duration]').value = 'custom'; q('[data-brief=durationCustom]').value = String(dur); }
    q('[data-brief=audience]').value = b?.audience || '';
    const picked = new Set(b?.platforms || []);
    root.querySelectorAll('[data-brief=platforms] input').forEach(i => { i.checked = picked.has(i.value); });
    q('[data-brief=language]').value = b?.language || 'zh-CN';
    q('[data-brief=notes]').value = b?.notes || '';
    q('[data-brief=cta]').checked = b?.cta === true;
    sync();
  }
  function read() {
    const line = currentLine(), pack = packBy(line, styleSel.value), durSel = q('[data-brief=duration]').value;
    let durationSec = null;
    if (durSel === 'custom') {
      const raw = q('[data-brief=durationCustom]').value.trim();
      if (!raw) throw new Error('自定义时长要填秒数');
      durationSec = Number(raw);
      if (!Number.isInteger(durationSec)) throw new Error('时长要是整数秒');
    } else if (durSel) durationSec = Number(durSel);
    const brief = {
      line,
      style: pack?.style || '',
      stylePack: styleSel.value,
      voice: voiceSel.value,
      voiceRate: rateSel.value,
      watermark: q('[data-brief=watermarkOn]').checked ? q('[data-brief=watermark]').value.trim() : '',
      aspect: aspectSel.value,
      topic: q('[data-brief=topic]').value.trim(),
      durationSec,
      audience: q('[data-brief=audience]').value.trim(),
      platforms: [...root.querySelectorAll('[data-brief=platforms] input:checked')].map(i => i.value),
      language: q('[data-brief=language]').value.trim() || 'zh-CN',
      notes: q('[data-brief=notes]').value.trim(),
      cta: q('[data-brief=cta]').checked,
    };
    if (line === '泡芙') brief.puffPreset = brief.style;
    if (pack?.id === 'custom') brief.styleCustom = q('[data-brief=styleCustom]').value.trim();
    return brief;
  }
  radios().forEach(r => r.addEventListener('change', () => {
    if (!r.checked) return;
    mem[lineNow] = snapshot();
    lineNow = r.value;
    applyCombo(mem[lineNow] || lineDefaults(lineNow));
    sync();
  }));
  styleSel.addEventListener('change', sync);
  q('[data-brief=duration]').addEventListener('change', sync);
  q('[data-brief=watermarkOn]').addEventListener('change', sync);
  write(null);
  return { read, write, setDisabled: on => root.querySelectorAll('input, select, textarea').forEach(node => { node.disabled = on; }) };
}
const newBrief = mountBrief($('#newBrief'), { radio: 'newLine', slot: [$('#lblTemplate'), $('#lblName'), $('#newRules')] });
const filmBrief = mountBrief($('#briefHost'), { radio: 'filmLine' });
let briefToken = 0;
function paintCopyLine() {
  const node = $('#copyLine');
  const line = S.brief?.line || S.cur?.task?.line || '';
  const pack = S.catalog.copyTemplates[line];
  node.textContent = pack ? `${line}线：视频号用 ${pack['视频号'].id}（${pack['视频号'].owner}，${pack['视频号'].note}）X 用 ${pack.X.id}（${pack.X.owner}，${pack.X.note}）` : '';
}
async function loadBrief() {
  const token = ++briefToken, p = S.cur, err = $('#briefErr'), st = $('#briefStatus'), btn = $('#btnSaveBrief');
  err.textContent = '';
  if (!p || p.kind !== 'film') {
    S.brief = null; S.briefPath = ''; filmBrief.write(null); filmBrief.setDisabled(true); btn.disabled = true;
    st.textContent = '模板没有简报。新建影片时可以填，之后在影片的「简报」里改。';
    paintCopyLine(); return;
  }
  filmBrief.setDisabled(false); btn.disabled = false; st.textContent = '读取简报…';
  try {
    const r = await api('/api/brief?path=' + encodeURIComponent(p.path));
    if (token !== briefToken || S.cur?.path !== p.path) return;
    S.brief = r.brief; S.briefPath = p.path;
    filmBrief.write(r.brief);
    st.textContent = r.brief ? `已读取 ${p.path}/brief.json。保存只更新这个文件，不改画面。` : '还没有 brief.json。填好后保存，会写进这部片的文件夹。画面和台词不会被改掉。';
    paintCopyLine();
  } catch (e) {
    if (token !== briefToken || S.cur?.path !== p.path) return;
    S.brief = null; S.briefPath = ''; filmBrief.write(null); err.textContent = e.message;
    st.textContent = '这份 brief.json 读不出来。改完再保存会覆盖它。';
    paintCopyLine();
  }
}
$('#btnSaveBrief').onclick = async () => {
  const p = S.cur, btn = $('#btnSaveBrief');
  if (!p || p.kind !== 'film') return;
  $('#briefErr').textContent = ''; btn.disabled = true;
  try {
    const r = await api('/api/brief', { path: p.path, brief: filmBrief.read() });
    if (S.cur?.path === p.path) { S.brief = r.brief; S.briefPath = p.path; filmBrief.write(r.brief); $('#briefStatus').textContent = `已写入 ${p.path}/brief.json`; paintCopyLine(); }
    await loadProjects(); if (S.cur) renderInfo();
  } catch (e) { $('#briefErr').textContent = e.message; }
  finally { if (S.cur?.kind === 'film') btn.disabled = false; }
};

function taskLine() { return S.briefPath === S.cur?.path && S.brief?.line ? S.brief.line : (S.cur?.task?.line || ''); }
let taskKey = '';
function paintTask(task, force = false) {
  const host = $('#taskHost'), err = $('#taskErr'), st = $('#taskStatus'), btn = $('#btnSaveTask');
  const p = S.cur;
  if (!p || p.kind !== 'film' || !task) {
    taskKey = ''; host.replaceChildren(el('p', { class: 'hint' }, '选一部影片后，在这里改阶段、运营态和各平台发布态。'));
    btn.disabled = true; if (st) st.textContent = ''; return;
  }
  const key = [p.path, task.updatedAt || '', task.stage, task.ops, task.handoff, task.owner, task.saved ? '1' : '0', taskLine()].join('|');
  if (!force && key === taskKey && host.querySelector('select')) { btn.disabled = false; return; }
  taskKey = key; err.textContent = ''; btn.disabled = false;
  const line = taskLine();
  const stageSel = el('select', { 'data-task': 'stage' }, ...S.catalog.stages.map(s => el('option', { value: s.id }, s.id)));
  const ownerInput = el('input', { 'data-task': 'owner', type: 'text', maxlength: '40' });
  const lock = el('input', { 'data-task': 'ownerLocked', type: 'checkbox' });
  const opsSel = el('select', { 'data-task': 'ops' }, ...S.catalog.ops.map(id => el('option', { value: id }, id)));
  const handSel = el('select', { 'data-task': 'handoff' }, ...S.catalog.handoff.map(id => el('option', { value: id }, id)));
  const notes = el('textarea', { 'data-task': 'notes', maxlength: '2000', rows: '3', placeholder: '复盘备注。播放、曝光只贴你自己看到的数，没有就留空。' });
  stageSel.value = task.stage;
  ownerInput.value = task.owner || ownerFor(task.stage, line);
  lock.checked = !!task.ownerLocked;
  opsSel.value = task.ops;
  handSel.value = task.handoff;
  notes.value = task.notes || '';
  const pubs = S.catalog.platforms.map(pl => {
    const cell = task.publish?.[pl.id] || { status: '草稿', notes: '' };
    const status = el('select', { 'data-pub': pl.id }, ...S.catalog.publishStatus.map(id => el('option', { value: id }, id)));
    const note = el('input', { 'data-pub-note': pl.id, type: 'text', maxlength: '200', placeholder: '播放/曝光备注，仅自贴' });
    status.value = S.catalog.publishStatus.includes(cell.status) ? cell.status : '草稿';
    note.value = cell.notes || '';
    const who = [pl.copyOwner ? `文案 ${pl.copyOwner}` : '', `发布 ${pl.publishOwner}`].filter(Boolean).join(' · ');
    return el('div', { class: 'pub-row' },
      el('span', {}, pl.id), status,
      el('p', { class: 'hint who' }, who),
      note);
  });
  const form = el('div', { class: 'brief-form task-form' },
    el('label', { class: 'field' }, '阶段', stageSel),
    el('label', { class: 'field' }, '责任人（随阶段默认，可手改）', ownerInput),
    el('label', { class: 'chk' }, lock, '锁定责任人，换阶段时不覆盖'),
    el('p', { class: 'hint', 'data-task': 'ownerHint' }, ''),
    el('label', { class: 'field' }, '运营态（自媒体运营，不代发）', opsSel),
    el('p', { class: 'hint' }, '交审、P0过、改点中归运营。改点中可以回到制作，或再交审。泡芙选题建议先给运营过一眼，再进制作。'),
    el('label', { class: 'field' }, '拷发（只由用户更新）', handSel),
    el('div', { class: 'field' }, el('span', { class: 'lbl' }, '各平台发布态'), el('div', { class: 'pub' }, ...pubs)),
    el('p', { class: 'hint' }, '视频号 / 抖音 / X / 小红书都是草稿、文案已交、已发、待复盘。没有人代发，也不会去登录平台。'),
    el('label', { class: 'field' }, '任务备注', notes));
  host.replaceChildren(form);
  const hint = q => host.querySelector(q);
  function refreshOwnerHint() {
    const suggest = ownerFor(stageSel.value, line);
    hint('[data-task=ownerHint]').textContent = suggest ? `这一阶段默认责任人：${suggest}` : '还没分线路，选题的责任人等简报选定科普或泡芙后再定。';
  }
  stageSel.addEventListener('change', () => {
    const ops = S.catalog.stages.find(s => s.id === stageSel.value)?.ops;
    if (ops) opsSel.value = ops;
    if (!lock.checked) ownerInput.value = ownerFor(stageSel.value, line);
    refreshOwnerHint();
  });
  ownerInput.addEventListener('input', () => { lock.checked = true; });
  refreshOwnerHint();
  st.textContent = task.saved ? `已读取 ${p.path}/status.json。` : '还没写入 status.json。改完点保存，只会写这个文件。';
}
function readTask() {
  const host = $('#taskHost');
  const q = s => host.querySelector(s);
  const publish = {};
  for (const pl of S.catalog.platforms) {
    publish[pl.id] = { status: q(`[data-pub="${pl.id}"]`).value, notes: q(`[data-pub-note="${pl.id}"]`).value.trim() };
  }
  return {
    stage: q('[data-task=stage]').value,
    owner: q('[data-task=owner]').value.trim(),
    ownerLocked: q('[data-task=ownerLocked]').checked,
    ops: q('[data-task=ops]').value,
    handoff: q('[data-task=handoff]').value,
    notes: q('[data-task=notes]').value.trim(),
    publish,
  };
}
$('#btnSaveTask').onclick = async () => {
  const p = S.cur, btn = $('#btnSaveTask');
  if (!p || p.kind !== 'film') return;
  $('#taskErr').textContent = ''; btn.disabled = true;
  try {
    const r = await api('/api/tasks', { path: p.path, task: readTask() });
    if (S.cur?.path === p.path) {
      S.cur.task = { ...S.cur.task, ...r.task };
      paintTask(S.cur.task, true);
      $('#taskStatus').textContent = `已写入 ${p.path}/status.json`;
    }
    await loadProjects();
  } catch (e) { $('#taskErr').textContent = e.message; }
  finally { if (S.cur?.kind === 'film') btn.disabled = false; }
};

function renderBoard() {
  if (!S.catalog || !$('#boardBody')) return;
  const stages = S.catalog.stages;
  $('#laneLegend').replaceChildren(...stages.map(s => {
    const owner = typeof s.owner === 'string' ? s.owner : `科普 ${s.owner['科普']} · 泡芙 ${s.owner['泡芙']}`;
    return el('div', { class: 'lane' }, el('b', {}, s.id), el('span', {}, owner));
  }));
  const films = S.projects.filter(p => p.kind === 'film' && p.task && (!S.lineFilter || p.task.line === S.lineFilter));
  if (!films.length) {
    $('#boardBody').replaceChildren(el('p', { class: 'hint' }, S.lineFilter ? `「${S.lineFilter}」下面还没有任务。` : '还没有任务。点「新建影片」，线路选科普或泡芙。'));
    return;
  }
  const order = S.lineFilter ? [S.lineFilter] : ['科普', '泡芙', ''];
  const groups = order.map(line => ({ line, rows: films.filter(p => (p.task.line || '') === line) })).filter(g => g.rows.length);
  const card = p => {
    const t = p.task, at = stages.findIndex(s => s.id === t.stage);
    return el('article', {
      class: 'task-card' + (S.cur?.path === p.path ? ' on' : ''),
      onclick: () => { select(p.path); tab('task'); },
    },
    el('div', { class: 'task-top' },
      el('span', { class: 'tag ' + (t.line === '科普' ? 'kepu' : t.line === '泡芙' ? 'puff' : '') }, t.line || '未分线'),
      el('b', {}, p.title),
      el('span', { class: 'path' }, `${t.owner || '未指定'} · ${p.path}`)),
    el('div', { class: 'rail' },
      ...stages.map((s, n) => el('i', { class: n < at ? 'done' : n === at ? 'now' : '', title: `${s.id} · ${typeof s.owner === 'string' ? s.owner : (s.owner[t.line] || '')}` })),
      el('span', { class: 'now-label' }, `${t.stage} · ${t.ops}`)),
    el('div', { class: 'pills' },
      el('span', { class: 'pill' }, t.handoff),
      ...S.catalog.platforms.map(pl => {
        const status = t.publish?.[pl.id]?.status || '草稿';
        const cls = status === '已发' ? 'hot' : (status === '文案已交' || status === '待复盘' ? 'wait' : '');
        return el('span', { class: 'pill ' + cls }, `${pl.id} ${status}`);
      })));
  };
  $('#boardBody').replaceChildren(...groups.map(g => el('section', { class: 'board-group' },
    el('h3', {}, g.line || '未分线', el('em', {}, `${g.rows.length} 条`)),
    ...g.rows.map(card))));
}
function setView(mode) {
  S.view = mode;
  document.body.dataset.view = mode;
  $('#board').hidden = mode !== 'board';
  const btn = $('#btnBoard');
  btn.textContent = mode === 'board' ? '返回预览' : '任务看板';
  btn.classList.toggle('primary', mode === 'board');
  if (mode === 'board') renderBoard();
  else { fit(); drawTimeline(); }
}
function setLineFilter(line) {
  S.lineFilter = line;
  document.querySelectorAll('#lineFilters button').forEach(b => b.classList.toggle('on', b.dataset.line === line));
  const films = S.projects.filter(p => p.kind === 'film' && (!line || p.task?.line === line));
  const temps = S.projects.filter(p => p.kind === 'template');
  const sub = p => p.task ? [p.task.line || '未分线', p.task.stage, p.task.owner].filter(Boolean).join(' · ') : '';
  const item = p => el('li', { class: S.cur?.path === p.path ? 'on' : '', 'data-path': p.path, onclick: () => select(p.path) },
    el('div', { class: 'thumb', style: p.poster ? `background-image:url("${p.poster}?${p.updated}")` : '' }, p.poster ? '' : (p.filmKind === 'footage' ? '素材' : 'render(t)')),
    el('div', { class: 'meta' }, p.film ? el('span', { class: 'badge' }, '已出片') : (p.filmKind === 'footage' ? el('span', { class: 'badge' }, '素材') : ''), el('b', {}, p.title), el('span', { class: 'sub' }, sub(p) || p.path)));
  $('#listFilms').replaceChildren(...films.map(item));
  $('#emptyFilms').style.display = films.length ? 'none' : '';
  $('#listTemplates').replaceChildren(...temps.map(item));
  renderBoard();
}
document.querySelectorAll('#lineFilters button').forEach(b => b.onclick = () => setLineFilter(b.dataset.line));
$('#btnBoard').onclick = () => setView(S.view === 'board' ? 'preview' : 'board');

// ———————— 新建 ————————
$('#btnNew').onclick = () => { $('#newErr').textContent = ''; newBrief.write(null); $('#newName').value = ''; $('#dlgNew').showModal(); $('#newBrief [data-brief=topic]').focus(); };
$('#btnNewCancel').onclick = () => $('#dlgNew').close();
$('#formNew').addEventListener('submit', async e => {
  if (e.submitter?.value !== 'default') { $('#dlgNew').close(); return; }
  e.preventDefault();
  try {
    const r = await api('/api/new', { template: $('#newTemplate').value, name: $('#newName').value.trim(), brief: newBrief.read(), cta: $('#newCta').checked });
    $('#dlgNew').close(); await loadProjects(); await select(r.path); tab('brief'); setView('preview');
  } catch (err) { $('#newErr').textContent = err.message; }
});

// ———————— 控件与快捷键 ————————
$('#btnPlay').onclick = () => S.playing ? pause() : play();
$('#btnPrev').onclick = () => step(-1); $('#btnNext').onclick = () => step(1);
$('#btnReload').onclick = () => { if (!S.cur) return; if (document.body.dataset.kind === 'footage') loadFootage(); else loadFrame(); };
$('#selFps').onchange = () => draw(S.t, true);
$('#chkAudio').onchange = () => { if (S.playing) { pause(); play(); } };
addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea, dialog')) return;
  if (e.code === 'Space') { e.preventDefault(); S.playing ? pause() : play(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); e.shiftKey ? seek(S.t - 1) : step(-1); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); e.shiftKey ? seek(S.t + 1) : step(1); }
  else if (e.key === 'Home') seek(0); else if (e.key === 'End') seek(S.dur);
});
new ResizeObserver(() => { fit(); drawTimeline(); }).observe($('#stage'));
new ResizeObserver(drawTimeline).observe(tl);

setView('board');
await loadProjects();
const want = decodeURIComponent(location.hash.slice(1));
const first = S.projects.find(p => p.path === want) || S.projects.find(p => p.kind === 'film') || S.projects[0];
if (first) select(first.path).catch(err => status(err.message || String(err), true));
setView('board');
fit();
