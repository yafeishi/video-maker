#!/usr/bin/env bash
# 视频 → 公众号文章（不发布）
#   tools/video2article.sh prep  <url|file> <slug>      下载/字幕或转写/镜头/联系表 → runs/<slug>/
#   （写作：agent 读 transcript.txt + contact.jpg，按 /workspace/style/no-ai-style.md 写 runs/<slug>/article/article.md）
#   tools/video2article.sh frames <slug> name@秒 ...     截配图到 article/img/
#   tools/video2article.sh build <slug>                  lint + 渲染 article.html + 部署预览 ops.danghb.cn/fun/demo/article-<slug>/
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
D="$(cd "$(dirname "$0")/.." && pwd)"; A="$D/core/article"; RUNS="${ARTICLE_RUNS:-/workspace/article-runs}"
cmd=$1; shift
case $cmd in
  prep)   python3 "$A/prep.py" "$1" "$RUNS/$2" ;;
  frames) s=$1; shift; python3 "$A/frames.py" "$RUNS/$s" "$@" ;;
  build)  R="$RUNS/$1/article"; python3 "$A/lint.py" "$R/article.md"; python3 "$A/render.py" "$R/article.md"
          P=/workspace/fun-demos/article-$1; rm -rf "$P"; mkdir -p "$P"; cp -r "$R/img" "$P/"; cp "$R/article.html" "$P/index.html"; [ -f "$R/cover.jpg" ] && cp "$R/cover.jpg" "$P/"
          echo "preview: https://ops.danghb.cn/fun/demo/article-$1/" ;;
  *) echo "usage: prep|frames|build"; exit 2 ;;
esac
