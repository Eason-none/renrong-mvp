# Tasks: defer-review-to-first-view

## 1. 状态层

- [x] 1.1 `reviewOrchestration.js`：`triggerReviewOnCompletion` 改名 `ensureFirstReviewSnapshot`，时序重排为 归档名单入口定格→被动归档→收集素材→生成快照→置棘轮；失败整体抛出不落半成品；头部注释同步新语义
- [x] 1.2 兼容旧中间态：已存在 sequence=1 快照时跳过生成、补做归档+棘轮（保留既有逻辑）

## 2. 组件层

- [x] 2.1 `CollectionDetail.vue`：markDone 移除 triggerReviewOnCompletion 调用及不再使用的 import
- [x] 2.2 `ReviewView.vue`：created 时无快照则调用 ensure（摘要函数按对话的 completion event 反查条目 title/instructions），成功后刷新列表；失败展示温婉重试文案
- [x] 2.3 `CollectionGrid.vue`：completed 恒显"✦ 已点亮 回顾 →"

## 3. 验证

- [x] 3.1 `verify-reviewOrchestration.mjs` 按新时序重写：素材含被动归档摘要与最后条目聊聊；失败不落快照不置棘轮、重试自愈；并发重入仍只生成一次；生成期间新开对话不被归档不进素材
- [x] 3.2 全部 verify 脚本通过 + `npm run build:mp-weixin` 通过

## 4. 文档

- [x] 4.1 `product_handoff.md` §5.4.2/§6.5.3 同步新时序（标注 v8.2 设计更新）
- [x] 4.2 `manual_acceptance_checklist_v2.md` §5.9/5.10 改写（点亮即见入口；首次点开生成；最后条目聊聊应出现在回顾里）

## 5. 验收（用户真机）

- [x] 5.1 新点亮一本图鉴（最后一条认真聊聊）→ 点开回顾 → 叙事包含该次聊聊内容
- [x] 5.2 断网点开回顾 → 温婉提示；恢复网络再点开 → 正常生成
