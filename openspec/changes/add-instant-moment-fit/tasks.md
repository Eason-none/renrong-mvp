# Tasks: add-instant-moment-fit

## 1. 时刻推断层（逻辑，先行独立上线）

- [x] 1.1 新增 `src/state/momentInference.js`：`getMomentBucket(date)` 四档时段桶 + `inferMomentScenes(date, profileTags)` 规则表求交（design.md D1 规则表；general 不进表；交集空返回 null）
- [x] 1.2 新增 `scripts/verify-momentInference.mjs` 断言脚本：四桶边界（06/09/18/22 整点与跨零点）、工作日/周末分支、交集为空返回 null、交集非空不含 general、软优先排序与永不丢候选
- [x] 1.3 `index.vue` `pickInstantTask()` 接入三级回落链（design.md D2）：推断子集取候选 → 空则档案标签重取 → 候选内软优先（打标全部亲和标相容才优先）。实现微调：`getDailyTaskCandidates` 新增可选 `count` 参数（默认 3，既有调用方行为零变化），即时抽取传 12 扩大软优先候选窗——固定 3 条窗口软优先几乎无从命中
- [x] 1.4 天气读取：复用当日会话内已取的卡片天气文本（`cardWeatherText`）做包含匹配（雨/晴），无缓存整层跳过；未新增任何网络请求

## 2. moment 打标层（内容工作，可后置）

- [x] 2.1 全池（69 条）逐条评估打标：仅给明显时刻亲和的条目加 `moments` / `weather_affinity`，普适条目保持无标；产出打标明细表供人工复核后写入 `src/content/daily_tasks.json`。2026-07-12 用户定稿：一区 6 条全部采纳（dt-002/dt-013/dt-018/dt-046 打 moments，push_026/push_031 打 weather_affinity），5 条边缘候选全部不打；verify-library.mjs 补 3 条打标断言（字段值合法性 + 打标集合恰为定稿 6 条）
- [x] 2.2 产出「时段桶 × 场景」覆盖统计，标出薄弱时段（预计 late-night），清单交内容运营（不在本变更内补写内容）。结论：无严重薄弱时段（late-night 25 条 + general 23 条兜底）；rain 标暂无条目、三个低频场景各仅 5 条，已留档打标明细表 §四待内容解冻后处理

## 3. 文档与验收

- [x] 3.1 `content_principles.md` §五 字段表补 `moments` / `weather_affinity` 可选字段说明与打标准则（亲和非限定、普适不打标）
- [x] 3.2 `manual_acceptance_checklist_v2.md` 新增验收项 3.7/3.8（深夜只出 home、推断回落、每日卡片不受影响），并同步 3.1 副标题新文案
- [x] 3.3 `product_handoff.md` 同步：v8.6 版本注记（定位调整+本变更）、§12.1 功能清单新行、§一定位改写随定位决策一并落地
- [x] 3.4 全部 9 个 verify 脚本回归通过。附带修复 `verify-library.mjs` 三处存量陈旧断言（与本变更无关，v8.4 审计后未同步）：push_001 已删改用 push_003 验证反查、池子 77→69、想法图鉴 9→8
