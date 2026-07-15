# three-good-things Specification

## Purpose
TBD - created by archiving change add-diary-trace-system. Update Purpose after archive.
## Requirements
### Requirement: 常驻轻入口，无完成态
主页/日推卡片 SHALL 提供常驻的"幸福小事"轻入口（一行邀请文案，终稿过 Gate 0）。入口 SHALL 无领取/完成状态、无角标、无连续记录（streak）、无任何"今天还没记"的未完成暗示。用户从不使用该入口 SHALL 无任何后果与提示。

#### Scenario: 入口恒常且安静
- **WHEN** 用户任意一天打开主页
- **THEN** 幸福小事入口以相同形态存在，无论昨天/今天是否用过，无任何状态变化的暗示

### Requirement: 聊即是做
点击入口且无可续用的当日对话时，系统 SHALL 创建完成事件（专属 content_id，`content_type: "daily_task"`，analytics 上报载荷零改动）并直接进入专用对话——无任务卡、无"做完啦"步骤。专用开场 prompt SHALL 逐件引导用户说出今天的幸福小事，以"三件"为邀请形状但 SHALL 内置"想到一件也算数"逃生口；SHALL NOT 出现件数计数、进度或"还差 N 件"表述。"说完了"后按日记痕迹通用规则归档成页。

#### Scenario: 首次进入直接对话
- **WHEN** 用户当天首次点击幸福小事入口
- **THEN** 直接进入对话，开场引导说说今天的幸福小事并附"想到一件也算数"

#### Scenario: 只说一件也成页
- **WHEN** 用户只说了一件事就"说完了"
- **THEN** 归档正常成页，对话中无任何"还差两件"的暗示

### Requirement: 随时可记，每段各自成一页
幸福小事入口 SHALL 支持随时记录：每次点击 SHALL 进入记录对话，绝 SHALL NOT 因当天已记录过而变为只读或拒绝进入。当天存在未归档对话时 SHALL 续用它、不新建；否则 SHALL 新建完成事件与对话，开始新的一段。同一天 MAY 存在多段记录，每段按日记痕迹通用规则各自归档成独立的一页。历史回看 SHALL 由手记册（diary-notebook）承担，入口本身 SHALL NOT 承担回看。

#### Scenario: 未归档续聊
- **WHEN** 用户当天进过幸福小事对话、未"说完了"就离开（未归档），再次点击入口
- **THEN** 回到原对话继续，不创建新事件

#### Scenario: 已记录后仍可再记
- **WHEN** 用户当天已"说完了"归档过一页，再次点击入口
- **THEN** 直接进入一段新的记录对话（新建完成事件），而不是只读地打开今天那页

#### Scenario: 同一天多段各自成页
- **WHEN** 用户当天分两次分别记录并各自归档
- **THEN** 手记册中该天出现两张独立的幸福小事卡片，互不覆盖

