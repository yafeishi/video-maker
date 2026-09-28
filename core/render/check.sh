#!/bin/sh
# 成片检查：sh core/render/check.sh film.mp4
# 打印时长、分辨率、响度（目标约 −14 LUFS）、黑帧区间（持续 ≥0.3 s 的纯黑段）
set -e
F="$1"; [ -f "$F" ] || { sed -n '2,3p' "$0"; exit 2; }
echo "== $F"
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -show_entries format=duration -of default=nw=1 "$F"
echo "== loudness"
ffmpeg -hide_banner -nostats -i "$F" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I|LRA|Peak):" | head -3
echo "== black frames (>=0.3s)"
B=$(ffmpeg -hide_banner -nostats -i "$F" -vf blackdetect=d=0.3:pix_th=0.02 -an -f null - 2>&1 | grep -o 'black_start:[^ ]* black_end:[^ ]*' || true)
if [ -n "$B" ]; then echo "$B"; else echo "none"; fi
