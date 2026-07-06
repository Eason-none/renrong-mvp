# Proposal: 移除 PushFlow 场景三选主线，即时职责并入每日任务体系

## Why

PushFlow（场景三选→推送卡片）是 v6 之前的旧交互残留：v6 已裁定"每次选场景是不必要的决策负担"（场景改为档案级 scene_tags），v7 已废弃三分类标签升级为 11 维。但代码里 PushFlow 仍是主页主流程，与日推卡片体系并存，造成双内容池（push_content 38 条旧标签 + daily_tasks 42 条新标签）、双去重机制（GlobalDoneSet vs 领取制）的无谓复杂度——两池的内容准入标准（Gate 1 推送层：≤5 分钟、不挑场景）完全相同，分开没有需求依据。

"焦虑那一刻立刻拿到一件小事"的**即时陪伴职责必须保留**（这是产品定位的核心时刻），但它不需要"场景选择"这个交互来承载——场景信息已经在用户档案里了。

## What Changes

- **BREAKING（交互移除）**：删除 PushFlow.vue 及场景三选交互，主页呼吸完成后直接进入"我的日常任务 + 今日任务候选入口"布局
- **BREAKING（机制移除）**：删除 pushPool.js 及 GlobalDoneSet 去重机制（`pushGlobalDoneSet` 存储键废弃，`content_type: "push"` 完成事件不再产生；历史已存在的 push 类型事件保留不迁移）
- **新增**：主页"现在就来一件"按钮——按 BasicInfo.scene_tags 从每日任务池直接抽 1 条全屏展示，"做完啦→聊聊"复用现有每日任务完成流程，零决策、无新状态机
- **内容合并**：content_library_draft_v1.json 的 push_content 38 条按 11 维 scene_tags 重新映射后并入每日任务内容池（内容重标签工作，Gate 0 均已通过），每日任务池扩至约 80 条
- **文档清理**：spec_v1.md 时效警告中"场景三分类"落差条目、product_handoff.md §12.6 落差 #1 标记为已解决；verify-pushPool.mjs 断言脚本随 pushPool.js 一并删除，verify-library.mjs 同步新的内容池断言

## Capabilities

### New Capabilities
- `instant-task`: 主页"现在就来一件"即时抽取——按用户 scene_tags 从每日任务池零决策抽 1 条立即展示并可直接完成，覆盖抽取规则、与领取制列表的关系、候选耗尽降级

### Modified Capabilities
- `daily-task-content`: 移除"每日任务内容与 content_library_draft_v1.json 推送内容完全独立无联动"的要求（该独立性随推送层的消亡失去对象）；内容池来源改为 daily_tasks.json + 重映射并入的原 push_content 条目，覆盖 11 维 scene_tags

## Impact

- **删除**：`src/components/PushFlow.vue`、`src/state/pushPool.js`、`scripts/verify-pushPool.mjs`
- **修改**：`src/pages/index/index.vue`（主流程布局 + 新按钮）、`src/content/library.js`（去掉 push_content 查询接口，若有其他调用方需清理）、`src/content/daily_tasks.json` 或 content_library_draft_v1.json（内容合并落点，design 阶段定）、`src/state/completionEvent.js`（`content_type: "push"` 分支处理）、`src/state/storage.js`（PUSH_GLOBAL_DONE_SET 键标记废弃）
- **文档**：product_handoff.md §12.6、spec_v1.md 时效警告、manual_acceptance_checklist_v2.md §3（整节替换为"现在就来一件"验收项）
- **不受影响**：日推卡片、领取/完成流程、对话与"说完了"、图鉴系统、回顾管道
