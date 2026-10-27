# OPS 流量向改造：缺口与待总管家拍板（2026-10-27）

## 已落地
见 AGENTS.md「流量向 OPS 流水线」。工具：check-hook / status-pending / pipeline / build-if-approved / init-benchmark / new-puff-film；deliver 预览分轨；copy 交接；竖屏安全区；双审闸 pipeline 字段 + 工作室列表显示「卡闸A/B」。

## 还差 / 降配
1. ~~**智能竖屏裁切没做，只 letterbox**~~ ✅ 2026-10-27：MediaPipe 人脸 reframing 已接 assemble（`framing:"auto"` 竖屏默认，失败回退 letterbox）。余项：无脸主体（宠物/物体）检测。
2. **素材片字幕烧录、poster 安全区取景没做**：目前只记 `caption.y` 并出 srt；代码片（render(t)）各自 film.js 控制字幕位置，未统一接安全区。
3. **钩子检查是文字启发式**：不看画面；画面主体只查 TREATMENT 有无描述。真画面审仍靠运营看成片。
4. **工作室审批闸只读展示**：列表能看出卡闸 A/B，但网页里没有「通过/驳回」按钮——审批按设计由用户拍板后用 `tools/pipeline.mjs` 代记。要不要加按钮需拍板（加了等于网页可改审批态）。
5. **现有片都没有 status.json**，`status-pending` 目前输出 0 部；是否给在制片（us-territory-rise、er-vs-clinic 等）补建 status/pipeline 需总管家定阶段。
6. **benchmark.json 拆解靠人/Agent 看完填**：工具不下载对标视频（不搬运），只记链接。
7. **审片维度对齐**：四大死法是按需求单写的，需自媒体运营确认与其 P0 清单措辞一致。
8. deliver 预览未在真实 deliver 全流程跑（会重建整片，耗时）；ffmpeg 预览参数已在 er-vs-clinic 上单测：78s → 2.0MB。
