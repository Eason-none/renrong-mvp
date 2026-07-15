# breathing-entry Specification

## Purpose
TBD - created by archiving change add-diary-trace-system. Update Purpose after archive.
## Requirements
### Requirement: 呼吸引导仅首次启动强制
呼吸引导 SHALL 仅在首次启动时作为前置流程出现（保留跳过按钮与后续基本信息设置链路）；完成或跳过后 SHALL 持久化标记。此后所有启动 SHALL 直接渲染主页，不再被呼吸引导阻塞。已有使用记录的存量用户（存在任何 CompletionEvent 或 BasicInfo）升级后 SHALL 视为已完成首次，不重看引导。

#### Scenario: 首次启动
- **WHEN** 全新用户首次打开应用
- **THEN** 呼吸引导照常出现（可跳过），完成后进入基本信息设置与日推卡片链路

#### Scenario: 非首次启动直达主页
- **WHEN** 用户完成过首次引导后再次冷启动
- **THEN** 主页直接渲染（日推卡片当日首开逻辑照常），无呼吸引导

#### Scenario: 存量用户升级
- **WHEN** 已有完成记录的用户升级到本版本后启动
- **THEN** 不出现强制呼吸引导

### Requirement: 常驻"静一下"主动入口
主页 SHALL 提供常驻的"静一下"轻入口，点击后以覆盖层形式展示呼吸引导，结束或跳过后回到主页原状。该入口 SHALL 无角标、无使用记录、无任何未使用暗示；使用与否 SHALL NOT 产生持久化状态或上报事件。即时任务空态文案（"深呼吸，喝点水，发发呆"）SHALL 保持纯文案，不加链接导流。

#### Scenario: 主动呼吸
- **WHEN** 用户点击"静一下"
- **THEN** 呼吸引导以覆盖层出现，结束后回到主页，无任何状态变化或记录

