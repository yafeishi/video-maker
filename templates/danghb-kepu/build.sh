#!/bin/sh
# 一键出片：深色画面轻颗粒
cd "$(dirname "$0")"
ROOT=${WORKBENCH_ROOT:-$(cd ../.. && pwd)}
GRAIN=${GRAIN:-1} exec sh "$ROOT/core/build.sh" . "$@"
