# collection-review Specification

## Purpose
TBD - created by archiving change defer-review-to-first-view. Update Purpose after archive.
## Requirements
### Requirement: 回顾快照在首次查看时生成
图鉴完成度达 100% 时系统 SHALL NOT 立即生成回顾。用户首次点开该图鉴的回顾入口时，系统 SHALL 依次执行：①同步定格该图鉴当前未归档对话名单并逐个被动归档（生成摘要）；②收集该图鉴全部已归档摘要作为素材（含刚被动归档产生的、含最后一条目完成后的聊聊）；③生成回顾叙事并持久化为 sequence=1 快照；④置 `triggered_review_at_100pct` 棘轮。

#### Scenario: 最后一条目的聊聊进入回顾
- **WHEN** 用户完成最后一条目后选择聊聊、"说完了"退出（摘要已生成），随后点开回顾
- **THEN** 该次聊聊的摘要包含在回顾素材中

#### Scenario: 完成瞬间无后台生成
- **WHEN** 用户点下最后一条目的"做完啦"
- **THEN** 系统不发起任何回顾/摘要 API 调用，可选聊聊流程不受影响

### Requirement: 快照一经生成永久定格
sequence=1 快照 SHALL 只生成一次；棘轮置位后 SHALL NOT 因任何后续事件（新的聊聊、内容库扩容、重复点开）重新生成或修改快照。

#### Scenario: 生成后再聊不追加
- **WHEN** 回顾已生成，用户又对该图鉴某条目补聊并归档
- **THEN** 快照内容不变，新摘要仅保留备用

### Requirement: 生成失败整体重试
生成过程中任一步骤失败时，系统 SHALL NOT 持久化快照、SHALL NOT 置棘轮；已成功的单条归档保留（幂等）。用户下次点开回顾 SHALL 自动重试全流程。等待与失败状态 SHALL 使用温婉文案（加载："一起回顾你为生活带来的新内容吧"；失败：不含任何技术报错字样的缓和提示），SHALL NOT 出现系统进度/错误语气。

#### Scenario: 摘要 API 失败后自愈
- **WHEN** 首次点开时摘要生成调用失败，用户稍后网络恢复再次点开
- **THEN** 第二次点开成功生成快照并置棘轮，素材完整

### Requirement: 回顾入口随完成即时出现
图鉴卡片在状态为 completed 时 SHALL 立即显示回顾入口（"✦ 已点亮 回顾 →"），不依赖快照是否已生成。

#### Scenario: 点亮即见入口
- **WHEN** 图鉴刚达 100%（尚无快照）
- **THEN** 卡片已显示回顾入口，点开进入生成流程与加载文案

### Requirement: 素材全空时使用兜底模板
点开时刻若素材中不存在任何非空摘要，回顾 SHALL 使用固定陪伴语气兜底模板（不经模型生成、不编造细节），该行为与原设计一致。

#### Scenario: 全程跳过聊聊
- **WHEN** 用户完成整本图鉴且从未在任何条目留下对话内容，点开回顾
- **THEN** 展示固定兜底模板文本

