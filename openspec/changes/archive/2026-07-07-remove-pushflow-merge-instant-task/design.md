# Design: 移除 PushFlow，即时职责并入每日任务体系

## Context

当前主页呼吸完成后的主流程仍是 PushFlow（场景三选→推送卡片→换一个×3→做完啦），消费 content_library_draft_v1.json 的 push_content（38 条，旧三分类 scene 标签），去重靠 pushGlobalDoneSet。与之并存的每日任务体系（日推卡片→领取→做完啦）消费 src/content/daily_tasks.json（42 条，11 维 scene_tags），去重靠领取/完成记录。v6/v7 两次设计决策已把"每次选场景"和"三分类标签"全部废弃，PushFlow 是实现层残留。

## Goals / Non-Goals

**Goals:**
- 主页只剩一套内容体系（每日任务池），即时职责由"现在就来一件"按钮承接
- 删除 pushPool/GlobalDoneSet 整套旧机制，消灭双池双去重
- 38 条 push_content 内容资产不丢失，重标签后并入每日任务池

**Non-Goals:**
- 不改日推卡片、领取/完成流程、对话与"说完了"、图鉴系统的任何行为
- 不做旧 GlobalDoneSet"已做过"记录向新池的迁移（内测本地数据，重做本就被允许）
- 不改 BasicInfo / scene_tags 的采集与结构

## Decisions

1. **内容合并落点：追加进 `src/content/daily_tasks.json`**。它已是每日任务池的运行时数据源，`getDailyTaskCandidates` 直接受益。content_library_draft_v1.json 的 `push_content` 字段保留作运营历史档案，加 `_说明` 标注"已于本变更并入每日任务池，代码不再读取"——不删字段，保留生产过程记录（与 theme_backlog 已产出条目的处理方式一致）。id 无冲突（push_xxx vs dt-xxx 两套前缀）。
2. **重标签规则**：按 content_principles.md §五 的 11 维定义逐条映射（原"室内短/室内久"多数落到 workspace/classroom/home + general，"室外"落到 walking/transit 等），Claude 初标 + 用户抽查定稿。Gate 0 均已通过，不重审内容本身。
3. **"现在就来一件"抽取**：复用 `getDailyTaskCandidates(scene_tags, excludeIds)` 取 1 条，excludeIds = 池中已领取 + 今日已完成。展示复用每日任务详情卡（title/time/instructions + 做完啦 + ← 返回），**不出现"领取"概念**——点"做完啦"直接 `createCompletionEvent(daily_task)` + `saveCompletedTask` 进"今日已完成"，跳过领取列表。
4. **「换一个」保留、上限 3 次（2026-07-06 用户拍板，覆盖初版"不做刷新"的决策）**：任务卡提供「换一个」，同一次进入最多换 3 次，第 4 次点击不再更换并显示关怀小字「**如果没有想做的可以深呼吸，喝点水，发发呆**」——沿用旧推送层"把限制说成关心"的立场；换一个时排除当前展示条目，避免原地重复。**主区域文案定稿（用户指定）**：标题保留「让我们做点什么有意思的小事」，副标题「**希望你好好生活，别太焦虑**」（取代旧"根据你现在的条件选一个"）。
5. **completionEvent 兼容**：`VALID_CONTENT_TYPES` 保留 `"push"`（历史事件仍可被读取/反查标题），但删除 `markPushDone` 副作用调用；新代码没有任何产生 push 类型事件的入口。
6. **历史标题反查兼容**：历史 push 完成事件的 content_id（push_xxx）并入每日池后仍能通过 library 查到条目标题——合并本身就保证了这一点，需在验收里确认历史对话入口不报错。
7. **storage 键**：`PUSH_GLOBAL_DONE_SET` 从 KEYS 删除；用户本地残留的旧键无害，不做清理。

## Risks / Trade-offs

- [38 条重标签有主观判断] → Claude 按 §五 定义初标，输出映射表供用户抽查；标错的代价只是候选场景匹配不准，可随时改 JSON
- [同一条目可能同时出现在日推卡片候选和"现在就来一件"] → 同池自然现象，两入口 exclude 规则一致（排除已领取/已完成），不做额外互斥
- [失去"换一个"单条刷新] → 已拍板接受；日推卡片"换一批"保留
- [删除 pushPool 后 spec_v1 §2.3/§3.1 彻底失效] → 时效警告已覆盖，本变更在警告中把该条标为"已解决（机制已删除）"

## Migration Plan

内测阶段无线上用户、数据全在本地 storage，无迁移步骤。回滚 = git revert（内容合并的 JSON 变更也随 revert 还原）。

## Open Questions

无阻塞项。重标签映射表在实施时产出，用户抽查后定稿。
