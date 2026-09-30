# 给 Agent 的说明

这个仓库是一个**视频工作台**。代码片是暴露 `render(t)` 的网页，无头 Chrome 逐帧截图，配音、配乐、拟音和字幕由同一条时间线驱动，最后 ffmpeg 出片。素材片（`film.json` 里 `kind: "footage"`）不画帧，走 `core/edit/`：本地做镜头检测和组装，**看画面、写节拍的是你**。`studio/` 是浏览器里的预览与渲染界面。

用户打开 Agent，给一个题目（有时指定模板或风格），你的工作是**导演并做出这部片**。

## 先读

1. [`docs/directing.md`](docs/directing.md)：怎么导（故事、声音、节奏、镜头、表演、自检）。
2. [`docs/technique.md`](docs/technique.md)：怎么做（页面约定、渲染、配音、配乐、混音、审片）。
3. 选定模板的 `templates/<模板>/STYLE.md`。§1–§8 定义风格，§9 讲示例片怎么做的。示例片是参考实现：学它的技法、复用它的代码，但不要照搬它的故事。

**风格是固定的，内容是用户的。** 从 `STYLE.md` 保留画面、运动与镜头语言、声音与配乐、导演手法。内容来自用户的题目：故事和结构、角色、场景、数据和图表形式。`STYLE.md` 里很多选择是为示例片的故事做的；不适合用户题目时就用适合的，不要把题目掰成示例片的样子。

## 模板

| 模板 | 风格 | 适合 |
|---|---|---|
| `keynote` | 暗色发布会：黑底大字、一种强调色、代码与数据图形 | 产品发布、技术讲解、开源项目介绍、数据回顾 |
| `blank` | 空白骨架：三个镜头、一句配音、一层和弦垫 | 自己从头写一种新风格 |
| `footage-demo` | 素材剪辑：镜头检测、节拍、ffmpeg 组装，默认横屏 | 用户带来的 mp4/mov。不是 render(t) |

用户要的风格不在表里、又是要「画」出来的片子时：从 `blank` 开始，先写一份新的 `STYLE.md`（按 `templates/keynote/STYLE.md` 的 §1–§9 结构），再做片。用户拿来的是视频文件时，走下面的素材片，不要改成 render(t)。

## 素材片

用户给的是 mp4 / mov，或明确说要用素材剪辑时，用 `footage-demo`，不要写 `film.js`。细节在 [`docs/footage.md`](docs/footage.md)。

1. `sh tools/new-film.sh footage-demo <片名>`。真素材放进 `films/<片名>/raw/`（先删掉示例色块）。没有素材时，`build.sh` 会生成色块小样，只能用来跑通流程。
2. 本地先检测：`node core/edit/run.mjs films/<片名> ingest shots frames`。这一步零模型。
3. **你来看** `edit/frames/` 和 `edit/shots.json`，写 `edit/beats.json`：每条有 `shot`、`who`、`what`、`emotion`、`role`（起/承/转/合）、`keep`。`source` 必须是 `"bot"`。需要自己定剪辑点就再写 `edit/timeline.json`，口播写 `lines.json`，`source` 同样是 `"bot"`。
4. `node core/edit/run.mjs films/<片名> voice assemble copy check`。成片在 `out/<片名>.mp4`，旁边有 srt、海报和发布文案。
5. 没看画面就不要假装看过。来不及写节拍时可以跑完整 `build.sh`，那是时长/动静启发式（`source: "fallback"`），交付时要说明。

标成 `bot` 或 `human` 的 beats / timeline / lines，重跑不会覆盖。不要设 `FORCE=1`，除非用户要推倒重来。默认横屏 1920×1080。竖屏只改 `film.json` 的宽高还不够用，安全区还没做，先跟用户说。

## 工作流程

1. **接需求**：确认风格和题目清楚后，**一次、在一条消息里**问完（docs/directing.md §1）：你没法自己决定的事实；用户有没有自己的素材（录音、指定声音、音乐、照片、标志、字体）；要不要先看分镜（默认不要）。需求里已经回答的别问。等回复后用几行话总结需求，开工，之后不再追问。
2. **建片**：`sh tools/new-film.sh <模板> <片名>` → `films/<片名>/`。片名用小写字母、数字和连字符。
3. **分镜本**：写 `films/<片名>/TREATMENT.md`（docs/directing.md §4）。
4. **画面**：改 `film.js` 的 `SHOTS` 和绘制函数，改 `lines.json` 的台词；用真实代码渲风格帧，自己对照 `STYLE.md` 检查。
5. **分镜（仅当用户要求）**：渲 6–9 个关键镜头拼成联系表，发给用户，**停下来等确认**。用户没要就不要停。
6. **制作**：配音 → 检查 → 配乐（`audio.py`）→ 动画 → 混音 → 渲染。一键：`sh films/<片名>/build.sh`。
7. **自检**（docs/directing.md §11），然后交付：`films/<片名>/out/<片名>.mp4`、`.srt`、`poster.jpg`、`TREATMENT.md`、发布文案 `out/copy-*.md`（需要英文或固定话题时写 `publish.json`），以及能一条命令重建的源码。

用自己的语言向用户汇报进度（用户用中文就用中文）。片子里的语言按用户要求，默认用用户写字的语言。

## 放哪里

- 只在 `films/<片名>/` 里工作（默认不进 git；用户要提交某部片时，在 `.gitignore` 里加例外）。
- `core/` 是共用工具（渲染、配音、音效、合成器、混音、字体裁剪），`templates/` 是模板。为某部片改需求时不要改 `core/` 或 `templates/`；确实要改通用工具时，单独说明并保持向后兼容。
- 不要杀不是你启动的进程，不要留下后台进程。工作台（`npm run studio`）由用户自己开关。

## 常用命令

```sh
sh setup.sh                                  # 装依赖（Node 包、Python venv、字体、浏览器）
npm run studio                               # 工作台 → http://127.0.0.1:4400
sh tools/new-film.sh keynote my-film         # 新建影片
node core/render/still.mjs films/my-film 3.5 12        # 静帧
sh films/my-film/build.sh                    # 一键出片
sh films/my-film/build.sh events audio mux   # 只重混音
node core/edit/run.mjs films/my-footage ingest shots frames   # 素材片：检测并抽帧，停下来写 beats
sh films/my-footage/build.sh                 # 素材片一键出片（kind: footage）
.venv/bin/python core/tts/asr_mix.py films/my-film/out/mix.wav films/my-film/events.json   # 成片配音检查
```
