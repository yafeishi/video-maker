#!/bin/sh
# 从模板新建影片：sh tools/new-film.sh <模板> <片名> [--cta]
#   sh tools/new-film.sh keynote my-launch         → films/my-launch/
#   sh tools/new-film.sh keynote my-launch --cta   → 同上，并打开结尾互动（评论区引导，见 core/cta.js）
#   sh tools/new-film.sh qa my-q --line 科普   → 另写科普 brief.json + status.json（泡芙线请用 tools/new-puff-film.sh）
# 片名只用小写字母、数字和连字符。不复制渲染产物（out/ stills/ voices/ events.json poster.jpg）
set -e
cd "$(dirname "$0")/.."
CTA=0; T=""; N=""; LINE=""; NEXT=""
for a in "$@"; do
  if [ "$NEXT" = line ]; then LINE=$a; NEXT=""; continue; fi
  case "$a" in --cta) CTA=1 ;; --line) NEXT=line ;; *) if [ -z "$T" ]; then T="$a"; elif [ -z "$N" ]; then N="$a"; fi ;; esac
done
if [ -z "$T" ] || [ -z "$N" ]; then sed -n '2,6p' "$0"; echo "可用模板：$(ls templates | tr '\n' ' ')"; exit 2; fi
[ -f "templates/$T/index.html" ] || { echo "没有模板 $T；可用：$(ls templates | tr '\n' ' ')"; exit 1; }
echo "$N" | grep -Eq '^[a-z0-9][a-z0-9-]{0,47}$' || { echo "片名只能用小写字母、数字和连字符，例如 orange-cat"; exit 1; }
[ ! -e "films/$N" ] || { echo "films/$N 已存在"; exit 1; }
mkdir -p "films/$N"
(cd "templates/$T" && tar cf - --exclude=./out --exclude=./stills --exclude=./voices --exclude=./events.json --exclude=./poster.jpg --exclude=./edit/work --exclude=./edit/frames --exclude=./raw .) | (cd "films/$N" && tar xf -)
echo "✓ films/$N（来自 templates/$T）"
if [ "$LINE" = 泡芙 ]; then rm -rf "films/$N"; exec sh tools/new-puff-film.sh "$N" "$T"; fi
if [ "$LINE" = 科普 ]; then node -e 'const fs=require("fs");import("./studio/config.mjs").then(({normalizeBrief,defaultStatus})=>{fs.writeFileSync(process.argv[1]+"/brief.json",JSON.stringify(normalizeBrief({line:"科普"}),null,2)+"\n");fs.writeFileSync(process.argv[1]+"/status.json",JSON.stringify(defaultStatus("科普"),null,2)+"\n");console.log("✓ 科普简报 + status（选题）")})' "films/$N"; fi
[ "$CTA" = 1 ] && node tools/add-cta.mjs "films/$N"
echo "  预览：npm run studio → http://127.0.0.1:4400/#films/$N"
if grep -q "core/deck.js" "films/$N/film.js" 2>/dev/null; then
  echo "  改内容：照 docs/lines.md 改 films/$N/lines.json（不用改代码）"
  echo "  出片并自检：sh tools/make.sh films/$N"
else
  echo "  出片：sh films/$N/build.sh"
  if [ -f "films/$N/film.json" ] && grep -q '"footage"' "films/$N/film.json"; then
    echo "  素材片：把 mp4/mov 放进 films/$N/raw/ 再出片。不放的话，示例会先生成色块小样。"
  fi
fi
