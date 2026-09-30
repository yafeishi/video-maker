# 技术手册

这里的每部片都是代码做的：没有视频生成，没有素材库画面。本页讲管线怎么搭、每个工具怎么用。配合[导演手册](directing.md)和一份 `STYLE.md` 使用。

```
时间线（唯一的事实来源：页面里的 SHOTS + lines.json + voices/dur.json）
   ├─► 画面：render(t) 网页 ──► 无头 Chrome 逐帧截图 ──► out/video.mp4
   ├─► 配音：lines.json ──► edge-tts 逐句合成 ──► 转写自检 ──► voices/*.wav + dur.json
   ├─► 事件：window.EV（音效、配音、镜头）──► events.json
   ├─► 配乐 + 拟音：audio.py 读 events.json ──► 混音
   └─► 字幕：window.CUES ──► out/<片名>.srt + 烧进画面
混音（压缩、闪避、平衡）──► ffmpeg 合成，两遍 loudnorm −14 LUFS ──► out/<片名>.mp4
```

## 1. 环境

| 工具 | 用途 |
|---|---|
| Node 20+ | 渲染与工作台：`npm install` 装 `playwright-core`、`three` |
| Chrome / Chromium | 无头渲染。自动找系统 Chrome；没有就 `sh setup.sh browser` 下载 headless shell；也可以用 `PLAYWRIGHT_CHROME=/path/to/chrome` 指定 |
| ffmpeg | 编码、合成、响度、黑帧检查 |
| Python 3.11+ | `sh setup.sh python` 建 `.venv` 并装 numpy、scipy、soundfile、pillow、fonttools、edge-tts、pypinyin |
| 可选 | `faster-whisper`（配音转写自检，首次运行会下载模型） |

`sh setup.sh` 一次装全，包括下载思源黑体（17 MB，OFL，不进 git）。

## 2. 画面是时间的函数

每部片是一个静态网页 `index.html` + `film.js`，暴露：

```js
window.DUR = 39.6;                 // 总时长（秒）
window.render = (t) => { ... };    // 画出第 t 秒的画面，必须是确定性的
window.READY = true;               // 字体、图片加载完之后置 true
window.EV = [{ t, type, ... }];    // 可选：音效 / 配音 / 镜头事件，给混音用
window.CUES = [{ t0, t1, text }];  // 可选：字幕
window.SHOTS = [{ id, t0, t1 }];   // 可选：镜头（工作台时间轴、配乐分段用）
window.POSTER = 32.2;              // 可选：海报取第几秒
```

规则：

- **确定性。** 不用 `Date.now()`，不用没有种子的 `Math.random()`（`core/lib.js` 有 `mulberry` 和 `hash`），不依赖上一帧的状态。任何一帧都能单独、按任意顺序、被任意一个 worker 渲出来。
- 2D 风格用 **Canvas 2D**；3D 用 **three.js**（`/node_modules/three/...`）；后期可以写 WebGL2 shader。
- 需要的时候**一拍两帧**（定格、像素、赛璐璐的 12 fps 感），但相机和光保持每帧平滑，否则看起来像卡顿。
- **一个世界 → 屏幕的函数。** 所有跟随主体的效果（光圈、变焦、聚光）都走它，不手写屏幕坐标。

页面里能直接用的路径：`/core/lib.js`、`/core/fonts/JetBrainsMono.woff2`、`/node_modules/three/build/three.module.js`。

### 时间线工具 `core/lib.js`

```js
import { layout, shotAt, ss, eo, spring, track } from '/core/lib.js';
const TL = layout(SHOTS, TEXT, VDUR, { quant: 2 * BEAT });
// SHOTS = [{ id, dur, lines: [{ id, at }] }]：每个镜头的最短时长和台词开口时间
// 配音比镜头长时自动撑开；quant 让镜头时长对齐到拍子；字幕时长 = max(1.8, 配音 + 0.6)
const { shot, lt } = shotAt(TL.shots, t);   // 当前镜头和镜头内时间
```

