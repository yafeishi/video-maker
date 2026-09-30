#!/bin/sh
# 一条命令出片并自检：sh tools/make.sh films/<片名>
#   1. 检查 lines.json（有错误就停，按提示改）
#   2. 出片（fonts voice events srt audio video mux poster check）
#   3. 配音检查：成片里每句台词听写一遍，和字幕比对（需要 faster-whisper；ASR_MODEL=small 更快，默认 medium 更准）
#   4. 联系表：每个镜头取两帧拼成 out/sheet.jpg，用来一眼看完整部片
#   最后列出成片文件和要处理的问题。只改了画面或配乐时，直接用 sh films/<片名>/build.sh <步骤>
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
[ -n "$1" ] && [ -f "$1/lines.json" ] || { sed -n '2,7p' "$0"; exit 2; }
F=$(cd "$1" && pwd); NAME=$(basename "$F")
PY="$ROOT/.venv/bin/python"; [ -x "$PY" ] || PY=python3
say() { printf '\n\033[1;35m■ %s\033[0m\n' "$*"; }

say "1/4 检查 lines.json"
node "$ROOT/tools/check-lines.mjs" "$F" || { echo "\n先按上面的 ✗ 改好 lines.json，再重新运行 sh tools/make.sh $1"; exit 1; }

say "2/4 出片"
sh "$F/build.sh" 2>&1 | tee "$F/out.log" | grep -Ev '^progress ' || true
mkdir -p "$F/out"; mv "$F/out.log" "$F/out/build.log"
[ -f "$F/out/$NAME.mp4" ] && [ "$F/out/$NAME.mp4" -nt "$F/lines.json" ] || { echo "\n✗ 出片失败，完整日志：$F/out/build.log（看最后 30 行找报错）"; exit 1; }

say "3/4 配音检查"
ASR="$F/out/asr.txt"
if "$PY" -c "import faster_whisper" 2>/dev/null; then
  "$PY" "$ROOT/core/tts/asr_mix.py" "$F/out/mix.wav" "$F/events.json" --model "${ASR_MODEL:-medium}" > "$ASR" 2>/dev/null || true
  grep -E '^(DIFF|NEAR|mismatches)' "$ASR" || true
else
  echo "没装 faster-whisper，跳过（sh setup.sh 会装）" > "$ASR"; cat "$ASR"
fi

say "4/4 联系表"
TS=$("$PY" -c "
import json; d = json.load(open('$F/events.json'))
print(' '.join(f\"{s['t0'] + (s['t1'] - s['t0']) * k:.2f}\" for s in d['shots'] for k in (.35, .8)))")
rm -rf "$F/out/sheet"
node "$ROOT/core/render/still.mjs" "$F" $TS --out "$F/out/sheet" >/dev/null
"$PY" "$ROOT/core/render/sheet.py" "$F/out/sheet.jpg" $(ls "$F"/out/sheet/t_*.jpg | sort -t_ -k2 -g) --cols 4 --w 480 >/dev/null && rm -rf "$F/out/sheet"
echo "$F/out/sheet.jpg"

say "结果"
echo "成片    $F/out/$NAME.mp4"
echo "字幕    $F/out/$NAME.srt"
echo "海报    $F/poster.jpg"
echo "联系表  $F/out/sheet.jpg"
grep -E '^\s+I:' "$F/out/build.log" | tail -1 | sed 's/^ */响度    /'
BLACK=$(sed -n '/black frames/,$p' "$F/out/build.log" | sed -n 2p)
N=$(grep -c '^DIFF' "$ASR" || true); NN=$(grep -c '^NEAR' "$ASR" || true)
echo
[ "$BLACK" = none ] || echo "! 有黑帧：$BLACK（看这段时间的画面）"
if [ "$N" -gt 0 ]; then
  echo "! 配音检查有 $N 句对不上（详见 $ASR）。先听这几句：读错了就换一种说法，或给这句加 \"say\" 字段写读音；"
  echo "  只是写法不同（例如数字、同音字）就给这句加 \"asr\" 字段写听写结果。改完重新运行 sh tools/make.sh $1"
fi
[ "$NN" -gt 0 ] && echo "· 有 $NN 句只差一两个音节（NEAR），多半是识别模型听错，不用改；交付前听一下这几句即可"
echo "下一步：打开联系表逐格看，字有没有出框、重叠、太小；有问题只改 lines.json 里对应的字（改短、拆条目），再重新运行。"
