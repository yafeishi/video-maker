# 致谢与第三方许可

## Lemo-Opuscar（MIT）

本仓库的制作方法和部分管线代码参考、改写自 [lemomo-ai/lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar)（Copyright (c) 2026 LemoLab，MIT License）：

- `core/lib.js`（确定性随机、缓动、单调三次插值、包络）
- `core/render/` 的页面约定与逐帧渲染思路（`render(t)` 页面、每个 worker 一个浏览器、JPEG 管道进 ffmpeg、两遍 loudnorm）
- `docs/directing.md`、`docs/technique.md` 的导演与制作方法（中文改写、按本工作台调整）

原许可证文本：

```
MIT License

Copyright (c) 2026 LemoLab

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

工作台界面（`studio/`）、音频库（`core/audio/`）、中文配音与校对（`core/tts/`）、字体子集化、`core/build.sh` 和两个模板是本仓库自己写的。

## 字体（SIL Open Font License 1.1）

- Noto Sans SC（思源黑体）：`core/fonts/OFL-NotoSansSC.txt`。仓库里只提交按片裁剪的子集（`templates/*/fonts/NotoSansSC.woff2`），完整字体由 `setup.sh fonts` 从 Google Fonts 仓库下载。
- JetBrains Mono：`core/fonts/OFL-JetBrainsMono.txt`。

## 配音

`core/tts/tts_zh.py` 调用微软 Edge 在线语音（通过 [edge-tts](https://github.com/rany2/edge-tts)）。生成的音频用于商业用途前，请自行确认微软的服务条款；也可以换成自己的录音（把 wav 放进 `voices/`，并更新 `voices/dur.json`）。
