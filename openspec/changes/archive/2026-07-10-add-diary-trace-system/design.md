# Design: add-diary-trace-system

## Context

产品定位重确认：聊聊=代笔日记，回顾=纪念册的跋。当前实现的关键现状：

- `CollectionDetail.vue:129`：已锁定条目点击直接 `return`，痕迹无任何可见表面
- `ChatView.vue:177`：`layer === 'collection'` 才归档生成摘要——日常/即时任务层聊完即弃
- `ChatView.vue:115`：原图未压缩 base64 直接进消息并随 `CONVERSATIONS`（单 key 聚合存储）落库，wx storage 单 key 1MB / 总量 10MB 上限下是定时炸弹
- `conversation.js`：CompletionSummary = `{id, content_id, completed_at, summary_text}`，与 CompletionEvent 1:1 的 Conversation 归档时生成；不变量"archived 且 messages 非空 ⇒ 有摘要记录"
- `index.vue:4`：呼吸引导每次冷启动阻塞整个主页（`breathingDone` 不持久化）
- 摘要 prompt（`deepseek.js:16`）已禁评价与概括性情绪词，原材料方向正确

设计红线：不制造焦虑、数值不可见、见证者可寻而不索取、记忆不追人、做歪了也算数。

## Goals / Non-Goals

**Goals:**

- 日记页从"生成"到"重逢"的完整闭环：采集（含日常层）→ 存储（含照片缩略图）→ 可翻看（重逢弹层）
- 价值兑现提前：呼吸不再阻塞、完成瞬间有确认一拍
- 对话姿态转向记忆扳机采集，摘要保留用户原话
- 三件幸福小事作为日常层旗舰内容源

**Non-Goals:**

- 手记页（完整时间轴翻阅面）——上线后凭数据设计；约束已记录：册页式陈列、无空格子、日历只做跳转导航、防流水账
- 照片上传服务器（永不：破坏匿名姿态）
- 任何主动推送/重提旧记录（记忆不追人）
- 回顾快照机制、analytics-events 载荷（均不动）

## Decisions

### D1: 日记页复用 CompletionSummary，不新增实体

日记页 = `summary_text` 非空的 CompletionSummary，扩展两个字段：`photo_thumb`（缩略图 dataURL，可空）、`completion_event_id`（精确锚定；旧记录缺失时回退 `content_id + completed_at` 匹配）。"无实质不成页"= 摘要 prompt 明确"对话没有捞到任何具体内容时输出空字符串"，客户端 trim 后为空则该次归档只标记 archived、照常写 summary 记录但 `summary_text` 为空——无页可翻，重逢弹层不出现。既有不变量不破坏。

*替代方案*：新建 DiaryPage 实体——多一套读写与迁移，无新信息，排除。

### D2: 日常层留痕 = 移除 layer gate，而非新管线

`ChatView.done()` 的 `layer === 'collection'` 条件移除，所有层"说完了"都走 `archiveConversation`（失败静默语义沿用）。空对话（点了聊聊没说话）依旧不产生摘要、保留补聊入口——现有判据不变。验收单 4.5 与 instant-task spec 的"退出不生成摘要"语义随之翻转。

### D3: 照片在发送时刻分流——原图只进 API，缩略图落库

`chooseImage` 后：原图 base64 仅存在内存中供当次 Qwen 调用；压缩出的缩略图（长边约 300px，目标 ≤50KB；小程序 `uni.compressImage`，H5 canvas 缩放）写入 `message.image` 落库。从源头消除 storage 风险，优于"归档后再裁"（归档前 storage 已被原图撑爆的窗口依然存在）。归档时取对话中第一张用户图片作为 `photo_thumb` 进日记页。

**存量迁移**：启动时一次性幂等任务——扫描 `CONVERSATIONS` 中超阈值的 `message.image` 压缩替换。压缩失败则裁掉该图（丢照片不丢功能，failure-safe 与指标体系同构）。

### D4: 重逢弹层是一个组件，两个挂载点

