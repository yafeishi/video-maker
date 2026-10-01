#!/bin/sh
# 一键出片：sh build.sh [步骤 ...]（步骤见 core/build.sh；例：sh build.sh events audio mux）
# 深色画面上颗粒会显脏，这部片只加很轻的颗粒
cd "$(dirname "$0")"
ROOT=${WORKBENCH_ROOT:-$(cd ../.. && pwd)}
GRAIN=${GRAIN:-1} exec sh "$ROOT/core/build.sh" . "$@"
