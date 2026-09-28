#!/bin/sh
# 通用出片流程：sh core/build.sh <film> [步骤 ...]（每部片的 build.sh 只是调用它）
# 步骤：fonts voice events srt audio video mux poster check（默认全部，按此顺序）
#   fonts   按用字裁剪中文字体 → <film>/fonts/NotoSansSC.woff2
#   voice   lines.json → voices/*.wav + dur.json（edge-tts；文本没变的句子不重做）
#   events  页面导出 DUR / EV / CUES / SHOTS → events.json
#   srt     字幕 → out/<name>.srt
#   audio   python audio.py → out/mix.wav（片子没有 audio.py 时生成静音）
#   video   逐帧渲染 → out/video.mp4
#   mux     合成 + 两遍 loudnorm −14 LUFS → out/<name>.mp4
#   poster  海报（window.POSTER 秒处，缺省取中点）→ out/poster.jpg 和 <film>/poster.jpg
#   check   时长 / 响度 / 黑帧
# 例：只改了配乐 → build.sh events audio mux；只改了画面 → build.sh events srt video mux poster
# 环境变量：FPS（默认 24）、WORKERS（默认 3）、GRAIN（胶片颗粒，默认 1；0 = 不加）
set -e
ROOT=${WORKBENCH_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}; export WORKBENCH_ROOT="$ROOT"
FILM=$(cd "$1" && pwd); shift; NAME=$(basename "$FILM")
cd "$FILM"
case "$FILM" in *[\ \#%]*) echo "影片路径里不要有空格、# 或 %（ffmpeg 会出错）：$FILM"; exit 1 ;; esac
PY="$ROOT/.venv/bin/python"; [ -x "$PY" ] || PY=python3
FPS=${FPS:-24}; WORKERS=${WORKERS:-3}; GRAIN=${GRAIN:-1}
STEPS=${*:-fonts voice events srt audio video mux poster check}
mkdir -p out
has() { case " $STEPS " in *" $1 "*) return 0 ;; esac; return 1; }
say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }

if has fonts; then
  say "fonts: 按用字裁剪中文字体"
  if [ -f "$ROOT/core/fonts/src/NotoSansSC[wght].ttf" ]; then "$PY" "$ROOT/core/fonts/subset.py" "$FILM"
  elif [ -f fonts/NotoSansSC.woff2 ]; then echo "没有完整字体（sh setup.sh fonts 下载），沿用现有 fonts/NotoSansSC.woff2；新加的字可能显示不出来"
  else echo "缺少字体：先运行 sh $ROOT/setup.sh fonts"; exit 1; fi
fi
if has voice; then
  say "voice: 配音（edge-tts）"
  if [ -f lines.json ]; then "$PY" "$ROOT/core/tts/tts_zh.py" lines.json voices; else echo "没有 lines.json，跳过"; fi
fi
if has events; then say "events: 导出时间线"; node "$ROOT/core/render/events.mjs" "$FILM"; fi
if has srt;    then say "srt: 字幕"; "$PY" "$ROOT/core/render/srt.py" events.json "out/$NAME.srt"; fi
if has audio; then
  say "audio: 配乐 + 拟音 + 混音"
  if [ -f audio.py ]; then "$PY" audio.py
  else
    D=$("$PY" -c "import json; print(json.load(open('events.json'))['dur'])")
    ffmpeg -y -loglevel error -f lavfi -i anullsrc=r=48000:cl=stereo -t "$D" out/mix.wav && echo "没有 audio.py：生成 ${D}s 静音"
  fi
fi
if has video;  then say "video: 逐帧渲染 ${FPS}fps"; node "$ROOT/core/render/video.mjs" "$FILM" --fps "$FPS" --workers "$WORKERS"; fi
if has mux;    then say "mux: 合成 + 响度"; sh "$ROOT/core/render/mux.sh" out/video.mp4 out/mix.wav "out/$NAME.mp4" "$FPS" "$GRAIN"; fi
if has poster; then
  say "poster: 海报"
  T=$("$PY" -c "import json; d=json.load(open('events.json')); print(round(d.get('poster') or d['dur']/2, 2))")
  node "$ROOT/core/render/still.mjs" "$FILM" "$T" --out out --prefix poster_ >/dev/null
  mv "out/poster_$T.jpg" out/poster.jpg && cp out/poster.jpg poster.jpg && echo "out/poster.jpg  (t=$T)"
fi
if has check;  then say "check: 成片检查"; sh "$ROOT/core/render/check.sh" "out/$NAME.mp4"; fi