新组件 `TracePage.vue`（底部弹层）：日期（"10月14日 · 傍晚"粒度）+ 条目标题 + "那天你说：" + 原话摘要 + 照片缩略图（有则展示）。挂载点：① `CollectionDetail` 锁定条目 tap（替换死 `return`）；② `index.vue` 今日已完成/昨日完成条目 tap。**无页则不弹、不加任何视觉暗示**（无空格子原则：不展示"这里本可以有一页"）。"全部清掉"只清昨日区块视觉条目，CompletionSummary 数据不删。

### D5: 呼吸门控持久化为"仅首次"，入口化为"静一下"

新增持久化标记（如 `BREATHING_INTRO_DONE`）：首次启动完整走呼吸→基本信息→日推卡片链路；此后主页直接渲染，角落常驻"静一下"入口，点击以覆盖层形式复用 `BreathingGuide`。即时任务空态文案"深呼吸，喝点水，发发呆"处不加链接（保持文案的无所求，避免变成功能导流）。

### D6: 完成一拍与归档动效复用现有动效体系

"做完啦"→ 先标本落册动效 + 一句指向体验的话（如"这几分钟，是你自己的"，终稿过 Gate 0）→ 聊聊邀请浮现（文案含照片敞口"拍了照的话，也可以给我看看"）。"说完了"收尾复用既有 1200ms minDisplay 窗口叠加"凝成一页落进册子"动效——不新增等待时间。文案原则：描述发生了什么，禁评价词。

### D7: 三件幸福小事复用完成事件模型，一天一页

常驻轻入口（日推卡片底部/主页固定一行，无角标无未完成态）。点击：当天无幸福小事事件 → 创建 CompletionEvent（专属 content_id，`content_type: "daily_task"`，analytics 载荷零改动）+ Conversation，直接进对话（聊即是做），专用开场 prompt 逐件引导、内置"想到一件也算数"；当天已归档 → 再点直接弹出今天这页（TracePage），自然形成"写完可翻看"的闭环；当天未归档 → 续聊。文案过 Gate 0。

*替代方案*：独立数据模型——痕迹/重逢/摘要管线全部要分叉，排除。

### D8: 对话开场与姿态改写在 prompt 层解决

`qwen.js` 开场白从"给你带来了什么感受吗"改为问具体细节（哪个瞬间/看到什么/什么意外）；system prompt 增加记忆扳机采集姿态（感官/地点/意外感、一次邀请、跟随用户能量）与"绝不阻拦结束"。摘要 prompt 增加：尽量保留用户原话措辞、无实质输出空字符串。

## Risks / Trade-offs

- [缩略图后 CONVERSATIONS 单 key 仍可能逼近 1MB] → 缩略图压缩参数保守（≤50KB）；写入失败静默裁图（丢照片不丢对话），与"丢指标不丢功能"同构
- [摘要模型对"无实质"判定不稳，好内容被判空] → prompt 给出正反例；判空标准是 trim 后空串而非长度阈值；宁可多成页不可误杀
- [日常层留痕增加 DeepSeek 调用量] → 每次聊聊一次调用，与图鉴层同价；聊聊本身可选、频次低
- [完成一拍拖慢高频操作] → 动效 ≤1.2s 且可被点击跳过；一拍只在"做完啦"出现，"移除/返回"路径不加
- [幸福小事常驻入口被忽视（banner blindness）] → 接受；它是敞口不是 KPI，不加任何唤起手段
- [BREAKING：instant-task"不生成摘要"语义翻转] → 属有意决策（旧语义的前提已被日记框架取代）；spec delta 与验收单 4.5 同步改

## Migration Plan

1. 存量对话原图压缩迁移（启动时幂等，见 D3）
2. 旧 CompletionSummary 无 `completion_event_id` → 读取端回退匹配，不做数据改写
3. 呼吸标记：已有用户首次升级后视为"已完成首次"（避免老用户重看引导）——以"是否存在任何 CompletionEvent 或 BasicInfo"推断
4. 回滚：各能力相互独立，可按 capability 单独回退；D3 迁移不可逆（原图已裁），风险已由"丢照片不丢对话"边界覆盖

## Open Questions

- 缩略图具体压缩参数（尺寸/质量/格式）实现时按真机 storage 实测定
- "静一下"入口的视觉位置与形态归视觉体系（不阻塞本变更验收）
