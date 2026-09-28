#!/bin/sh
# 安装工作台依赖：sh setup.sh [all | node | python | fonts | browser]
#   node     npm install（playwright-core、three）
#   python   .venv + requirements.txt
#   fonts    下载思源黑体 Noto Sans SC（OFL，约 17 MB）到 core/fonts/src/，用于按片裁剪子集
#   browser  没有系统 Chrome 时，下载 playwright 的 chromium-headless-shell
# 需要系统里已有：Node 20+、Python 3.11+、ffmpeg
set -e
cd "$(dirname "$0")"
WHAT=${1:-all}
need() { command -v "$1" >/dev/null 2>&1 || { echo "缺少 $1：$2"; exit 1; }; }

if [ "$WHAT" = all ] || [ "$WHAT" = node ]; then
  need node "请安装 Node 20+"; need ffmpeg "请安装 ffmpeg（macOS: brew install ffmpeg；Ubuntu: apt install ffmpeg）"
  npm install --no-fund --no-audit
fi
if [ "$WHAT" = all ] || [ "$WHAT" = python ]; then
  need python3 "请安装 Python 3.11+"
  [ -x .venv/bin/python ] || python3 -m venv .venv
  .venv/bin/pip install -q --upgrade pip
  .venv/bin/pip install -q -r requirements.txt
fi
if [ "$WHAT" = all ] || [ "$WHAT" = fonts ]; then
  mkdir -p core/fonts/src
  F='core/fonts/src/NotoSansSC[wght].ttf'
  [ -f "$F" ] || curl -fL --retry 3 -o "$F" 'https://github.com/google/fonts/raw/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf'
  echo "✓ $F"
fi
if [ "$WHAT" = all ] || [ "$WHAT" = browser ]; then
  if node -e "import('./core/render/browser.mjs').then(m => process.exit(m.EXE ? 0 : 1))"; then
    node -e "import('./core/render/browser.mjs').then(m => console.log('✓ 浏览器', m.EXE))"
  else
    npx playwright-core install chromium-headless-shell
  fi
fi
echo "✓ setup $WHAT 完成"
