// 导出时间线：node core/render/events.mjs <film> → <film>/events.json
// 内容 = { dur, poster, ev: window.EV, cues: window.CUES, shots: window.SHOTS }，混音脚本、字幕导出和工作台都读它
import fs from 'fs'; import path from 'path';
import { openFilm, closeServer } from './page.mjs';

const dir = process.argv[2];
if (!dir) { console.error('usage: node core/render/events.mjs <film>'); process.exit(2); }
const { browser, page } = await openFilm(dir);
const data = await page.evaluate(() => ({ dur: window.DUR, poster: window.POSTER ?? null, ev: window.EV || [], cues: window.CUES || [], shots: window.SHOTS || [] }));
fs.writeFileSync(path.join(dir, 'events.json'), JSON.stringify(data, null, 1));
console.log('events', data.ev.length, 'cues', data.cues.length, 'dur', data.dur.toFixed(2));
await browser.close(); closeServer();
