# OPS 二创流水线（产品定位）

> 对标作者口径（珍象 CONTENT STUDIO）：找好对标视频 → 全自动二创 → 人工审批 → 自动剪辑 → 再审批发布。
> 人工只卡两道闸。机器人不登录、不代发。

## 五步

| 步 | 名称 | 谁做 | 产出 | 状态字段建议 |
|---|---|---|---|---|
| 1 | 对标入库 | 用户贴链接 / 丢 `raw/`；工位拆解 | `benchmark.json`（钩子、节奏、字幕结构、学什么/不拿什么） | `benchmark_ready` |
| 2 | 全自动二创 | 泡芙（文案主笔）+ 视频制作 | 待审包：`TREATMENT.md`、`lines.json`、封面意图、对标差异说明 | `remix_pending_review` |
| 3 | 人工审批 A | **用户** | 通过 / 驳回意见 | `remix_approved` / `remix_rejected` |
| 4 | 自动剪辑出片 | 视频制作（`build.sh`） | 预览 mp4（H.264 ≤约 3MB）+ 高清 + srt + `out/copy-*.md` | `render_done` |
| 5 | 人工审批 B · 发布 | **用户**；增长岗只给文案包 | 发布确认；用户亲自发 | `publish_approved`（机器人止步） |

## 硬规则

- **不搬运原片**：对标只学结构与节奏，画面与口播必须二创。
- **泡芙线**：必须 `character-locked`（薄荷绿+粉蕾丝）；禁止实拍轮播充动画；不默认科普水印「Hobson 小党」。
- **双审闸**：没有 `remix_approved` 不得渲染；没有 `publish_approved` 不得提示「可发」以外的代发动作。
- **不代发**：登录/验证码只列总管家；发布统筹（微信增长 / X增长）只出物料。

## 与现有目录的关系

- 对标素材：`films/<片名>/raw/` 或 `films/<片名>/benchmark/`（链接 + 截帧说明）。
- 进度：`films/<片名>/status.json` 增加上表字段；工作室态仍由用户改。
- 简报：`brief.json` 增加 `benchmarkUrl` / `benchmarkNotes`；泡芙默认竖屏抖音 + character-locked。
- 审片：自媒体运营在审批 A/B 前可给钩子前 3 秒意见；没看成片不瞎评。

## 实现优先级

1. `status.json` 双审闸字段 + 工作台展示「卡在哪一闸」。
2. 从对标链接/素材生成待审包的固定步骤（文档命令 + Agent 清单）。
3. `remix_approved` 后一键 `build.sh`；驳回回写意见到 `TREATMENT.md`。
4. 出片后把 `out/copy-*.md` 丢给增长岗；发布确认只记状态。

## 命令清单（已实现）

```sh
node tools/init-benchmark.mjs films/<片> --url <对标链接> [--raw raw/x.mp4]   # → benchmark.json + benchmark_ready
# 看对标 → 填 benchmark.json（hook/rhythm/subtitle/learn/dontTake/diff），写 TREATMENT.md + lines.json（过 humanizer）
node tools/check-lines.mjs films/<片> && node tools/check-hook.mjs films/<片>
node tools/pipeline.mjs films/<片> set remix_pending_review      # 卡审批 A
node tools/pipeline.mjs films/<片> approve-a --note "用户在哪条消息同意"
node tools/pipeline.mjs films/<片> reject-a --note "意见"        # 回写 TREATMENT.md + status.notes
node tools/build-if-approved.mjs films/<片>                      # 闸门渲染 → render_done（卡审批 B）+ out/copy-handoff.md
sh tools/deliver.sh films/<片>                                   # 高清 + preview-chat.mp4
node tools/pipeline.mjs films/<片> approve-b                      # 只记状态，用户亲自发
node tools/status-pending.mjs                                    # 日产回报
```

`benchmark.json` 字段：`source{url,raw,platform,author,seenBy,seenAt}`、`hook{first3s,device}`、`rhythm{durationSec,shots,avgShotSec,beats[]}`、`subtitle{lines,position,style}`、`learn[]`、`dontTake[]`、`diff`。没看过的留空。

- 工作室可点审批：任务页「双审闸」区按当前闸显示 通过/驳回 A（remix_pending_review）与 通过/驳回 B（render_done），调 `POST /api/gate`（与 `tools/pipeline.mjs` 共用 `tools/pipeline-lib.mjs`），只改审批态，不渲染不代发；通过 A 后需手动跑 `build-if-approved`。
