// 渲视频：node core/render/video.mjs <film> [--fps 24] [--workers 3] [--q 'k=v'] [--out <film>/out/video.mp4]
// 每个 worker 一个独立浏览器，JPEG 截图经管道交给 ffmpeg；最后无损拼接
// 多部片并行时 workers 保持 3，单独渲染可按 CPU 核数开大
import fs from 'fs'; import os from 'os'; import path from 'path'; import { spawn, execFileSync } from 'child_process';
import { openFilm, closeServer } from './page.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const dir = args[0];
if (!dir) { console.error('usage: node core/render/video.mjs <film> [--fps 24] [--workers 3]'); process.exit(2); }
const FPS = +opt('--fps', 24), WK = +opt('--workers', Math.max(1, Math.min(3, os.cpus().length - 1))), Q = opt('--q', '');
const outDir = path.join(dir, 'out'); fs.mkdirSync(outDir, { recursive: true });
const out = opt('--out', path.join(outDir, 'video.mp4'));

const probe = await openFilm(dir, { q: Q });
const DUR = await probe.page.evaluate(() => window.DUR); await probe.browser.close();
const TOTAL = Math.round(DUR * FPS), per = Math.ceil(TOTAL / WK), t0 = Date.now();
let done = 0;
console.log(`render ${dir}  ${DUR.toFixed(2)}s × ${FPS}fps = ${TOTAL} frames, ${WK} workers`);

await Promise.all([...Array(WK)].map(async (_, w) => {
  const a = w * per, b = Math.min(TOTAL, a + per); if (a >= b) return;
  const { browser, page } = await openFilm(dir, { q: Q });
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', path.join(outDir, `seg_${w}.mp4`)]);
  for (let f = a; f < b; f++) {
    await page.evaluate(t => window.render(t), f / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (++done % 48 === 0) console.log(`progress ${done}/${TOTAL}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r)); await browser.close();
}));

const list = path.join(outDir, 'segs.txt');
fs.writeFileSync(list, [...Array(WK)].map((_, w) => `file 'seg_${w}.mp4'`).filter((_, w) => w * per < TOTAL).join('\n'));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out]);
for (let w = 0; w < WK; w++) fs.rmSync(path.join(outDir, `seg_${w}.mp4`), { force: true });
fs.rmSync(list, { force: true });
console.log('done', out, TOTAL, 'frames', ((Date.now() - t0) / 1000).toFixed(0) + 's');
closeServer();
