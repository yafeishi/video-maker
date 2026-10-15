// 打开影片页面（仓库根为静态服务根），等待 window.READY
import { chromium } from 'playwright-core';
import path from 'path'; import { fileURLToPath } from 'url';
import { serve, pageURL } from './serve.mjs';
import { EXE, ARGS } from './browser.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let srv = null;
export async function server() { if (!srv) srv = await serve(ROOT); return srv; }

export async function openFilm(dir, { w = 1920, h = 1080, q = '' } = {}) {
  const { port } = await server();
  const browser = await chromium.launch({ executablePath: EXE, args: ARGS });
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) console.error('[page]', m.text().slice(0, 300)); });
  // 渲染中报错就停，免得产出坏片
  page.on('pageerror', e => { console.error('[pageerror]', e.message); process.exit(1); });
  const sep = q ? '?' + q : '';
  await page.goto(pageURL(ROOT, port, dir) + (sep ? sep + '&' : '?') + 'render=1');
  await page.waitForFunction(() => window.READY === true, null, { timeout: 180000 });
  // Match viewport to canvas bitmap so竖屏 films render at native size (e.g. 1080×1920)
  const size = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? { w: c.width | 0, h: c.height | 0 } : null;
  });
  if (size && size.w > 0 && size.h > 0 && (size.w !== w || size.h !== h)) {
    await page.setViewportSize({ width: size.w, height: size.h });
  }
  return { browser, page };
}
export function closeServer() { if (srv) srv.server.close(); }
