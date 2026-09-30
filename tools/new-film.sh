#!/bin/sh
# 从模板新建影片：sh tools/new-film.sh <模板> <片名>
#   sh tools/new-film.sh keynote my-launch   → films/my-launch/
# 片名只用小写字母、数字和连字符。不复制渲染产物（out/ stills/ voices/ events.json poster.jpg）
set -e
cd "$(dirname "$0")/.."
T="$1"; N="$2"
if [ -z "$T" ] || [ -z "$N" ]; then sed -n '2,5p' "$0"; echo "可用模板：$(ls templates | tr '\n' ' ')"; exit 2; fi
[ -f "templates/$T/index.html" ] || { echo "没有模板 $T；可用：$(ls templates | tr '\n' ' ')"; exit 1; }
echo "$N" | grep -Eq '^[a-z0-9][a-z0-9-]{0,47}$' || { echo "片名只能用小写字母、数字和连字符，例如 orange-cat"; exit 1; }
[ ! -e "films/$N" ] || { echo "films/$N 已存在"; exit 1; }
mkdir -p "films/$N"
(cd "templates/$T" && tar cf - --exclude=./out --exclude=./stills --exclude=./voices --exclude=./events.json --exclude=./poster.jpg --exclude=./edit/work --exclude=./edit/frames --exclude=./raw .) | (cd "films/$N" && tar xf -)
echo "✓ films/$N（来自 templates/$T）"
echo "  预览：npm run studio → http://127.0.0.1:4400/#films/$N"
echo "  出片：sh films/$N/build.sh"
if [ -f "films/$N/film.json" ] && grep -q '"footage"' "films/$N/film.json"; then
  echo "  素材片：把 mp4/mov 放进 films/$N/raw/ 再出片。不放的话，示例会先生成色块小样。"
fi