还有：`clamp lerp seg ss eio eo ei back spring`（缓动）、`monotone track`（不过冲的关键帧插值）、`env`（区间包络）、`mulberry hash vnoise`（确定性随机）。

## 3. 渲染

```sh
node core/render/still.mjs <片> 1.5 12 --range 0:40:2    # 静帧（页面报错立即退出）
node core/render/video.mjs <片> --fps 24 --workers 3      # 全部帧 → <片>/out/video.mp4
node core/render/events.mjs <片>                          # DUR / EV / CUES / SHOTS → <片>/events.json
.venv/bin/python core/render/sheet.py out.jpg a.jpg b.jpg --cols 5   # 联系表
.venv/bin/python core/render/srt.py <片>/events.json out.srt         # 字幕
sh core/render/mux.sh video.mp4 mix.wav out.mp4 24 1                 # 合成 + 两遍 loudnorm；最后一个参数是颗粒
sh core/render/check.sh out.mp4                                      # 时长 / 响度 / 黑帧
```

快的原因：**JPEG 截图**（比 PNG 快约 8 倍），**每个 worker 一个浏览器**（同一个浏览器里的多个页面几乎不并行），**颗粒在 ffmpeg 里加**而不是画在页面里（颗粒让每帧都难压缩）。示例片 950 帧，4 核机器 3 个 worker 约 45 秒。

## 4. 一键出片 `core/build.sh`

每部片的 `build.sh` 只是调用它。步骤：`fonts voice events srt audio video mux poster check`，默认全跑，也可以只跑几步：

```sh
sh films/<片>/build.sh                         # 全部
sh films/<片>/build.sh events audio mux        # 只改了配乐
sh films/<片>/build.sh events srt video mux poster   # 只改了画面
FPS=30 WORKERS=4 GRAIN=0 sh films/<片>/build.sh
```

## 5. 配音

- **TTS 只是默认。** 用户有录音或指定声音就用用户的：把 `<id>.wav` 放进 `voices/`，更新 `voices/dur.json`（或者删掉 `.cache.json` 里对应的项，让脚本只测时长）。
- `core/tts/tts_zh.py lines.json voices/`：edge-tts（需联网），逐句输出 48 kHz wav，去掉首尾静音，写 `dur.json`；文本和参数没变的句子不重新合成。
  - 顶层 `voice` / `rate` / `pitch` 是默认值，每句可以覆盖。
  - `text` 是字幕，`say` 是朗读文本：数字、英文字母、多音字在 `say` 里写成要读的样子，字幕里照常写。
  - 常用声音：`zh-CN-YunxiNeural`（男，叙述）、`zh-CN-XiaoxiaoNeural`（女，温暖）、`zh-CN-YunjianNeural`（男，浑厚）、`zh-CN-XiaoyiNeural`（女，活泼）、`en-US-AndrewNeural`、`en-US-AvaNeural`。
- **检查每一句**：
  - `core/tts/asr_check.py lines.json voices/`：干声逐句转写，按无声调拼音比较（同音字不算错），输出逐词时间戳 `words.json`；
  - `core/tts/asr_mix.py out/mix.wav events.json`：在**成片混音**里截出每句再转写，发现被音乐或音效盖住的句子。
- **混音前**：TTS 峰均比高，先压缩，再按 RMS 平衡：配音比音乐高约 10 dB。

## 6. 配乐

照音乐提示表写原创配乐，别总用钢琴加弦乐。`core/audio/synth.py`：

```python
from core.audio import synth as S
S.chord('Am9', 3)          # → MIDI 列表
S.pad(notes, dur, v, bright)   # 和弦垫
S.bass(m, dur, v, body)        # 贝斯：body 越小基频越轻
S.pluck(m, dur)                # 拨弦（Karplus–Strong）
S.bell(m, dur)                 # FM 钟琴
S.kick() S.snare() S.clap() S.hat(open_=True)
```

写法：按拍循环，用 `events.json` 里的 `shots` 判断这一拍在哪个镜头，决定用哪些乐器（见 `templates/keynote/audio.py`）。

