# 素材成片

代码片是 `render(t)` 一帧帧画出来的。素材片是把 `raw/` 里已有的视频剪成一条有起承转合的短片。两边都在这个工作台里，成片和发布文案走同一套 `out/`。

默认出 **横屏 1920×1080**。`film.json` 里的 `width` / `height` 会传给组装（缩放并补边）。竖屏 1080×1920 可以改这两个数先跑起来，安全区、字幕位置和封面裁切还没单独做。

理解画面的是 **Bot（盒子上的 Grok）**，不是仓库里的第三方模型，也不需要 OpenAI 一类的 key。本地只跑 ffmpeg、edge-tts 和确定性的启发式。

## 目录

```
films/<片名>/
  film.json          kind 必须是 "footage"
  raw/               mp4 / mov / m4v
  edit/shots.json    镜头（本地检测）
  edit/beats.json    节拍（Bot 写，或 fallback）
  edit/timeline.json 时间线（可手改）
  edit/frames/       每个镜头 1–3 张中间帧
  lines.json         旁白
  voices/            edge-tts
  out/               mp4、srt、poster、copy.json
```

示例在 `templates/footage-demo/`。`raw/` 空着的时候，`build.sh` 会用 ffmpeg 生成约 96 秒色块和蜂鸣。真素材这样开始：

```sh
sh tools/new-film.sh footage-demo my-footage
rm -f films/my-footage/raw/*.mp4
# 把手机里的视频放进 films/my-footage/raw/
sh films/my-footage/build.sh
```

## 谁做什么

| 步骤 | 谁 | 做什么 |
|---|---|---|
| `ingest` | 本地 | ffprobe 清点 `raw/` → `edit/ingest.json` |
| `shots` | 本地 | ffmpeg 的 scene 分数找切点，静音长了再切开 → `edit/shots.json`。不看懂画面 |
| `frames` | 本地 | 每镜抽 1–3 张中间帧到 `edit/frames/` |
| `beats` | **Bot** | 看帧和镜头表，写 who / what / emotion / role / keep |
| `timeline` | Bot 或本地规划 | 选 6–12 段，排成起承转合，目标 60–120 秒 |
| `lines` | **Bot** | 中文口播，写进 `lines.json` |
| `voice` | 本地 | 现有的 edge-tts |
| `assemble` | 本地 | ffmpeg 切、轻叠化、旁白压在原声上、响度、横屏成片 |
| `copy` `check` | 本地 | 和代码片一样的发布文案、成片检查 |

没有 Bot 时，`beats` / `timeline` / `lines` 会用时长和动静打分，按镜头顺序摊成起承转合（`source: "fallback"`）。这条是为了没有模型也能出片、CI 能跑，不是看过画面的故事。

## Bot 怎么交接

1. 先跑本地检测和抽帧：

```sh
node core/edit/run.mjs films/my-footage ingest shots frames
```

2. 看 `edit/frames/` 和 `edit/shots.json`。为每个要用的镜头写 `edit/beats.json`。**`source` 写成 `"bot"`**，否则下次构建会用启发式覆盖。

```json
{
  "version": 1,
  "source": "bot",
  "logline": "一句话故事",
  "beats": [
    {
      "id": "b01",
      "shot": "s01",
      "who": "老人",
      "what": "把杯子放下，没说话",
      "emotion": "沉",
      "role": "起",
      "keep": true,
      "note": ""
    }
  ]
}
```

`role` 只能是 `起` / `承` / `转` / `合`。`keep: false` 的镜头不会进时间线。`shot` 必须是 `shots.json` 里的 id。

3. 可以让本地按这些节拍排时间线，也可以自己写 `edit/timeline.json`（`source` 同样设为 `"bot"` 或 `"human"`）：

```json
{
  "version": 1,
  "source": "bot",
  "width": 1920,
  "height": 1080,
  "fps": 24,
  "transition": { "cut": 0.12, "role": 0.45 },
  "segments": [
    { "id": "c01", "shot": "s03", "src": "raw/a.mp4", "in": 1.2, "out": 7.4, "role": "起", "vo": "l01" }
  ]
}
```

`src` 必须是这部片目录里的 mp4 / mov / m4v，不能写成目录外面的路径。`in` / `out` 是素材上的秒。`t0` / `t1` 如果有，只是规划用的成片时间，组装时会按真实片段重算，结果在 `edit/assembly.json`。同一角色内部是很短的叠化（`cut`），角色换段时稍长（`role`）。

4. 口播写 `lines.json`，`source` 设为 `"bot"`。`id` 只能用字母、数字、下划线和连字符。`segment` 对上时间线的 `id`，可选 `at`（相对这段开头的秒）。

```json
{
  "source": "bot",
  "voice": "zh-CN-YunxiNeural",
  "rate": "-6%",
  "lines": [
    { "id": "l01", "segment": "c01", "text": "他放下杯子，没说话。" }
  ]
}
```

5. 配音并出片：

```sh
node core/edit/run.mjs films/my-footage voice assemble copy check
```

`FORCE=1` 会覆盖已经标成 bot / human 的节拍、时间线和台词。平常不要加。

## 命令

```sh
node core/edit/run.mjs films/my-footage                 # 全流程
node core/edit/run.mjs films/my-footage shots frames   # 只做到抽帧，停下来给 Bot
sh films/my-footage/build.sh                           # 同上，raw 空着会先做色块小样
```

工作台里选中素材片后，「素材」页可以分步跑，「渲染」里的「一键出片」跑全流程。成片和发布页跟代码片一样。

代码片不要走这条流水线。素材片的 `build.sh` 调的是 `core/edit/run.mjs`，不会去逐帧渲染。
