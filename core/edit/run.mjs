// 素材片流水线：node core/edit/run.mjs <films/片名 | templates/模板> [步骤...]
// 步骤：ingest shots frames beats timeline lines voice assemble copy check
// 不传步骤就按这个顺序全跑。
//
// 本地（零模型）：ingest、shots、frames、fallback 节拍、组装、发布文案。
// Bot（看 edit/frames/，在仓库外理解画面）：写 edit/beats.json、edit/timeline.json、lines.json，
//   source 设为 "bot" 或 "human"。标成 bot/human 的文件，重跑时不会覆盖（FORCE=1 才覆盖）。
import path from 'path';
import { pathToFileURL } from 'url';
import { ROOT, loadFilm, readJSON, resolveFilm, run, say } from './lib.mjs';
import { ingest } from './ingest.mjs';
import { detectShots } from './shots.mjs';
import { extractFrames } from './frames.mjs';
import { buildBeats } from './beats.mjs';
import { buildTimeline } from './timeline.mjs';
import { buildLines, synthesize } from './narration.mjs';
import { assemble } from './assemble.mjs';

export const STEPS = ['ingest', 'shots', 'frames', 'beats', 'timeline', 'lines', 'voice', 'assemble', 'copy', 'check'];

export async function runEdit(filmArg, requested = []) {
  const film = resolveFilm(filmArg);
  const cfg = loadFilm(film);
  const unknown = requested.filter(s => !STEPS.includes(s));
  const steps = requested.filter(s => STEPS.includes(s));
  if (unknown.length && !steps.length) {
    throw new Error(`这些步骤不属于素材片：${unknown.join(' ')}。可用：${STEPS.join(' ')}`);
  }
  if (unknown.length) console.log('忽略不属于素材流程的步骤：' + unknown.join(' '));
  const runSteps = requested.length ? steps : [...STEPS];
  const has = s => runSteps.includes(s);
  console.log(`${path.basename(film)} · 素材片 ${cfg.width}×${cfg.height} · ${runSteps.join(' ')}`);

  if (has('ingest')) { say('ingest: 清点 raw/'); await ingest(film); }
  if (has('shots')) { say('shots: 镜头检测（ffmpeg scene / silence，无模型）'); await detectShots(film, cfg); }
  if (has('frames')) { say('frames: 抽中间帧'); await extractFrames(film); }

  const readShots = () => {
    const doc = readJSON(path.join(film, 'edit/shots.json'));
    if (!doc?.shots?.length) throw new Error('还没有 edit/shots.json，先跑 shots');
    return doc.shots;
  };

  let beatsDoc = null;
  if (has('beats')) { say('beats: 节拍'); beatsDoc = buildBeats(film, readShots(), true); }

  let timelineDoc = null;
  if (has('timeline')) {
    say('timeline: 起承转合');
    const shots = readShots();
    if (!beatsDoc) beatsDoc = buildBeats(film, shots, false);
    timelineDoc = buildTimeline(film, shots, beatsDoc, cfg, true);
  }
  if (has('lines')) {
    say('lines: 旁白');
    timelineDoc = timelineDoc || readJSON(path.join(film, 'edit/timeline.json'));
    if (!timelineDoc?.segments?.length) throw new Error('还没有 edit/timeline.json，先跑 timeline');
    if (!beatsDoc) beatsDoc = readJSON(path.join(film, 'edit/beats.json'));
    buildLines(film, timelineDoc, beatsDoc, true);
  }
  if (has('voice')) { say('voice: 配音（edge-tts）'); await synthesize(film); }
  if (has('assemble')) { say('assemble: 切、叠化、混音、成片'); await assemble(film, cfg); }
  if (has('copy')) { say('copy: 发布文案'); await run('node', [path.join(ROOT, 'core/publish/copy.mjs'), film]); }
  if (has('check')) {
    say('check: 成片检查');
    await run('sh', [path.join(ROOT, 'core/render/check.sh'), path.join(film, 'out', `${path.basename(film)}.mp4`)]);
  }

  const beats = readJSON(path.join(film, 'edit/beats.json'));
  if (beats?.source === 'fallback' && (has('assemble') || has('beats'))) {
    console.log('\n节拍是启发式的，没有看画面。Bot 看完 edit/frames/ 和 edit/shots.json 后：');
    console.log('  1. 把 edit/beats.json 写成 source:"bot"（who / what / emotion / role / keep）');
    console.log('  2. 需要控制剪辑点时，改 edit/timeline.json，source 也设为 "bot"');
    console.log('  3. 口播写进 lines.json，source 设为 "bot"');
    console.log(`  4. 再跑：node core/edit/run.mjs ${path.relative(ROOT, film)} voice assemble copy check`);
  }
  return { film, steps: runSteps };
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) runEdit(process.argv[2], process.argv.slice(3)).catch(e => { console.error(e.message || e); process.exit(1); });