- **低频要平衡。** 合成配乐很容易低频过重。`mix.band_report()` 打印各频段能量；20–60 Hz 不应该是最响的一段。和弦垫不要低于 MIDI 48，贝斯靠 2、3 次谐波出声，总线加 35–40 Hz 高通。

## 7. 拟音与混音

- `core/audio/sfx.py` 程序化合成：`tick key whoosh riser thump boom ding glitch shutter pop`，以及 `room`（底噪床）。页面 `EV` 里写 `{ t, type: 'sfx', name: 'whoosh', gain, pan, d }`，`sfx.make(name, d=...)` 直接对上。
- `core/audio/mix.py`：`Bus(dur).add(x, at, gain, pan)`、`compress`、`limit`、`duck_curve(spans, dur, depth_db)`（音乐闪避曲线）、`band_report`、`write`。
- 三层：底噪、拟音、音乐。配音和关键拟音下压低音乐。安排好安静的地方。
- 最终响度交给 `mux.sh`：两遍 loudnorm 到 −14 LUFS，真峰值 −1.2 dB。

## 8. 字幕与字体

- 字幕设计是风格的一部分：在页面里画（烧进画面），同时从 `window.CUES` 导出 `.srt`。
- 中文字体按片子用字裁剪：`core/fonts/subset.py <片>` 扫描片子里 `.js/.json/.html` 出现的所有字，把思源黑体裁成几十 KB 的 woff2。改了文案要重跑（`build.sh` 的 `fonts` 步骤）。

## 9. 审片

1. 工作台里拖时间轴、逐帧看，带声音全速播放。
2. 联系表：每 1–2 秒一帧（工作台「联系表」按钮，或 `still.mjs --range` + `sheet.py`），至少完整看两遍。
3. 关键动作（交接、摔倒、击打）看 0.2 s 间隔的逐格。
4. 成片：`check.sh`（响度、黑帧），`asr_mix.py`（配音可懂度）。
5. 带声音完整看一遍。

## 10. 素材与署名

只用 CC0、CC BY 或 OFL 的素材，每一项写进片子的 `CREDITS`，注明来源和许可。字体放在片子自己的 `fonts/` 里，中文字体裁剪子集。

## 11. 结尾互动 `core/cta.js`

两个模板都已接好：影片的 `lines.json` 里有 `"cta"` 块就在片尾多一个 `cta` 镜头，删掉就没有。新建时打开：`sh tools/new-film.sh keynote my-film --cta`，或工作台「新建影片」里勾选「结尾互动」；已有的片：`node tools/add-cta.mjs films/my-film`。

```json
{
  "cta": {
    "question": "你记忆最深的一次阅兵",
    "options": [{ "label": "1984", "mark": "dot" }, { "label": "2015", "mark": "ring" }],
    "legend": [{ "mark": "dot", "label": "国庆阅兵" }, { "mark": "ring", "label": "九三阅兵" }],
    "placeholder": "写下你的阅兵记忆和感想",
    "typed": "我记得那一年……",
    "button": "评论",
    "footer": "评论区见"
  },
  "lines": [
    { "id": "cta1", "text": "你记忆最深的，是哪一次阅兵？" },
    { "id": "cta2", "text": "有什么感想？在评论区和我们聊聊吧。" }
  ]
}
```

- `options` 可以为空，最多约 6 个；`mark` 是 `dot`（实心强调色）、`ring`（空心）或不写。纯数字标签用等宽字体。
- 镜头时长和每个动作的时间（选项弹出、评论框升起、打字、按钮亮起）都按 `cta1` / `cta2` 的配音时长比例算，改台词不用改代码。
- 音效（嗖、弹出、按键、铃）由 `CTA.events(sfx)` 加进 `EV`，混音时和其他音效一样处理。
- 自己写的 `film.js` 要接上它：`makeCTA(linesDoc.cta, { beat, voiceDur, text, style })` → `SHOTS.push(CTA.shot)` → 排好时间线后 `CTA.bind(TL)`、`CTA.events(sfx)` → `DRAW.cta` 里画背景、设相机，再 `CTA.draw(g, lt, s)`。参照 `templates/keynote/film.js`。
