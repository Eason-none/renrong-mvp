# Proposal: add-instant-moment-fit

## Why

"现在就来一件"是单条直出、无候选列表的入口——每日卡片的方差被用户的选择权吸收，即时入口没有这层兜底，任何一次与此刻不匹配的抽取（深夜抽到菜市场、工位时间抽到周末逛街型任务）都会被用户读成"随机老虎机"，损耗入口可信度。当前抽取只按档案 scene_tags 过滤，是静态的，对"现在几点、工作日还是周末、什么天气"一无所知。定位调整后（丰富生活/意义感为核心），即时入口的角色是"零决策的即时新鲜感"，命中此刻是它唯一的说服力来源。

## What Changes

- **时刻推断层（逻辑修复，零内容成本）**：新增纯函数——按「小时段 × 工作日/周末」推断此刻合理的场景子集，与档案 scene_tags 求交后作为即时抽取的过滤条件（深夜只出 `home`，工作日白天优先工位/教室/食堂等）；交集抽不出候选时回落到现行"纯档案标签"行为，永不因推断而空手
- **moment 打标层（内容工作 + 软优先）**：每日任务池条目新增**可选**字段 `moments`（时段亲和）与 `weather_affinity`（天气亲和）；即时抽取在时刻推断的候选内**软优先**命中当前时段/天气的条目（有匹配先抽匹配，无匹配正常抽），天气读当日已缓存数据，**不新增网络请求**
- **副标题文案同步**：主页副标题已由「希望你好好生活，别太焦虑」改为「希望你好好生活，和日子常见常新」（定位调整决策，代码已落地），instant-task 规格中写死的旧文案要求随本变更更新
- **每日卡片不受影响**：时刻推断与软优先仅作用于即时入口；"今日任务候选"仍按档案 scene_tags 全量抽候选（用户有选择权，方差可接受，保留发现广度）
- 机制对用户完全不可见：无新 UI、无文案提示，变化只体现为抽取命中率

## Capabilities

### New Capabilities

（无——时刻推断是 instant-task 抽取规则的内部演进，不构成独立能力）

### Modified Capabilities

- `instant-task`: 抽取规则从"档案 scene_tags 随机"升级为"时刻推断场景子集 + moment/天气软优先 + 回落链"；副标题文案要求更新为「希望你好好生活，和日子常见常新」
- `daily-task-content`: 条目 schema 新增可选字段 `moments` / `weather_affinity` 及其打标写作要求；明确无标条目的行为（不参与软优先，永远可被抽中）

## Impact

- 新增：`src/state/momentInference.js`（纯函数：时刻→场景子集/时段桶）+ `scripts/verify-momentInference.mjs`（断言脚本）
- 修改：`src/pages/index/index.vue` `pickInstantTask()`（接入推断与软优先、回落链）、`src/content/daily_tasks.json`（全池打标，可选字段）、`src/content/library.js`（若需暴露软优先辅助查询）
- 文档同步：`content_principles.md` §五 字段表补 `moments` / `weather_affinity`（可选字段）；`manual_acceptance_checklist_v2.md` 补验收节
- 不触碰：每日卡片候选逻辑、DailyTaskPool 领取/完成数据结构、完成事件与日记链路、analytics 载荷
- 已知代价（写入设计）：抽取池按时刻变窄后，同时段条目重复周期缩短——靠后续内容库对薄弱时段补条目缓解，不属于本变更范围
