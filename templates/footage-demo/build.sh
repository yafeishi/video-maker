#!/bin/sh
# 素材片一键出片：sh build.sh [步骤 ...]
# 步骤：ingest shots frames beats timeline lines voice assemble copy check（见 core/edit/run.mjs）
# raw/ 里没有视频时，先用 ffmpeg 生成色块小样。实拍请自己放进 raw/，再跑本脚本。
set -e
cd "$(dirname "$0")"
ROOT=${WORKBENCH_ROOT:-$(cd ../.. && pwd)}
found=0
for f in raw/*.mp4 raw/*.mov raw/*.m4v; do
  [ -f "$f" ] && found=1 && break
done
if [ "$found" = 0 ]; then
  node make-raw.mjs
fi
exec node "$ROOT/core/edit/run.mjs" . "$@"
