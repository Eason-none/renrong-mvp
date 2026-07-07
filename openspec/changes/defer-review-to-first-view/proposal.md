# Proposal: 回顾快照推迟到首次查看时生成

## Why

现行机制在"最后一条做完啦"的瞬间定格回顾素材，导致点亮瞬间的那次聊聊（最有仪式感、最可能认真聊的一次）永远进不了回顾——真机验收实测出现"用户刚认真聊完，回顾却说『没能听你讲起过』"的兜底文案，从用户视角产品在撒谎。

## What Changes

- **BREAKING（时序变更）**：回顾快照生成时机从"最后一条『做完啦』瞬间（后台静默）"改为"用户**首次点开回顾**时"；素材=点开时刻该图鉴全部已归档对话的摘要（含最后一条的聊聊、含此刻被动归档产生的摘要）
- 被动归档时序反转：先被动归档（其摘要**纳入**素材），再生成快照——原"先快照后归档、归档摘要排除在外"的排除语义废弃
- 失败语义改为"整体重试"：任一步骤失败则不落快照、不置棘轮，用户下次点开自动重试（取代原"App 启动 level-triggered 补偿"的调用契约，该补偿从未实现）
- 图鉴卡片：completed 即显示"✦ 已点亮 回顾 →"（不再依赖快照是否已存在）；ReviewView 生成失败时展示温婉重试文案
- "快照一经生成永久定格"棘轮语义**不变**；摘要全空兜底模板**不变**

## Capabilities

### New Capabilities
- `collection-review`: 图鉴回顾的生成时机、素材范围、定格棘轮、失败重试与入口展示（此前仅存在于 spec_v1/handoff 叙述，无正式 spec）

### Modified Capabilities
（无——openspec/specs/ 现有 5 个能力均不涉及回顾）

## Impact

- `src/state/reviewOrchestration.js`：`triggerReviewOnCompletion` 改名 `ensureFirstReviewSnapshot`，步骤重排
- `src/components/CollectionDetail.vue`：markDone 移除触发调用
- `src/components/ReviewView.vue`：打开时惰性生成 + 失败文案
- `src/components/CollectionGrid.vue`：completed 恒显回顾入口
- `scripts/verify-reviewOrchestration.mjs`：场景断言按新时序重写
- 文档：product_handoff.md §5.4.2/§6.5.3、manual_acceptance_checklist_v2.md §5.9/5.10
