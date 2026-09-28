// 找一个可用的 Chrome / Chromium：
// 1. PLAYWRIGHT_CHROME 环境变量
// 2. playwright 缓存里的 chromium-headless-shell（npx playwright-core install chromium-headless-shell）
// 3. 系统安装的 Chrome / Chromium
// 都找不到时返回 undefined，交给 playwright 自己找
import fs from 'fs'; import path from 'path'; import os from 'os';

function fromPlaywrightCache() {
  const home = os.homedir();
  const bases = [process.env.PLAYWRIGHT_BROWSERS_PATH, path.join(home, 'Library/Caches/ms-playwright'), path.join(home, '.cache/ms-playwright')].filter(Boolean);
  const exes = ['chrome-headless-shell-mac-arm64/chrome-headless-shell', 'chrome-headless-shell-mac-x64/chrome-headless-shell', 'chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux/headless_shell'];
  for (const base of bases) {
    if (!fs.existsSync(base)) continue;
    for (const d of fs.readdirSync(base).filter(d => d.startsWith('chromium_headless_shell')).sort().reverse())
      for (const e of exes) { const p = path.join(base, d, e); if (fs.existsSync(p)) return p; }
  }
}

const SYSTEM = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/local/bin/google-chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium',
];

export const EXE = process.env.PLAYWRIGHT_CHROME || fromPlaywrightCache() || SYSTEM.find(p => fs.existsSync(p));
// GPU 参数让 WebGL 走 ANGLE/GL（M 系列 Mac 上比默认 SwiftShader 快很多）；没有 GPU 时 Chrome 会自动回落到软件渲染
export const ARGS = ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist', '--font-render-hinting=none', '--force-color-profile=srgb', '--autoplay-policy=no-user-gesture-required'];
