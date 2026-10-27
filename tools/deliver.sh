#!/bin/sh
# Build a film and collect chat-ready delivery files.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DELIVERY_ROOT=${VIDEO_DELIVERIES_ROOT:-/workspace/video-deliveries}

usage() {
  echo "用法：sh tools/deliver.sh <films/<name>|templates/<name>|<name>>" >&2
  exit 2
}

[ "$#" -eq 1 ] || usage
REL=$1
case "$REL" in
  /*|*..*|*\#*|*%*|*" "*)
    echo "错误：影片路径必须是仓库内、且不能含空格、#、%、..：$REL" >&2
    exit 2
    ;;
esac

# A bare name means films/<name>; explicit films/ or templates/ paths are also accepted.
case "$REL" in
  films/*) FILM_REL=$REL ;;
  templates/*) FILM_REL=$REL ;;
  *) FILM_REL=films/$REL ;;
esac
FILM_DIR=$ROOT/$FILM_REL
NAME=$(basename -- "$FILM_DIR")

[ -d "$FILM_DIR" ] || { echo "错误：影片目录不存在：$FILM_DIR" >&2; exit 1; }
if [ -x "$FILM_DIR/build.sh" ]; then
  BUILD=$FILM_DIR/build.sh
elif [ -f "$FILM_DIR/build.sh" ]; then
  BUILD=$FILM_DIR/build.sh
else
  echo "错误：找不到 build.sh：$FILM_DIR/build.sh" >&2
  exit 1
fi

# YYYY-MM-DD follows the box's local (Asia/Shanghai) date.
DATE=$(date +%F)
DEST=$DELIVERY_ROOT/$DATE-$NAME
mkdir -p "$DEST"

echo "== 构建：$FILM_REL =="
(cd "$ROOT" && sh "$BUILD")

OUT=$FILM_DIR/out
[ -d "$OUT" ] || { echo "错误：构建后没有 out/：$OUT" >&2; exit 1; }

# Copy only the intended delivery artifacts. copy* may be a file or directory;
# cp -R keeps support files grouped if a film uses a copy directory.
found=0
copy_artifact() {
  src=$1
  [ -e "$src" ] || return 0
  cp -R "$src" "$DEST/"
  found=1
}

for src in "$OUT"/*.mp4 "$OUT"/*.srt "$OUT"/poster.jpg; do
  [ -e "$src" ] || continue
  copy_artifact "$src"
done
for src in "$OUT"/copy*; do
  [ -e "$src" ] || continue
  copy_artifact "$src"
done

[ "$found" -eq 1 ] || {
  echo "错误：out/ 中没有可交付的 mp4、srt、poster.jpg 或 copy* 文件：$OUT" >&2
  exit 1
}

# 分轨：高清 = out 主成片原样复制；聊天预览 = preview-chat.mp4（H.264 Baseline，目标 ≤约 3MB）。
# 预览失败不阻断高清交付，只在 READY 里写明。
MAIN=$OUT/$NAME.mp4; [ -f "$MAIN" ] || MAIN=$(ls "$OUT"/*.mp4 2>/dev/null | grep -v preview-chat | head -1 || true)
PREVIEW_NOTE="未生成（没有主成片）"
if [ -n "$MAIN" ] && [ -f "$MAIN" ]; then
  PV=$DEST/preview-chat.mp4
  DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$MAIN" 2>/dev/null || echo 60)
  # 目标 2.8MB：视频码率 = 总预算 - 48k 音频
  VB=$(awk -v d="$DUR" 'BEGIN{b=int(2.8*8*1024/d)-48; if(b<120)b=120; if(b>1500)b=1500; print b}')
  if ffmpeg -loglevel error -y -i "$MAIN" -vf "scale='if(gt(iw,ih),-2,540)':'if(gt(iw,ih),540,-2)',fps=24" \
       -c:v libx264 -profile:v baseline -level 3.1 -pix_fmt yuv420p -b:v ${VB}k -maxrate ${VB}k -bufsize $((VB*2))k \
       -c:a aac -b:a 48k -ac 1 -movflags +faststart "$PV" 2>"$DEST/.preview.log"; then
    PREVIEW_NOTE="preview-chat.mp4 · $(wc -c < "$PV" | tr -d ' ') bytes · H.264 Baseline 540p 24fps · ${VB}k"
    [ "$(wc -c < "$PV")" -le 3300000 ] || PREVIEW_NOTE="$PREVIEW_NOTE（超过约 3MB，片太长，聊天里请发链接）"
    rm -f "$DEST/.preview.log"
  else
    PREVIEW_NOTE="生成失败（见 $DEST/.preview.log），高清照常交付"
  fi
fi

READY=$DEST/READY.md
{
  echo "# READY — $NAME"
  echo
  echo "构建源：$FILM_DIR"
  echo "交付目录：$DEST"
  echo
  echo "- 高清：$MAIN（原样复制，发布用）"
  echo "- 聊天预览：$PREVIEW_NOTE"
  echo "- 文案交接：copy-handoff.md（增长岗润色排期，不代发）"
  echo
  echo "| 文件 | 大小 |"
  echo "|---|---:|"
  find "$DEST" -type f ! -name READY.md -print | sort | while IFS= read -r file; do
    size=$(wc -c < "$file" | tr -d '[:space:]')
    printf '| `%s` | %s bytes |\n' "$file" "$size"
  done
} > "$READY"

printf '\nREADY: %s\n' "$READY"
find "$DEST" -type f ! -name READY.md -print | sort | while IFS= read -r file; do
  size=$(wc -c < "$file" | tr -d '[:space:]')
  printf '%s\t%s bytes\n' "$file" "$size"
done
