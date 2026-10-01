# video-maker · 视频工作台

用代码导演和渲染短片。每部片是一个网页：`render(t)` 画出第 t 秒的画面，无头 Chrome 逐帧截图；配音、配乐、拟音、字幕都跟着同一条时间线，最后 ffmpeg 出片。附一个浏览器里的**工作台**：选片、实时预览、拖时间轴、一键渲染、看日志、播成片。

![工作台](docs/studio.jpg)

示例片《一帧一行》（`templates/keynote`，约 40 秒，暗色发布会风格），用这个工作台讲这个工作台：

![《一帧一行》海报](templates/keynote/poster.jpg)

## 快速开始

需要 Node 20+、Python 3.11+、ffmpeg，以及 Chrome / Chromium（没有的话 `setup.sh` 会下载 headless 版本）。

```sh
sh setup.sh              # 装 Node 包、Python venv、思源黑体、浏览器
npm run studio           # 打开 http://127.0.0.1:4400
```

在工作台里：

1. 左边选「一帧一行」模板，空格播放、拖时间轴、←/→ 逐帧。
2. 点右上角「新建影片」，从模板复制一份到 `films/<片名>/`。可以顺手填简报（一句话内容、线路、风格、时长、受众、平台、可选片尾 CTA），写入 `films/<片名>/brief.json`。
3. 改画面和台词仍靠 `film.js`、`lines.json`、`audio.py`，或直接跟 Bot 说。保存后预览自动刷新。简报只记意图，不会自动生成成片；要改的话打开这部片的「简报」页保存。
4. 「渲染」页点「一键出片」，看日志；完成后在「成片」页播放、下载 mp4 / srt。

命令行也一样：

```sh
sh tools/new-film.sh keynote my-launch      # 新建
sh films/my-launch/build.sh                 # 一键出片 → films/my-launch/out/my-launch.mp4
sh films/my-launch/build.sh events audio mux    # 只重混音
```

## 让 Agent 帮你做片

在这个仓库里打开 Cursor / Claude Code 等 Agent，说题目就行，例如：

> 用暗色发布会风格，给我们的开源项目做一支 40 秒的介绍片，中文配音。

Agent 会按 [`AGENTS.md`](AGENTS.md) 的流程工作：问一次问题 → 写分镜本 → 渲风格帧自检 → 配音、配乐、动画、混音 → 出片 → 自检后交付。

## 目录

| 路径 | 内容 |
|---|---|
| `studio/` | 工作台：`server.mjs`（静态服务 + 任务 API + 文件监听）、`index.html` / `app.js` / `studio.css` |
| `core/lib.js` | 页面用的缓动、插值、确定性随机、时间线排布 `layout()` |
| `core/render/` | 静帧、逐帧视频、事件导出、联系表、字幕、合成、成片检查 |
| `core/build.sh` | 一键出片流程（fonts → voice → events → srt → audio → video → mux → poster → check） |
| `core/tts/` | 中文配音（edge-tts）、干声与成片混音的转写自检 |
| `core/audio/` | 程序化拟音 `sfx.py`、配乐合成器 `synth.py`、混音 `mix.py` |
| `core/fonts/` | JetBrains Mono、按片裁剪思源黑体的 `subset.py` |
| `templates/keynote/` | 暗色发布会风格 + 示例片《一帧一行》（`STYLE.md`、`TREATMENT.md`） |
| `templates/blank/` | 空白骨架，从这里写新风格 |
| `films/` | 你的影片（默认不进 git） |
| `docs/` | [导演手册](docs/directing.md)、[技术手册](docs/technique.md) |

## 页面约定

```js
window.DUR = 39.6;                    // 总时长（秒）
window.render = t => { /* 画第 t 秒，确定性 */ };
window.READY = true;                  // 资源加载完
window.EV = [{ t, type: 'sfx', name: 'whoosh' }, { t, type: 'voice', id: 'l1' }];  // 可选：给混音
window.CUES = [{ t0, t1, text }];     // 可选：字幕
window.SHOTS = [{ id, t0, t1 }];      // 可选：镜头（时间轴、配乐分段）
```

详见[技术手册](docs/technique.md)。

## 致谢

制作方法和部分渲染管线参考、改写自 [lemomo-ai/lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar)（MIT）。详见 [`NOTICE.md`](NOTICE.md)。

MIT License。
