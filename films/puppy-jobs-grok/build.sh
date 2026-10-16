#!/bin/sh
# 一键出片：sh build.sh [步骤 ...]（步骤见 core/build.sh）
# 竖屏卡通不加颗粒，30fps
cd "$(dirname "$0")"
ROOT=${WORKBENCH_ROOT:-$(cd ../.. && pwd)}
FPS=${FPS:-30} GRAIN=${GRAIN:-0} WORKERS=${WORKERS:-3} exec sh "$ROOT/core/build.sh" . "$@"
