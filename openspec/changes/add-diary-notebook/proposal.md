## Why

add-diary-trace-system 落地后，日记页数据（CompletionSummary）只能在图鉴条目、今日/昨日完成、三件幸福小事的入口被"点开单页"，没有一个整体翻阅面——"昨日清掉"的数据沉底后用户再也找不回（product_handoff.md 待决事项第 10 条）。"记忆不追人"只承诺了不追，但"人来找记忆"的门还没有。手记册就是那扇门：一个用户主动发起的重逢出口，服务翻阅怀旧，不做检索管理。

形态已经过完整的 grill 决策（2026-07-10），所有待定点均已钉死，见 design.md。

## What Changes

- 新增手记册全屏 overlay（首页 index 容器内，沿用 CollectionDetail 惯例，不加 pages.json 页面）：月跨页画册——横向 swiper 一屏一月，无页月份不出现跨页
- 跨页内卡片以照片作卡面（有图卡高、无图卡矮，参差拼贴），只露日期（日+时段）与标题；**任何地方不出现页数/条数**（数值不可见红线）
- 打开落在最新有页的月份；月间从左到右按旧→新排，往回划是更早；月内纵向滚动、卡片新→旧（最近在顶）
- 跳转导航：点跨页顶部月份标题，弹出按年分组的"有页月份列表"（只列有页的月，无日网格——"无空格子"在导航层同样成立）
- 首页右上角入口：线条小册子 SVG 图标，并排在现有 ⚙ 角标左侧；**第一页日记诞生前入口不存在**（无空册子状态，无需空态设计）；首次出现时配 onboarding 气泡「你的手记册长出了第一页」（复用 onboardingHintsSeen 基建）；永不带红点/badge（记忆不追人）
- TracePage 扩展（向后兼容）：新增可选的相邻翻页支持——手记册场景下弹层内左右滑切换相邻页，沿全册 completed_at 时间线跨月连续，往回划=更早一页；CollectionDetail 与三件幸福小事调用方不传邻页参数，保持现有单页行为不变

## Capabilities

### New Capabilities

- `diary-notebook`: 手记册翻阅面——入口出现时机、月跨页陈列、卡片信息密度、翻页方向与落点、月份列表跳转、红线约束（数值不可见/无空格子/不追人/防流水账）

### Modified Capabilities

- `trace-reencounter`: 重逢弹层新增可选相邻翻页——弹层内左右滑沿全册时间线切换日记页；未提供邻页上下文时行为与现状完全一致。（注意：该能力的主 spec 随 add-diary-trace-system 归档后才进入 openspec/specs/，本变更应在其归档之后实施）

## Impact

- 新组件：`src/components/DiaryNotebook.vue`（月跨页画册 overlay）
- 修改：`src/components/TracePage.vue`（可选邻页 props/事件，向后兼容）、`src/pages/index/index.vue`（右上角入口 + overlay 挂载 + 首次气泡）
- 读取（不新增写入）：`completionSummaries`（storage.js）、标题反查 `getDailyTaskById` / `getCollectionItemById` / `THREE_GOOD_THINGS_TITLE`
- 依赖顺序：建议先归档 add-diary-trace-system，再实施本变更
- 不触碰：回顾快照、analytics 载荷、照片存储策略（待决事项第 11 条独立处理）
