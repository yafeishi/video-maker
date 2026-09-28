#!/bin/sh
# 一键出片：sh build.sh [步骤 ...]（步骤见 core/build.sh；例：sh build.sh events audio mux）
# 纸色背景上可以多一点颗粒
cd "$(dirname "$0")"
ROOT=${WORKBENCH_ROOT:-$(cd ../.. && pwd)}
GRAIN=${GRAIN:-2} exec sh "$ROOT/core/build.sh" . "$@"
