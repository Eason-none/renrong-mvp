# diary-trace Specification

## Purpose
TBD - created by archiving change add-diary-trace-system. Update Purpose after archive.
## Requirements
### Requirement: 日记页由归档摘要构成
`summary_text` 非空的 CompletionSummary 即一页日记。CompletionSummary SHALL 扩展两个可空字段：`photo_thumb`（照片缩略图 dataURL）、`completion_event_id`（精确锚定完成事件；读取端在旧记录缺失该字段时 SHALL 回退 `content_id + completed_at` 匹配，不做存量数据改写）。

#### Scenario: 有实质对话归档成页
- **WHEN** 用户在聊聊中说出具体内容后"说完了"，摘要生成成功
- **THEN** 产生 `summary_text` 非空的 CompletionSummary，携带 `completion_event_id`，构成可翻看的日记页

#### Scenario: 旧摘要记录仍可读
- **WHEN** 读取端遇到无 `completion_event_id` 的历史 CompletionSummary
- **THEN** 以 `content_id + completed_at` 回退匹配到完成事件，正常作为日记页使用

### Requirement: 无实质内容不成页
摘要生成 SHALL 在对话未捞到任何具体内容（无具体所见/所闻/所感/所说）时输出空字符串；客户端以 trim 后为空判定。此时归档照常完成（archived 置位、CompletionSummary 记录照常写入），但该记录 SHALL NOT 作为日记页出现在任何翻看表面。判空 SHALL NOT 使用长度阈值——宁可多成页，不可误杀。

#### Scenario: 寒暄式对话不成页
- **WHEN** 用户聊聊中仅回复"还行""嗯"等无具体内容的消息后"说完了"
- **THEN** 归档正常完成，摘要为空，任何入口都不出现这一页，也不出现"本可以有一页"的视觉暗示

#### Scenario: 简短但具体的对话成页
- **WHEN** 用户只说了一句但含具体细节（如"消防栓的红晒褪成粉的了"）
- **THEN** 摘要非空，正常成页

### Requirement: 所有层的聊聊归档均生成摘要
"说完了" SHALL 对所有层（图鉴层、每日任务层、即时任务层）触发归档与摘要生成，不再按 layer 区分。空对话（点了聊聊但一句未说）SHALL 沿用现状：不锁定、不产生摘要、保留补聊入口。摘要生成失败 SHALL 静默处理（不报错弹窗、对话正常关闭），与现有图鉴层行为一致。

#### Scenario: 每日任务聊聊留痕
- **WHEN** 用户完成一条每日任务，聊聊中说出具体内容后"说完了"
- **THEN** 生成 CompletionSummary，与图鉴层同一管线、同一失败静默语义

#### Scenario: 摘要 API 不可用
- **WHEN** 断网状态下用户"说完了"
- **THEN** 对话正常关闭，无报错弹窗，该次无日记页

### Requirement: 摘要保留用户原话
摘要生成 prompt SHALL 要求尽量保留用户原话措辞（用户自己的用词、语气），供翻看时以"那天你说：…"形态呈现。既有约束（只保留用户说过的具体内容、禁评价、禁概括性情绪定性词）SHALL 保持不变。

#### Scenario: 原话措辞进入摘要
- **WHEN** 用户说"消防栓的红晒褪色了，变成粉的了"，归档生成摘要
- **THEN** 摘要以用户的措辞记录该细节，而非转述为"注意到消防栓颜色变化"类第三人称概括

### Requirement: 照片以缩略图入痕，原图不落库
用户在对话中发送图片时：原图 base64 SHALL 仅存于内存供当次模型调用；持久化到消息记录的 SHALL 是压缩缩略图（长边约 300px，目标 ≤50KB）。归档时 SHALL 取对话中第一张用户图片的缩略图写入日记页 `photo_thumb`。压缩或写入失败 SHALL 静默裁掉该图（丢照片不丢对话、不丢功能）。照片与摘要 SHALL NOT 以任何形式上传服务器。

#### Scenario: 带图对话归档
- **WHEN** 用户聊聊中发过一张照片，归档成页
- **THEN** 日记页含该照片缩略图；storage 中不存在该图的原图 base64

#### Scenario: 压缩失败不阻断
- **WHEN** 缩略图压缩失败或 storage 写入超限
- **THEN** 图片不落库，消息文字与对话流程不受影响，无报错弹窗

#### Scenario: 存量原图迁移
- **WHEN** 升级后首次启动，storage 中存在历史对话的未压缩原图
- **THEN** 一次性幂等迁移：压缩替换；压缩失败则裁掉该图；迁移不影响启动可用性

### Requirement: 清掉只清视觉，不删日记数据
"昨日完成"区块的"全部清掉" SHALL 仅移除区块的视觉条目；对应的 CompletionEvent 与 CompletionSummary 数据 SHALL 保持不变。清掉后系统 SHALL NOT 主动重新展示这些条目（数据沉底，等待未来手记页）。

#### Scenario: 清掉后数据仍在
- **WHEN** 用户点"全部清掉"后检查 storage
- **THEN** 昨日区块消失，COMPLETION_SUMMARIES 与 COMPLETION_EVENTS 无删除

