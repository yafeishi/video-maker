#!/bin/sh
# 泡芙一键简报：sh tools/new-puff-film.sh <片名> [模板=blank] [墨镜]
#   写 brief.json（泡芙线、character-locked、竖屏 9:16、抖音、无水印）+ status.json（stage=选题）
#   绝不写「Hobson 小党」水印；禁止实拍照片轮播冒充动画。
set -e
cd "$(dirname "$0")/.."
N=$1; T=${2:-blank}; PACK=puff-daily; [ "$3" = 墨镜 ] && PACK=puff-sunglasses
[ -n "$N" ] || { sed -n '2,4p' "$0"; exit 2; }
sh tools/new-film.sh "$T" "$N"
node -e '
const fs=require("fs");
import("./studio/config.mjs").then(({normalizeBrief,defaultStatus})=>{
  const b=normalizeBrief({line:"泡芙",stylePack:process.argv[2],watermark:""});
  if (JSON.stringify(b).includes("Hobson")) throw new Error("泡芙简报混入 Hobson 水印");
  fs.writeFileSync(process.argv[1]+"/brief.json",JSON.stringify(b,null,2)+"\n");
  fs.writeFileSync(process.argv[1]+"/status.json",JSON.stringify(defaultStatus("泡芙"),null,2)+"\n");
  console.log("✓ 泡芙简报：竖屏",b.aspect,"·",b.platforms.join("/"),"· 水印「"+b.watermark+"」· 角色",b.characterLocked);
});' "films/$N" "$PACK"
