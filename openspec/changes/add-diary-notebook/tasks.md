## 1. 前置与数据层

- [x] 1.1 确认 add-diary-trace-system 已归档（trace-reencounter 主 spec 进入 openspec/specs/）；未归档则先归档再实施
- [x] 1.2 新增 `src/state/diaryNotebook.js`：读取 completionSummaries 过滤 summary_text 非空 → 按 completed_at 排序的全册时间线 + 按月分组结构（月序旧→新、月内新→旧）；标题反查（getDailyTaskById → getCollectionItemById → THREE_GOOD_THINGS_TITLE）；纯读取，附 Node 断言脚本（空数据/单月/跨月/跨年/无标题兜底）

## 2. TracePage 可选相邻翻页

- [x] 2.1 TracePage 增加可选邻页支持（不传参行为与现状逐像素一致）：弹层内左右滑沿全册时间线切页，两端停止且无提示；确认 mp-weixin 端触摸事件不穿透外层 swiper
- [x] 2.2 核对 CollectionDetail 与三件幸福小事两处既有调用零改动、行为不变（含 reduced-motion 分支）

## 3. 手记册 overlay

- [x] 3.1 新增 `src/components/DiaryNotebook.vue`：全屏 overlay + 横向 swiper 月跨页（无页月份不产生跨页），打开落最新有页月，swiper-item 内 scroll-view 纵向滚动
- [x] 3.2 页卡片：照片作卡面（缩略图主体+日期时段+标题）与纯文字卡两态，参差瀑布/双列拼贴，界面任何位置无计数；卡片点击以邻页上下文打开 TracePage
- [x] 3.3 月份列表跳转：点跨页顶部月份标题弹按年分组的有页月份列表，点击跳转对应跨页；无日网格
- [x] 3.4 视觉：标本册质感与现有色板/动效体系对齐（含 prefers-reduced-motion 降级），过 impeccable critique 基线

## 4. 首页入口

- [x] 4.1 index.vue 右上角：有页才渲染线条小册子 SVG 图标（与 ⚙ 同尺寸并排其左侧，无红点无badge），点击打开 DiaryNotebook overlay
- [x] 4.2 首次出现引导气泡「你的手记册长出了第一页」：复用 onboardingHintsSeen 基建，只弹一次

## 5. 验收与文档

- [x] 5.1 manual_acceptance_checklist_v2.md 新增手记册验收节：入口出现时机/空月不占位/落最新/月内顺序/月份列表/弹层跨月翻页/既有调用方不变/无计数/只读（storage 对比）
- [ ] 5.2 H5 + mp-weixin 双端手动回归：swiper 嵌 scroll-view 手势、弹层内横滑与外层 swiper 无冲突、跨年月份列表
- [x] 5.3 product_handoff.md：待决事项第 10 条标记已落地并链接本变更；同步功能清单
