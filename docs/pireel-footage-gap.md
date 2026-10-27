# Pireel → video-maker 素材成片改造清单

对照对象：

- [pireel/pireel](https://github.com/pireel/pireel)（README / README.zh-CN，本地 OSS，**AGPL-3.0**）
- [pireel.com/connect-agent.md](https://pireel.com/connect-agent.md) + [pireel/pireel-agent](https://github.com/pireel/pireel-agent)（插件 **Apache-2.0**，连在线 Studio MCP）
- 我们素材 P1：PR [#4](https://github.com/yafeishi/video-maker/pull/4)（分支 `cursor/footage-story-edit-8439`，`docs/footage.md` + `core/edit/*`）

原则：**不整仓换成 Pireel，不拷 AGPL 源码**；只吸收交互/剪辑思路与 Skill 级工作流，落到我们已有的 JSON + ffmpeg 组装路径。本机试跑开源 Pireel 只验证交互，改造仍写进 `video-maker`。

当前工作台分支 `cursor/video-workbench-0c1b` **尚无** `core/edit/`（本地未合入 PR#4）。下文「接到哪个文件」均指 PR#4 合入后的路径。

---

## 1. Pireel 能力摘要

### 1.1 本地开源版（`pireel` monorepo）

| 项 | 说明 |
|---|---|
| 形态 | 浏览器原生 Studio（`apps/studio-oss` + `packages/studio-engine` / `studio-ui` / `studio-frames` / `studio-kit`） |
| 能做什么 | 画布 + 多轨时间线；多视频/图片/音频；字幕、图形、叠层；同一项目多个可独立编辑的 **output**；本地预览与导出；公开编辑 **Skills** 与视觉 **Frames** |
| 场景 Skill（引擎内） | `talking-head-edit`、`montage-edit`、`audio-and-music`（playbook，不是可执行管线） |
| 没有什么 | **内置 Chat**、云端媒体库、生产环境 MCP、付费生成/转写管线（这些在 pireel.com） |
| 许可证 | **AGPL-3.0-only** → 参考思路与交互即可，**禁止**把其源码并入本仓库 |

运行（仅试跑）：`pnpm install && pnpm dev`。仓库已可放在 `/workspace/pireel` 供对照，不作为依赖。

### 1.2 在线 + Agent（`pireel.com` / `pireel-agent`）

| 项 | 说明 |
|---|---|
| 连接 | MCP：`https://pireel.com/api/studio/mcp`（OAuth）；`npx skills add pireel/pireel-agent` 或 Codex/Claude Plugin |
| 编辑模型 | **Project → output → typed tracks → clips**；两套时钟（源素材秒 vs 时间线帧）；`get_state` 一次 + mutation delta |
| 典型工具 | `get_state`、`import_media`、`get_transcript`、`inspect_media` / `inspect_timeline`、`add_clips` / `split_clips` / `ripple_delete_ranges`、`remove_words` / `mask_words`、`set_captions`、`set_clip_framing`、`set_texts` / `compose_component`、`export`、`manage_project` |
| 场景（接入指南点名） | talking-head、long-to-shorts、montage、batch-remix、commerce-video、product-demo |
| 计费 | Agent 编排与 BYO 文本/HTML **烧用户自己的 Agent 订阅**；Pireel 积分只用于媒体生成、转写、视觉语义分析等标了计费的管线 |
| 许可证 | Agent 插件 Apache-2.0；**默认不要**把本工作台接到 pireel.com 计费能力 |

对我们有参考价值的是：**Skill 文案里的剪辑判断**（主题手势、安全区、字幕/口播分层、音乐床电平、多版本假设），不是 MCP 工具本身。

---

## 2. 与我们 footage P1 对照表

我们 P1 流程（PR#4）：`raw/` → `ingest` → `shots`（ffmpeg scene/silence）→ `frames` → `beats`（Bot 或 fallback）→ `timeline`（60–120s 起承转合，6–12 段）→ `lines` → edge-tts → `assemble`（切 / 轻叠化 / 旁白压原声 / 响度 / 横屏）→ `copy` / `check`。  
Bot 写 `edit/beats.json`、`edit/timeline.json`、`lines.json`，`source: "bot"|"human"` 则重跑不覆盖。仓库内**零第三方 LLM API**。

| 能力 | Pireel（开源 / 在线） | 我们 footage P1 | 差距 |
|---|---|---|---|
| 镜头切分 | 浏览器几何分析 / Agent `inspect_media`；口播可用 ASR + `remove_silence` | ffmpeg scene + 长静音再切 → `edit/shots.json` | 我们够用；缺「语义选镜」、缺说话人句级切点 |
| 画面理解 | 在线 `inspect_media` semantic/editorial（计费）；开源靠人手/外挂 Agent | Bot 看 `edit/frames/` 写 beats；fallback 只看时长/动静 | 机制已对齐「人/Bot 写 JSON」；缺 Skill 级选镜/主题手势约定 |
| 故事结构 | montage：主题手势 + 原生结构；口播：论证弧 | 固定配额 **起承转合** + `target.min/max` | 有骨架；缺「结构可随素材变」、缺 hook/多假设 |
| 时间线模型 | 多轨（primary / broll / graphics / narration / music / sfx / caption）+ 多 output | **单条画面段序列** + 旁白轨混进 `assemble`；`timeline.segments[]` | 无 B-roll/花字轨、无独立 music 段、无多成片 output |
| 旁白 / 字幕 | 源片 ASR 字幕层（18 presets、`yPct`/`scale`）；另可生成旁白 | 中文 **配音旁白** → `lines.json` + edge-tts；`core/render/srt.py` 出 srt（旁白轴，非源片说话字幕） | 缺源片口播清理；缺竖屏安全区字幕位；无逐词花字 |
| 画幅 / 安全区 | `set_canvas`、framing、caption `yPct`、Skill 强调 safe areas | `film.json` width/height → scale+pad；**竖屏安全区/字幕位/封面裁切未做**（PR 正文已声明） | **明确缺口** |
| 音乐与混音 | music lane、电平、fade、可选 `get_beat_grid`、计费生成乐 | 原声床 + 旁白处 duck；无独立音乐床 JSON | 可吸收「床轨电平约定」到 assemble，不接生成乐 |
| Agent 交接 | 在线 MCP 实时改时间线；Skill 路由 | 停在 `shots/frames` 后改 JSON，再 `voice assemble` | 我们保持 JSON 交接即可；可补 Bot 操作清单（Skill 风格） |
| 工作台 UI | 完整 NLE 画布 | Studio「素材」页：抽帧条 + 时间线摘要 + 分步跑 | 够用；不追求对标完整时间线编辑器 |
| 发布 | Studio export | 同一套 `out/` + `core/publish/copy.mjs` | 无差距（保持） |

---

## 3. 建议吸收：P0 / P1 / P2

每条均为 **自研**，接到现有 JSON / 组装路径；**禁止**引入 Pireel AGPL 代码或默认开通 pireel.com 计费 MCP。

### P0（先做，≤3）

#### P0-1 竖屏画幅 + 安全区 + 字幕/封面位置

> **状态（2026-10-27）：部分完成。** 已做：竖屏自动安全区（12/14/5%）、`film.json` `safe`/`caption.yPct`、scale+pad 进安全框、events 记 safe/caption、横屏不变。未做：素材片字幕烧录、poster 取景避让；主体裁切已做（见 P1-1）；尚未用真 1080×1920 素材片全链路验收。

- **目标**：`1080×1920`（及常见竖屏）成片时，画面裁切/补边、旁白字幕烧录或 srt 风格位置、`poster.jpg` 取景避开刘海与底栏操作区。
- **接到**：`film.json`（`width`/`height`，可选 `safe` / `caption` 字段）；`core/edit/assemble.mjs`（scale/pad 或 center-crop 策略）；`core/render/srt.py` 或 assemble 内字幕竖排参数；`docs/footage.md`。
- **不引入 AGPL**：自己定安全区百分比（可参考业界常见上下约 10–15%，以我们审片为准），不抄 Pireel caption preset 实现。
- **验收**：`film.json` 设 1080×1920 跑通 `assemble`；成片分辨率正确；联系表/静帧可见字幕落在安全区内；横屏默认行为不变。

#### P0-2 Bot「蒙太奇/实拍故事」交接 Skill（写进 docs，改 JSON 约定）

- **目标**：吸收 Pireel `montage-edit` 的判断顺序——先定 **主题手势 / 情绪终点 / 必出镜**，再选 keep 与 role——落到我们已有 `beats.json` / `timeline.json` / `lines.json`，避免 Bot 只填「起承转合」空壳。
- **接到**：新建 `docs/footage-bot.md`（或扩写 `docs/footage.md`「Bot 怎么交接」）；可选扩展 `beats` 字段：`motif`、`gesture`（logline 旁）、`keep` 理由；**不改**无 Bot 时的 fallback 也能出片。
- **不引入 AGPL**：用中文重写操作清单；不嵌 Pireel Skill 原文大段、不依赖其工具名。
- **验收**：Bot 按文档写出 `source:"bot"` 的三份 JSON；`FORCE` 未设时重跑不覆盖；色块 demo 与真素材各至少一条叙事比 fallback 更可读（人工看 logline + 成片）。

#### P0-3 时间线可选「音乐床」段 + 组装电平

- **目标**：吸收 `audio-and-music` 的混音纪律（床轨低于人声、首尾 fade、不长于画面），让实拍片可加一条本地 `music/` 或 `raw/` 音频，而不是只靠原声。
- **接到**：`edit/timeline.json` 增加可选 `music: { src, in, out, volumeDb, fades }`（或同级 `audioBeds[]`）；`core/edit/assemble.mjs` 混音链；`docs/footage.md` 字段说明。
- **不引入 AGPL**：电平数字自定（建议旁白段床轨约 −18～−12 dB 相对）；**不**接 Pireel `generate_audio`。
- **验收**：无 `music` 字段时行为与现 P1 一致；有字段时成片可听清旁白、床轨不拖尾；`edit.test.mjs` 覆盖校验。

### P1（合入 P0 后）

| ID | 目标 | 接到 | 验收 |
|---|---|---|---|
| P1-1 | 竖屏「主体 reframing」：按镜头选 crop（脸/主体偏上），而不仅是 letterbox | `timeline.segments[].crop` 或 `framing`；`assemble.mjs` | 同一 raw 横竖各一版，竖版主体不贴边 | **✅ 2026-10-27 已做**：`core/edit/reframe.mjs` + `detect_subject.py`（MediaPipe 人脸），`framing: auto/letterbox/{crop}`，失败回退 letterbox；无脸主体仍待做 |
| P1-2 | 多版本 output 假设：同一 `beats` 导出 2 条 timeline（不同 hook / 时长） | `edit/timeline.json` 允许多文件或 `variants[]`；`run.mjs` 参数；Studio 素材页切换 | 两条成片时长/开场不同，共用 shots/frames |
| P1-3 | 源片口播清理路径（可选）：对「讲话为主」的 raw 做本地静音/句级切，写入 shots 或旁路 `edit/speech.json` | `shots.mjs` 或新步骤；**本地** ffmpeg/whisper 自选，默认关闭 | 口播样片去大段死气后仍能进起承转合；纯画面素材不受影响 |
| P1-4 | 字幕样式档位（2～3 档：纪录片整句 / 口播强调），竖屏 `yPct` | assemble 或后处理烧录；`film.json.captionPreset` | 切换档位可复现；不引入 18 套 Pireel preset |

### P2（有余力）

| ID | 目标 | 接到 | 说明 |
|---|---|---|---|
| P2-1 | B-roll / 叠画轨（次要画面短暂盖在主段上） | `timeline.segments` 或并行 `overlays[]`；assemble | 仍单文件成片，不做完整 NLE |
| P2-2 | 花字/标题条（短文本叠层，非 ASR 字幕） | `lines.json` 扩展或 `edit/titles.json`；ffmpeg drawtext / 已有字体管线 | 对标「set_texts」意图，自研 |
| P2-3 | 音乐节拍辅助切点（本地 onset，非云端） | 可选写入 `edit/beats.json` note 或 timeline 建议 in/out | 参考 `get_beat_grid` 想法，用开源 onset 库即可 |
| P2-4 | Studio 素材页：可拖拽调 segment in/out 写回 `timeline.json` | `studio/app.js` + `server.mjs` | 交互可对照 OSS Studio，实现保持轻量 |

---

## 4. 明确不做什么

1. **不 fork / 不 vendoring 整套 Pireel 编辑器**（AGPL；产品形态也是 NLE，与我们「JSON + 组装」工作台不同）。
2. **不默认接入 pireel.com MCP / OAuth / 云媒体 / 计费转写与生成**；个人试用账号与本仓库 CI、Bot 出片路径隔离。
3. **不把代码片管线**（`film.js` + `render(t)`）改成 Pireel 时间线；代码片与素材片继续分 `kind`。
4. **不把 Agent 插件原文大段拷进仓库**当正式文档（Apache 下可引用思路，但我们用自写中文交接说明）。
5. **不追求**对等：多轨图形组件系统、18 套 caption preset、Motion Graphic BYO、批量电商 Remix——除非未来产品明确要，再单开需求。

---

## 5. 与「本机试跑开源 Pireel」的关系

| | 本机试跑 `/workspace/pireel` | 改造落地 |
|---|---|---|
| 目的 | 感受画布、多 output、字幕/安全区、Frames 交互 | 改 `video-maker` 的 `core/edit/*`、JSON schema、Studio 素材页、`docs/footage*.md` |
| 依赖 | 可 `pnpm dev`，**不**加入 `package.json` | 继续 Node + ffmpeg + edge-tts，零强制 LLM API |
| 产出 | 体验笔记、截图、交互参考 | 本清单中的 P0/P1 PR |
| 许可 | 本地使用遵守 AGPL 义务；**衍生编辑器若分发需 AGPL** | 我们只吸收想法，自研实现，仓库许可策略不变 |

结论：**试跑不能替代合入 PR#4**；也**不能**把试跑里的代码贴进本仓。

---

## 6. 开工前置

| 问题 | 结论 |
|---|---|
| PR#4 是否必须先合才能开工？ | **是（对实现类改造）**。当前分支无 `core/edit/`，P0 均挂在 `run.mjs` / `assemble.mjs` / `timeline.json` / `docs/footage.md` 上。文档类（本清单、Bot 交接草稿）可先写；改组装与 schema 应基于已合入的 footage P1，或在 `cursor/footage-story-edit-8439` 上继续开 PR。 |
| 与代码片冲突？ | PR#4 设计为 `kind: footage` 旁路，不碰 `render(t)`；改造保持这一边界。 |

---

## 7. 参考索引（只读）

- 我们：PR#4 说明与 `docs/footage.md`（分支 `cursor/footage-story-edit-8439`）
- Pireel OSS：`/workspace/pireel/README.zh-CN.md`，`packages/studio-engine/src/scenario-skills/content/{montage-edit,talking-head-edit,audio-and-music}/SKILL.md`
- Agent：`/workspace/pireel-agent/README.md`，`plugins/pireel/skills/pireel/references/{pireel-basics,captions,montage-variants}.md`
- 连接：https://pireel.com/connect-agent.md

---

*文档生成说明：对照公开 README / connect-agent / 本地 clone 目录与 PR#4 API 整理；不包含任何 Pireel 源码摘录实现。*
