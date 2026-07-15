# Design: add-instant-moment-fit

## Context

`pickInstantTask()`（index.vue:587）当前调用 `getDailyTaskCandidates(profileTags, excludeIds)` 取首条。`getDailyTaskCandidates`（library.js:33）的既有语义：按 scene_tags 交集匹配（显式排除 general 命中）→ 打乱取 3 → 不足用 general 池补足。每日卡片与即时入口共用这一个函数。天气数据由每日卡片当日首次请求后缓存（当天复用，不重复请求）。池子现有 69 条，每条必有 `scene_tags`，无任何时段/天气信息。

## Goals / Non-Goals

**Goals:**
- 即时入口抽出的条目在"此刻大概率可做"——深夜不出菜市场，工位时间不出周末逛街
- 全程零新增用户决策、零新增 UI、零新增网络请求
- 任何输入下都抽得出条目（回落链兜底），不引入新的空态

**Non-Goals:**
- 不改每日卡片候选逻辑（用户有选择权，保留发现广度）
- 不做 LLM 实时选题、不做"你现在在哪"询问
- 不为薄弱时段补写新内容（记录缺口，留给内容运营）

## Decisions

### D1 推断层独立成纯函数模块，不塞进 library.js

新增 `src/state/momentInference.js`，导出：
- `getMomentBucket(date)` → `"morning" | "daytime" | "evening" | "late-night"`（06-09 / 09-18 / 18-22 / 22-06，本地时间）
- `inferMomentScenes(date, profileTags)` → 此刻合理的场景子集（已与档案求交）

规则表（场景可行性 × 时段 × 工作日/周末）：

| 桶 | 工作日 | 周末 |
|---|---|---|
| morning (6-9) | home, transit, walking, driving, convenience-store | home, walking, convenience-store |
| daytime (9-18) | workspace, classroom, canteen, convenience-store, walking | home, walking, market, convenience-store, gym, canteen |
| evening (18-22) | home, transit, walking, driving, convenience-store, gym, market | 同工作日 evening |
| late-night (22-6) | home | home |

`general` 不进推断表——它由 `getDailyTaskCandidates` 的补足机制天然兜底。与档案求交为空时返回 `null`（调用方回落）。理由：规则表是纯数据+纯函数，独立模块可被断言脚本直接 import 验证，也不污染 library.js 的内容查询职责。

### D2 软优先在 pickInstantTask 内实现，回落链三级

```
momentTags = inferMomentScenes(now, profileTags)
① candidates = getDailyTaskCandidates(momentTags ?? profileTags, excludeIds)
② 若 candidates 为空且用了 momentTags → 重试 getDailyTaskCandidates(profileTags, excludeIds)（现行为）
③ 在 candidates 内软优先：
   prefer = 命中 moments 含当前桶 且（无 weather_affinity 或 命中当前天气）的条目
   取 prefer 非空 ? prefer[0] : candidates[0]
```

理由：改动收敛在即时入口一处，`getDailyTaskCandidates` 签名与行为零变化，每日卡片自动不受影响。软优先只重排不过滤——打标是"加分项"，无标条目永远可被抽中，避免打标覆盖不全时池子隐性变小。

### D3 打标字段全部可选、语义是"亲和"不是"限定"

- `moments?: string[]`——条目**特别适合**的时段（如"听雨的层次"→ 不打；"路灯亮起来的瞬间"→ `["evening"]`）。不打 = 全时段中性
- `weather_affinity?: string[]`，取值 `rain | sunny`（首版只做两种）——天气判定用当日缓存的天气文本做包含匹配（含"雨"→ rain；含"晴"→ sunny），**缓存不存在则整层跳过**，不触发请求

理由：亲和语义下打标是纯增益，错标/漏标的最坏结果是"退回今天的行为"，内容工作可以分批做、不阻塞逻辑层上线。

### D4 时段桶不暴露给内容作者以外的任何层

桶名不进 UI、不进文案、不进 analytics 载荷——机制对用户完全不可见，符合"数值不可见/机制不可见"的一贯立场。

## Risks / Trade-offs

- [同时段重复周期缩短] 深夜池按现库可能只有十几条，高频深夜用户几天内见底重置 → 接受（重复做仍可有新感知，原则一注2），并在 tasks 里产出"各桶×场景覆盖统计"，把薄弱时段清单交给内容运营
- [时段规则与个体作息不符]（夜班、自由职业者的 daytime 不在工位）→ 回落链保证永远抽得出；规则表只做"大概率"不做"断言"，交集为空即退回档案行为
- [天气文本匹配脆弱]（"雷阵雨转多云"）→ 用包含匹配 + 只做 rain/sunny 两类；匹配不上就当无天气信号，行为退化为纯 moments 软优先
- [打标主观性] → 打标结果整表列进 tasks 供人工复核，一次过目全部 69 条

## Migration Plan

纯前端逻辑 + JSON 可选字段，无存储 schema 变更、无数据迁移。回滚 = revert 提交。逻辑层（D1/D2）可先于打标层（D3 内容工作）独立上线，上线间隔期内软优先自然空转。

## Open Questions

（无——文案、层级、回落行为均已在提案阶段由用户批准）
