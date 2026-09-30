// 按 timeline.json 切、叠化、混旁白、响度，出横屏成片（默认 1920×1080，尺寸来自 film.json）。
// 竖屏以后改 film.json 的 width/height 即可走同一条 scale+pad；安全区和字幕位置还没单独做。
import fs from 'fs';
import path from 'path';
import { ROOT, ffmpeg, ffprobe, inside, pythonBin, readJSON, round, run, writeJSON } from './lib.mjs';
import { chainClock, fadeOf, validateTimeline, xfadeOffsets } from './timeline.mjs';

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

function videoFilter(durations, fades) {
  const n = durations.length;
  if (n === 1) {
    const fo = Math.max(0, durations[0] - 0.45);
    return `[0:v]fade=t=in:st=0:d=0.35,fade=t=out:st=${fo.toFixed(3)}:d=0.4,format=yuv420p[v]`;
  }
  const offsets = xfadeOffsets(durations, fades);
  let last = '0:v';
  const parts = [];
  for (let i = 1; i < n; i++) {
    const label = i === n - 1 ? 'vx' : `vx${i}`;
    parts.push(`[${last}][${i}:v]xfade=transition=fade:duration=${fades[i].toFixed(3)}:offset=${offsets[i - 1].toFixed(3)}[${label}]`);
    last = label;
  }
  const total = chainClock(durations, fades).dur;
  const fo = Math.max(0, total - 0.45);
  parts.push(`[${last}]fade=t=in:st=0:d=0.30,fade=t=out:st=${fo.toFixed(3)}:d=0.40,format=yuv420p[v]`);
  return parts.join(';');
}

function bedFilter(fades) {
  const n = fades.length;
  if (n === 1) return '[0:a]anull[bed]';
  let last = '0:a';
  const parts = [];
  for (let i = 1; i < n; i++) {
    const label = i === n - 1 ? 'bed' : `ax${i}`;
    parts.push(`[${last}][${i}:a]acrossfade=d=${fades[i].toFixed(3)}:c1=tri:c2=tri[${label}]`);
    last = label;
  }
  return parts.join(';');
}

function between(t0, t1) {
  return `between(t\\,${Math.max(0, t0).toFixed(3)}\\,${Math.max(t0, t1).toFixed(3)})`;
}

async function fileInfo(abs, cache) {
  if (cache.has(abs)) return cache.get(abs);
  const j = await ffprobe(abs);
  const info = { dur: +j.format?.duration || 0, hasAudio: (j.streams || []).some(s => s.codec_type === 'audio') };
  cache.set(abs, info);
  return info;
}

async function renderSegment(abs, seg, cfg, mp4, wav, hasAudio) {
  const frames = Math.max(2, Math.round((seg.out - seg.in) * cfg.fps));
  const durOut = frames / cfg.fps;
  const ss = seg.in.toFixed(3), t = durOut.toFixed(3);
  // -ss / -t 放在 -i 前面。放在后面时，滤镜会把时间戳归零，输出端再 seek 会把声音切成空文件，acrossfade 会卡住。
  const vf = [
    `scale=${cfg.width}:${cfg.height}:force_original_aspect_ratio=decrease:flags=lanczos`,
    `pad=${cfg.width}:${cfg.height}:(ow-iw)/2:(oh-ih)/2:black`,
    `fps=${cfg.fps}`, 'format=yuv420p', 'settb=AVTB', 'setpts=PTS-STARTPTS',
  ].join(',');
  await ffmpeg(['-loglevel', 'error', '-y', '-ss', ss, '-t', t, '-i', abs, '-an', '-vf', vf, '-frames:v', String(frames), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(cfg.fps), mp4]);
  const af = `aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=0:${t}`;
  const silence = () => ffmpeg(['-loglevel', 'error', '-y', '-f', 'lavfi', '-t', t, '-i', 'anullsrc=r=48000:cl=stereo', '-af', af, wav]);
  if (hasAudio) await ffmpeg(['-loglevel', 'error', '-y', '-ss', ss, '-t', t, '-i', abs, '-vn', '-af', af, wav]);
  else await silence();
  const vj = await ffprobe(mp4);
  let vdur = +vj.format.duration;
  const aj = await ffprobe(wav);
  const adur = +aj.format?.duration;
  if (!(adur > 0.05)) await silence();
  else if (Math.abs(adur - vdur) > 0.04) {
    const tmp = wav + '.fix.wav';
    await ffmpeg(['-loglevel', 'error', '-y', '-i', wav, '-af', `apad,atrim=0:${vdur.toFixed(3)}`, tmp]);
    fs.renameSync(tmp, wav);
  }
  if (!(vdur > 0.1)) throw new Error(`片段 ${seg.id || seg.src} 切出来是空的`);
  return vdur;
}

