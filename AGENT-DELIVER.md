# 交付给用户

本项目不需要 LLM API；中文配音使用 `edge-tts`（需要网络）。

总管家制作视频时：

1. 新片：`sh tools/new-film.sh <name>`（或从模板复制到 `films/<name>`）。
2. 编辑 `films/<name>` 里的 `film.js`、`lines.json`、`audio.py` 等并预览。
3. 出片并打包：`sh tools/deliver.sh films/<name>`；模板也可用 `sh tools/deliver.sh templates/keynote`。
4. 从 `/workspace/video-deliveries/<日期>-<片名>/` 附加 `mp4`、字幕和海报到聊天；`READY.md` 列出绝对路径与大小。

交付分轨：**高清** = `out/<片名>.mp4` 原样复制（发布用）；**聊天预览** = `preview-chat.mp4`（H.264 Baseline、540p、24fps，按时长算码率目标 ≤约 3MB；生成失败不阻断高清，READY.md 写明原因）。文案交接页 `copy-handoff.md` 一并带上。

交付脚本会运行影片的 `build.sh`，然后收集 `out/*.mp4`、`out/*.srt`、`out/poster.jpg` 和 `out/copy*`。
