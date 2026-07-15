## 1. 数据层：日记页与照片痕迹（diary-trace）

- [x] 1.1 CompletionSummary 扩展 `completion_event_id` 与 `photo_thumb` 字段：`archiveConversation` 写入两字段；新增按 completion_event_id 查询函数（旧记录回退 content_id + completed_at 匹配）
- [x] 1.2 移除 `ChatView.done()` 的 `layer === 'collection'` gate，所有层"说完了"统一归档生成摘要（失败静默语义不变；空对话不归档判据不变）
- [x] 1.3 图片发送分流：`chooseImage` 后原图 base64 仅存内存供当次 API 调用，落库 `message.image` 改为压缩缩略图（小程序 `uni.compressImage`、H5 canvas，长边约 300px 目标 ≤50KB）；压缩/写入失败静默裁图
- [x] 1.4 归档时抽取对话中第一张用户图片缩略图写入 `photo_thumb`
- [x] 1.5 存量迁移：启动时一次性幂等任务，压缩替换 CONVERSATIONS 中的历史原图（失败则裁掉），验证不阻塞启动
- [x] 1.6 "全部清掉"语义分离确认：仅清昨日区块视觉条目，COMPLETION_EVENTS / COMPLETION_SUMMARIES 无删除（如现状已如此，补断言/注释固化语义）

## 2. Prompt 层：日记采集姿态（diary-conversation + 摘要规则）

- [x] 2.1 `buildSummaryPrompt`（deepseek.js）：增加"尽量保留用户原话措辞"与"未捞到任何具体内容时输出空字符串"（附正反例；判空为 trim 后空串）
- [x] 2.2 对话开场白改为问具体细节（废止"给你带来了什么感受吗"），保持零 API 本地模板
- [x] 2.3 主对话 system prompt（qwen.js）：记忆扳机采集姿态（感官/地点/意外感、复述用户原话细节、深入邀请至多一次、话少不索取、不阻拦结束）

## 3. 重逢弹层（trace-reencounter）

- [x] 3.1 新建 `TracePage.vue` 底部弹层组件：日期（日 + 时段粒度）+ 条目标题 + "那天你说：" + 摘要原文 + 照片缩略图（有则显示，无则不占位）；无评价文案、无计数、无分享
- [x] 3.2 `CollectionDetail.vue` 锁定条目：点击从死 `return` 改为有页则打开 TracePage；无页维持无响应且无缺页暗示
- [x] 3.3 主页"今日已完成/昨日完成"条目：有页则点击打开 TracePage；未聊条目保持现有聊聊入口不冲突

## 4. 完成一拍与归档可见化（completion-beat）

- [x] 4.1 "做完啦"后插入完成一拍：标本落册动效（复用现有动效体系）+ 指向体验的确认文案（≤1.2s、可点击跳过）；仅完成路径，移除/返回路径不出现
- [x] 4.2 聊聊邀请文案更新：问具体细节 + 照片敞口（"拍了照的话，也可以给我看看"）
- [x] 4.3 "说完了"收尾：在现有 1.2s minDisplay 窗口内叠加"凝成一页落进册子"动效，不延长等待；归档失败时动效照常
- [x] 4.4 一拍确认文案、邀请文案终稿过 Gate 0 内容审核（自查通过：无纪律/效率/打分/量化自夸词，描述性非评价性；建议上线前人工复核一遍）

## 5. 呼吸引导改造（breathing-entry）

- [x] 5.1 新增持久化标记 `BREATHING_INTRO_DONE`：首次启动完整走呼吸→基本信息→日推卡片链路，完成/跳过后置位；此后启动直接渲染主页（日推卡片当日首开逻辑回归验证）
- [x] 5.2 存量用户推断：存在任何 CompletionEvent 或 BasicInfo 即视为已完成首次
- [x] 5.3 主页常驻"静一下"入口：覆盖层复用 BreathingGuide，结束/跳过回主页，无状态、无记录、无上报；即时任务空态文案保持纯文案不加链接

## 6. 三件幸福小事（three-good-things）

- [x] 6.1 常驻轻入口（主页/日推卡片一行邀请）：无完成态、无角标、无未完成暗示
- [x] 6.2 点击逻辑：当天无事件 → 创建专属 content_id 完成事件（content_type: "daily_task"）+ Conversation 直接进对话；未归档 → 续聊；已归档 → 打开 TracePage 展示今日页（补充：已归档但无页——即"无实质不成页"命中——静默不响应，同图鉴锁定无页条目的既有语义）
- [x] 6.3 专用开场 prompt：逐件引导、"三件"为邀请形状、内置"想到一件也算数"、无件数计数
- [x] 6.4 入口文案与开场文案过 Gate 0（自查通过）；analytics task_completed 载荷复用既有 {content_type, content_id, collection_id} 结构，零改动

## 7. 回顾页照片小图集（collection-review delta）

- [x] 7.1 `ReviewView.vue`：叙事下方展示该图鉴日记页照片缩略图小图集（按完成时间排列，实时陈列）；无照片不显示区域不占位、无计数文案；叙事快照与棘轮机制不动

## 8. 验收与文档同步

- [x] 8.1 `manual_acceptance_checklist_v2.md`：4.5 语义翻转（所有层"说完了"生成摘要）；新增本变更各能力验收项（一拍、重逢弹层、呼吸门控、幸福小事、照片缩略图、无实质不成页、清掉不删数据），新增 §8 三件幸福小事、§10 存量迁移专项，原 §8 指标体系上线项顺延为 §9
- [ ] 8.2 H5 + mp-weixin 双端手动回归：首启动链路、非首启动直达主页、带图对话归档、锁定条目重逢、存量迁移（用带历史原图的 storage 快照验证）——**需要人工在真实浏览器/小程序开发者工具中执行，本次未跑**
- [ ] 8.3 storage 压力实测：多带图对话下 CONVERSATIONS 单 key 体积与写入失败静默路径（真机小程序）——**需要真机环境，本次未跑**
- [x] 8.4 `product_handoff.md` 待决事项更新：记录手记页约束（册页式、无空格子、日历只做导航、防流水账）与照片存储预算细化为上线后事项
