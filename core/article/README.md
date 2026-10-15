# 视频 → 公众号文章（不发布）

基于 vendor/oil-video-article（MIT，oil-oil）的流程；写作规则见 /workspace/style/no-ai-style.md（第〇/〇.5 节我的口吻优先，第八、九节运营与篇幅）。

1. `tools/video2article.sh prep <url|file> <slug>` → /workspace/article-runs/<slug>/：video.mp4、transcript.srt/txt（有字幕用字幕，否则 faster-whisper）、scenes.json（PySceneDetect；镜头少的动画视频退化为定时取样）、contact.jpg 联系表
2. Agent 读 transcript.txt + contact.jpg，写 article/article.md。事实只来自字幕和画面，不编我的经历和感受
3. `tools/video2article.sh frames <slug> name@秒 ...` → article/img/，然后逐张打开核对（强制）
5. `tools/video2article.sh draft <slug>` → 公众号草稿箱（stable_token → uploadimg 换图 → add_material 封面 → draft/add；只草稿，绝不 freepublish/群发），结果写 article/draft.json
4. `tools/video2article.sh build <slug>` → lint（禁用词、500–800 字、2–3 图、清单≤4、标题≤20 字、金句≤2、无点赞在看）+ article.html（内联样式，可粘贴公众号）+ cover.jpg + 预览 ops.danghb.cn/fun/demo/article-<slug>/（OPS 登录）

md 约定：`# 标题`；`^^ 来源行`（标题下小灰字）；`<!-- cover: img/x.jpg -->`（封面，缺省取第一张图）；`## 小标题`；`![](img/x.jpg)` 下一行 `▲ 图注`；`>` 金句（原文/中文/—— 讲者）；`- ` 结尾清单；最后一行轻互动。
排版：正文 16px / 行高 1.75 / #333，两侧 12px，段间空一行，唯一强调色 #b8860b 只给小标题和金句左边框，图片通栏，图注 12px 灰。
依赖：ffmpeg、yt-dlp、faster-whisper、scenedetect、opencv（pip --user）。YouTube 需 node 作 JS runtime，优先 h264（av1 opencv 读不了）。
