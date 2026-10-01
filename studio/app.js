// 视频工作台前端：预览 iframe 里的 render(t)，时间轴、任务、成片
const $ = s => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) k === 'class' ? e.className = v : k.startsWith('on') ? e.addEventListener(k.slice(2), v) : e.setAttribute(k, v); e.append(...kids); return e; };
const fmt = t => { t = Math.max(0, t); const m = Math.floor(t / 60), s = t - m * 60; return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`; };
const api = async (u, body) => { const r = await fetch(u, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.statusText); return j; };

const S = { projects: [], cur: null, fw: null, dur: 0, t: 0, playing: false, clock0: 0, t0: 0, lastFrame: -1, tl: { shots: [], cues: [], ev: [] }, job: null, es: null, watch: null };
const view = $('#view'), audio = $('#mix'), tl = $('#tl');

// ———————— 项目列表 ————————
async function loadProjects() {
  S.projects = await api('/api/projects');
  const films = S.projects.filter(p => p.kind === 'film'), temps = S.projects.filter(p => p.kind === 'template');
  const item = p => el('li', { class: S.cur?.path === p.path ? 'on' : '', 'data-path': p.path, onclick: () => select(p.path) },
    el('div', { class: 'thumb', style: p.poster ? `background-image:url("${p.poster}?${p.updated}")` : '' }, p.poster ? '' : 'render(t)'),
    el('div', { class: 'meta' }, p.film ? el('span', { class: 'badge' }, '已出片') : '', el('b', {}, p.title), el('span', {}, p.path)));
  $('#listFilms').replaceChildren(...films.map(item)); $('#emptyFilms').style.display = films.length ? 'none' : '';
  $('#listTemplates').replaceChildren(...temps.map(item));
  $('#newTemplate').replaceChildren(...temps.map(p => el('option', { value: p.name }, `${p.title}（${p.name}）`)));
  if (S.cur) { S.cur = S.projects.find(p => p.path === S.cur.path) || S.cur; renderOutputs(); mixState(); }
}

async function select(path, keepT = false) {
  const p = S.projects.find(x => x.path === path); if (!p) return;
  const same = S.cur?.path === path;
  S.cur = p; location.hash = path;
  document.querySelectorAll('.plist li').forEach(li => li.classList.toggle('on', li.dataset.path === path));
  $('#nowTitle').innerHTML = ''; $('#nowTitle').append(el('b', {}, p.title), `  ·  ${p.path}`);
  if (!same || !keepT) S.t = 0;
  pause(); await loadFrame();
  audio.src = p.mix ? `${p.mix}?${p.mixTime}` : ''; mixState();
  renderOutputs(); attachRunningJob();
  if (!same) { watchProject(); loadBrief(); }
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
      loadProjects().then(() => { if (S.cur?.mix) { audio.src = `${S.cur.mix}?${S.cur.mixTime}`; } if (d.end === 'done' && ['still', 'sheet'].includes(j.task)) tab('output'); });
      if (j.args?.steps?.some?.(s => ['events', 'voice'].includes(s)) || j.task === 'build') loadFrame();
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
  es.onmessage = () => { clearTimeout(timer); timer = setTimeout(async () => { const was = S.playing; pause(); await loadFrame(); mixState(); if (was) play(); }, 250); };
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
function renderOutputs() {
  const p = S.cur, v = $('#film');
  if (p.film) { const src = `${p.film}?${p.mixTime}`; if (!v.src.endsWith(src)) v.src = src; v.classList.add('show'); $('#filmNone').style.display = 'none'; }
  else { v.removeAttribute('src'); v.load(); v.classList.remove('show'); $('#filmNone').style.display = ''; }
  const links = [[p.film, '下载 mp4'], [p.srt, '字幕 .srt'], [p.mix, '混音 .wav'], [p.poster, '海报']].filter(([u]) => u);
  $('#filmLinks').replaceChildren(...links.map(([u, t]) => el('a', { href: u, target: '_blank', download: '' }, t)));
  $('#stills').replaceChildren(...(p.stills.length ? p.stills.map(u => el('a', { href: u, target: '_blank' }, el('img', { src: u + '?' + Date.now(), loading: 'lazy' }), el('span', {}, u.split('/').pop())))
    : [el('p', { class: 'hint' }, '还没有静帧。在「渲染」里点「渲当前静帧」或「联系表」。')]));
}
function renderInfo() {
  const p = S.cur;
  $('#docs').replaceChildren(...p.docs.map(u => el('a', { href: u, target: '_blank' }, u.split('/').pop())), el('a', { href: `/${p.path}/index.html`, target: '_blank' }, '单独打开页面'));
  $('#shots').replaceChildren(...S.tl.shots.map(s => el('tr', { onclick: () => seek(s.t0) }, el('td', { class: 'n' }, `${fmt(s.t0)}`), el('td', {}, s.id), el('td', { class: 'n' }, `${(s.t1 - s.t0).toFixed(1)}s`))));
  $('#cues').replaceChildren(...S.tl.cues.map(c => el('tr', { onclick: () => seek(c.t0) }, el('td', { class: 'n' }, fmt(c.t0)), el('td', {}, c.text))));
}

// ———————— 简报 ————————
const SCIENCE_STYLES = ['信息卡+字幕', '动画讲解', '纪录片旁白', '其他自定义'];
const PUFF_PRESETS = ['定版日常', '出行墨镜'];
const STYLE_HINTS = {
  '信息卡+字幕': '信息卡适合按台词排的模板（deck / lines）。可以用 keynote，或从 blank 另起。不会改你选的模板。',
  '动画讲解': '动画讲解优先 keynote；有 qa 模板时也合适。不会改你选的模板。',
  '纪录片旁白': '纪录片旁白可以从 keynote 改，或用 blank 另起风格。不会改你选的模板。',
  '其他自定义': '自定义风格不会自动换模板。画面和台词仍改 film.js、lines.json。',
  '定版日常': '泡芙定版日常：比熊角色锁定。不要用实拍照片轮播冒充动画。不会改你选的模板。',
  '出行墨镜': '泡芙出行墨镜：比熊角色锁定。不要用实拍照片轮播冒充动画。不会改你选的模板。',
};
function mountBrief(host, { radio, slot = [] } = {}) {
  host.replaceChildren($('#tplBrief').content.cloneNode(true));
  const root = host.querySelector('.brief-form');
  root.querySelectorAll('[data-brief=line] input').forEach(r => { r.name = radio; });
  const slotEl = root.querySelector('[data-brief=slot]');
  if (slot.length) slotEl.replaceWith(...slot); else slotEl.remove();
  const q = s => root.querySelector(s);
  const radios = () => [...root.querySelectorAll('[data-brief=line] input')];
  const styleSel = q('[data-brief=style]');
  const mem = { '科普': '动画讲解', '泡芙': '定版日常' };
  let lineNow = '科普';
  const currentLine = () => radios().find(r => r.checked)?.value || '科普';
  function fillStyles(line, value) {
    const list = line === '泡芙' ? PUFF_PRESETS : SCIENCE_STYLES;
    styleSel.replaceChildren(...list.map(id => el('option', { value: id }, id)));
    q('[data-brief=styleLabel]').textContent = line === '泡芙' ? '定版' : '风格';
    styleSel.value = list.includes(value) ? value : (line === '泡芙' ? '定版日常' : '动画讲解');
  }
  function sync() {
    const line = currentLine(), style = styleSel.value;
    q('[data-brief=customWrap]').hidden = !(line === '科普' && style === '其他自定义');
    q('[data-brief=durWrap]').hidden = q('[data-brief=duration]').value !== 'custom';
    q('[data-brief=styleHint]').textContent = STYLE_HINTS[style] || '';
  }
  function write(b) {
    const line = b?.line === '泡芙' ? '泡芙' : '科普';
    let style = (line === '泡芙' ? (b?.puffPreset || b?.style) : b?.style) || (line === '泡芙' ? '定版日常' : '动画讲解');
    let styleCustom = b?.styleCustom || '';
    if (line === '科普' && style && !SCIENCE_STYLES.includes(style)) { styleCustom = styleCustom || style; style = '其他自定义'; }
    if (line === '泡芙' && !PUFF_PRESETS.includes(style)) style = '定版日常';
    lineNow = line; mem[line] = style;
    radios().forEach(r => { r.checked = r.value === line; });
    fillStyles(line, style);
    q('[data-brief=styleCustom]').value = styleCustom;
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
    const line = currentLine(), style = styleSel.value, durSel = q('[data-brief=duration]').value;
    let durationSec = null;
    if (durSel === 'custom') {
      const raw = q('[data-brief=durationCustom]').value.trim();
      if (!raw) throw new Error('自定义时长要填秒数');
      durationSec = Number(raw);
      if (!Number.isInteger(durationSec)) throw new Error('时长要是整数秒');
    } else if (durSel) durationSec = Number(durSel);
    const brief = {
      line, style,
      topic: q('[data-brief=topic]').value.trim(),
      durationSec,
      audience: q('[data-brief=audience]').value.trim(),
      platforms: [...root.querySelectorAll('[data-brief=platforms] input:checked')].map(i => i.value),
      language: q('[data-brief=language]').value.trim() || 'zh-CN',
      notes: q('[data-brief=notes]').value.trim(),
      cta: q('[data-brief=cta]').checked,
    };
    if (line === '泡芙') brief.puffPreset = style;
    if (line === '科普' && style === '其他自定义') brief.styleCustom = q('[data-brief=styleCustom]').value.trim();
    return brief;
  }
  radios().forEach(r => r.addEventListener('change', () => {
    if (!r.checked) return;
    mem[lineNow] = styleSel.value; lineNow = r.value;
    fillStyles(lineNow, mem[lineNow]); sync();
  }));
  styleSel.addEventListener('change', sync);
  q('[data-brief=duration]').addEventListener('change', sync);
  write(null);
  return { read, write, setDisabled: on => root.querySelectorAll('input, select, textarea').forEach(el => { el.disabled = on; }) };
}
const newBrief = mountBrief($('#newBrief'), { radio: 'newLine', slot: [$('#lblTemplate'), $('#lblName'), $('#newRules')] });
const filmBrief = mountBrief($('#briefHost'), { radio: 'filmLine' });
let briefToken = 0;
async function loadBrief() {
  const token = ++briefToken, p = S.cur, err = $('#briefErr'), st = $('#briefStatus'), btn = $('#btnSaveBrief');
  err.textContent = '';
  if (!p || p.kind !== 'film') {
    filmBrief.write(null); filmBrief.setDisabled(true); btn.disabled = true;
    st.textContent = '模板没有简报。新建影片时可以填，之后在影片的「简报」里改。';
    return;
  }
  filmBrief.setDisabled(false); btn.disabled = false; st.textContent = '读取简报…';
  try {
    const r = await api('/api/brief?path=' + encodeURIComponent(p.path));
    if (token !== briefToken || S.cur?.path !== p.path) return;
    filmBrief.write(r.brief);
    st.textContent = r.brief ? `已读取 ${p.path}/brief.json。保存只更新这个文件。` : '还没有 brief.json。填好后保存，会写进这部片的文件夹。画面和台词不会被改掉。';
  } catch (e) {
    if (token !== briefToken || S.cur?.path !== p.path) return;
    filmBrief.write(null); err.textContent = e.message;
    st.textContent = '这份 brief.json 读不出来。改完再保存会覆盖它。';
  }
}
$('#btnSaveBrief').onclick = async () => {
  const p = S.cur, btn = $('#btnSaveBrief');
  if (!p || p.kind !== 'film') return;
  $('#briefErr').textContent = ''; btn.disabled = true;
  try {
    const r = await api('/api/brief', { path: p.path, brief: filmBrief.read() });
    if (S.cur?.path === p.path) { filmBrief.write(r.brief); $('#briefStatus').textContent = `已写入 ${p.path}/brief.json`; }
    await loadProjects(); if (S.cur) renderInfo();
  } catch (e) { $('#briefErr').textContent = e.message; }
  finally { if (S.cur?.kind === 'film') btn.disabled = false; }
};

// ———————— 新建 ————————
$('#btnNew').onclick = () => { $('#newErr').textContent = ''; newBrief.write(null); $('#newName').value = ''; $('#dlgNew').showModal(); $('#newBrief [data-brief=topic]').focus(); };
$('#btnNewCancel').onclick = () => $('#dlgNew').close();
$('#formNew').addEventListener('submit', async e => {
  if (e.submitter?.value !== 'default') return;
  e.preventDefault();
  try {
    const r = await api('/api/new', { template: $('#newTemplate').value, name: $('#newName').value.trim(), brief: newBrief.read() });
    $('#dlgNew').close(); await loadProjects(); await select(r.path); tab('brief');
  } catch (err) { $('#newErr').textContent = err.message; }
});

// ———————— 控件与快捷键 ————————
$('#btnPlay').onclick = () => S.playing ? pause() : play();
$('#btnPrev').onclick = () => step(-1); $('#btnNext').onclick = () => step(1);
$('#btnReload').onclick = () => S.cur && loadFrame();
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

await loadProjects();
const want = decodeURIComponent(location.hash.slice(1));
const first = S.projects.find(p => p.path === want) || S.projects.find(p => p.kind === 'film') || S.projects[0];
if (first) select(first.path);
fit();
