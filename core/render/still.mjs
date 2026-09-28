// 渲静帧：node core/render/still.mjs <film> <t> [<t> ...] [--range a:b:step] [--q 'k=v&..'] [--prefix t_] [--out dir]
// 页面需暴露 window.READY 和 window.render(t)；页面报错立即退出（非 0）
import fs from 'fs'; import path from 'path';
import { openFilm, closeServer } from './page.mjs';

const args = process.argv.slice(2);
const take = k => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : null; };
const out = take('--out'), q = take('--q') || '', prefix = take('--prefix') || 't_', rg = take('--range');
const [dir, ...times] = args;
if (!dir) { console.error('usage: node core/render/still.mjs <film> <t>... [--range a:b:step]'); process.exit(2); }
if (rg) { const [a, b, st] = rg.split(':').map(Number); for (let x = a; x <= b + 1e-9; x += st) times.push(x.toFixed(2)); }
const outDir = out || path.join(dir, 'stills'); fs.mkdirSync(outDir, { recursive: true });

const { browser, page } = await openFilm(dir, { q });
for (const ts of times) {
  const t0 = Date.now();
  await page.evaluate(t => window.render(t), parseFloat(ts));
  const f = path.join(outDir, `${prefix}${ts}.jpg`);
  await page.screenshot({ path: f, type: 'jpeg', quality: 92 });
  console.log(f, Date.now() - t0 + 'ms');
}
await browser.close(); closeServer();