export async function assemble(film, cfg) {
  const timeline = readJSON(path.join(film, 'edit/timeline.json'));
  if (!timeline) throw new Error('还没有 edit/timeline.json，先跑 timeline');
  validateTimeline(timeline, film);
  const transition = timeline.transition || cfg.transition;
  const work = path.join(film, 'edit/work');
  fs.mkdirSync(work, { recursive: true });
  for (const f of fs.readdirSync(work)) if (/^(seg-|bed|video)/.test(f)) fs.rmSync(path.join(work, f), { force: true });

  const cache = new Map();
  const built = [];
  for (let i = 0; i < timeline.segments.length; i++) {
    const seg = timeline.segments[i];
    const abs = inside(film, seg.src);
    const info = await fileInfo(abs, cache);
    const inn = +seg.in, out = +seg.out;
    if (out > info.dur + 0.08) throw new Error(`片段 ${seg.id || i + 1} 的 out ${out} 超过素材时长 ${info.dur.toFixed(2)}（${seg.src}）`);
    const mp4 = path.join(work, `seg-${String(i + 1).padStart(2, '0')}.mp4`);
    const wav = path.join(work, `seg-${String(i + 1).padStart(2, '0')}.wav`);
    const vdur = await renderSegment(abs, { ...seg, in: inn, out: Math.min(out, info.dur) }, cfg, mp4, wav, info.hasAudio);
    built.push({ ...seg, in: inn, out, vdur, mp4, wav });
    console.log(`片段 ${seg.id || i + 1}  ${vdur.toFixed(2)}s  ${seg.role || ''}  ← ${seg.src} ${inn.toFixed(2)}–${out.toFixed(2)}`);
  }

  const fades = built.map((seg, i) => fadeOf(i ? built[i - 1] : null, seg, { transition }));
  const durs = built.map(s => s.vdur);
  const clock = chainClock(durs, fades);
  built.forEach((s, i) => { s.t0 = clock.rows[i].t0; s.t1 = clock.rows[i].t1; s.fade = clock.rows[i].fade; });
  console.log(`叠化后约 ${clock.dur.toFixed(2)}s（${built.length} 段）`);

  const video = path.join(work, 'video.mp4');
  const vArgs = ['-loglevel', 'error', '-y'];
  for (const s of built) vArgs.push('-i', s.mp4);
  vArgs.push('-filter_complex', videoFilter(durs, fades), '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(cfg.fps), video);
  await ffmpeg(vArgs);

  const bed = path.join(work, 'bed.wav');
  const aArgs = ['-loglevel', 'error', '-y'];
  for (const s of built) aArgs.push('-i', s.wav);
  aArgs.push('-filter_complex', bedFilter(fades), '-map', '[bed]', bed);
  await ffmpeg(aArgs);

  const cues = await placeVoice(film, built, clock.dur);
  const mix = path.join(film, 'out/mix.wav');
  fs.mkdirSync(path.dirname(mix), { recursive: true });
  await mixVoice(bed, cues, clock.dur, mix);

  const name = path.basename(film);
  const events = {
    dur: round(clock.dur),
    poster: round(Math.min(clock.dur * 0.22, Math.max(0, clock.dur - 0.5))),
    cues: cues.map(c => ({ t0: c.t0, t1: c.t1, text: c.text })),
    ev: cues.map(c => ({ t: c.t0, type: 'voice', id: c.id, d: round(c.voiced) })),
    shots: built.map(s => ({ id: s.id, t0: s.t0, t1: s.t1 })),
  };
  writeJSON(path.join(film, 'events.json'), events);
  await run(pythonBin(), [path.join(ROOT, 'core/render/srt.py'), path.join(film, 'events.json'), path.join(film, 'out', `${name}.srt`)]);

  const final = path.join(film, 'out', `${name}.mp4`);
  await run('sh', [path.join(ROOT, 'core/render/mux.sh'), video, mix, final, String(cfg.fps), '0']);

  const probed = await ffprobe(final);
  const v = (probed.streams || []).find(s => s.codec_type === 'video');
  const a = (probed.streams || []).find(s => s.codec_type === 'audio');
  if (!v || !a) throw new Error('成片缺少画面或声音');
  if (v.width !== cfg.width || v.height !== cfg.height) throw new Error(`成片是 ${v.width}×${v.height}，film.json 要的是 ${cfg.width}×${cfg.height}`);
  events.dur = round(+probed.format.duration || clock.dur);
  writeJSON(path.join(film, 'events.json'), events);

  const posterT = Math.min(Math.max(0.4, events.dur * 0.22), Math.max(0.2, events.dur - 0.3));
  const poster = path.join(film, 'out/poster.jpg');
  await ffmpeg(['-loglevel', 'error', '-y', '-ss', posterT.toFixed(3), '-i', final, '-frames:v', '1', '-q:v', '3', poster]);
  fs.copyFileSync(poster, path.join(film, 'poster.jpg'));

  const assembly = {
    version: 1, generated: new Date().toISOString(), dur: events.dur,
    output: `out/${name}.mp4`, width: v.width, height: v.height, fps: cfg.fps,
    segments: built.map(s => ({ id: s.id, shot: s.shot, role: s.role, src: s.src, in: s.in, out: s.out, t0: s.t0, t1: s.t1, fade: s.fade })),
    cues: events.cues,
  };
  writeJSON(path.join(film, 'edit/assembly.json'), assembly);
  console.log(`out/${name}.mp4  ${events.dur.toFixed(2)}s  ${v.width}×${v.height}`);
  console.log(`out/${name}.srt  ${events.cues.length} 条字幕 · out/poster.jpg · out/mix.wav`);
  return assembly;
}

async function placeVoice(film, built, dur) {
  const lines = readJSON(path.join(film, 'lines.json'));
  const durs = readJSON(path.join(film, 'voices/dur.json')) || {};
  if (!lines?.lines?.length) { console.log('没有 lines.json，成片只有素材原声'); return []; }
  const cues = [];
  for (const ln of lines.lines) {
    if (!ln || !ID_RE.test(ln.id || '')) { console.log('跳过非法台词 id', ln && ln.id); continue; }
    const seg = (ln.segment && built.find(s => s.id === ln.segment)) || built.find(s => s.vo && s.vo === ln.id);
    if (!seg) { console.log('台词没有对上片段', ln.id); continue; }
    const wav = path.join(film, 'voices', `${ln.id}.wav`);
    if (!fs.existsSync(wav)) { console.log('没有配音文件，跳过', ln.id); continue; }
    let voiced = +durs[ln.id];
    if (!(voiced > 0)) voiced = +((await ffprobe(wav)).format?.duration || 0);
    const at = Number.isFinite(+ln.at) ? Math.max(0, +ln.at) : 0.28;
    const t0 = seg.t0 + at;
    if (t0 >= dur - 0.1) { console.log('台词落在成片外面，跳过', ln.id); continue; }
    const next = built.find(s => s.t0 > seg.t0 + 0.05);
    const slotEnd = (next ? next.t0 : dur) - 0.05;
    const t1 = Math.min(t0 + voiced, Math.max(t0 + 0.3, slotEnd));
    cues.push({ id: ln.id, t0: round(t0), t1: round(t1), text: String(ln.text), wav, voiced });
  }
  if (!cues.length) console.log('没有放进成片的旁白（缺 wav 或没对上片段）');
  return cues;
}

async function mixVoice(bed, cues, dur, mix) {
  const fadeOut = Math.max(0, dur - 0.4);
  // 极轻底噪，避免素材完全没声时 loudnorm 算不出响度
  const noise = `anoisesrc=color=white:sample_rate=48000:amplitude=0.0008:duration=${Math.max(0.5, dur).toFixed(3)}[nz]`;
  const tail = `afade=t=in:st=0:d=0.2,afade=t=out:st=${fadeOut.toFixed(3)}:d=0.35[a]`;
  if (!cues.length) {
    const fc = `${noise};[0:a]volume=0.5,afade=t=in:st=0:d=0.25,afade=t=out:st=${fadeOut.toFixed(3)}:d=0.35[bed];[bed][nz]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]`;
    await ffmpeg(['-loglevel', 'error', '-y', '-i', bed, '-filter_complex', fc, '-map', '[a]', mix]);
    return;
  }
  let bedChain = '[0:a]volume=0.45';
  for (const c of cues) bedChain += `,volume=0.22:enable='${between(c.t0, c.t1)}'`;
  bedChain += '[bed]';
  const parts = [noise, bedChain];
  cues.forEach((c, i) => {
    const ms = Math.max(0, Math.round(c.t0 * 1000));
    parts.push(`[${i + 1}:a]adelay=${ms}|${ms},volume=1.15[vo${i}]`);
  });
  const mixIn = ['[bed]', ...cues.map((_, i) => `[vo${i}]`), '[nz]'].join('');
  parts.push(`${mixIn}amix=inputs=${cues.length + 2}:duration=first:dropout_transition=0:normalize=0,${tail}`);
  const args = ['-loglevel', 'error', '-y', '-i', bed];
  for (const c of cues) args.push('-i', c.wav);
  args.push('-filter_complex', parts.join(';'), '-map', '[a]', mix);
  await ffmpeg(args);
}
