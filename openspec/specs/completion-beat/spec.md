# completion-beat Specification

## Purpose
TBD - created by archiving change add-diary-trace-system. Update Purpose after archive.
## Requirements
### Requirement: 做完啦后的确认一拍
用户点击"做完啦"后，系统 SHALL 先呈现一拍确认：标本落册动效 + 一句指向体验本身的文案（描述发生了什么，如"这几分钟，是你自己的"；终稿过 Gate 0），随后聊聊邀请才浮现。一拍时长 SHALL ≤1.2 秒且可点击跳过。该一拍 SHALL 仅出现在"做完啦"路径；"不想做了，移除"与"← 返回"路径 SHALL NOT 出现。文案 SHALL NOT 含任何评价词（好棒/真不错/坚持）。

#### Scenario: 完成先被接住再被邀请
- **WHEN** 用户点击"做完啦"
- **THEN** 先见落册动效与确认文案，之后聊聊邀请出现；急躁点击可立即跳到邀请

#### Scenario: 非完成路径无一拍
- **WHEN** 用户点击"不想做了，移除"或"← 返回"
- **THEN** 直接执行原有行为，无动效无文案

### Requirement: 聊聊邀请含照片敞口
聊聊邀请文案 SHALL 包含照片敞口（如"拍了照的话，也可以给我看看"），语气为敞口而非要求；SHALL NOT 将发照片设为任何流程的前提。

#### Scenario: 邀请含敞口
- **WHEN** 完成一拍结束、聊聊邀请出现
- **THEN** 文案含照片敞口；用户不发照片时对话流程完全不受影响

### Requirement: 说完了归档可见化
"说完了"的收尾 SHALL 在既有收尾窗口（现有约 1.2 秒 minDisplay）内叠加"对话凝成一页、落进册子"动效，与收尾文案"这次说的，都在了"并存。SHALL NOT 因动效延长用户等待时间。归档失败静默时动效照常播放（用户无感知差异）。

#### Scenario: 归档看得见
- **WHEN** 用户点击"说完了"
- **THEN** 在现有收尾时长内看到落册动效与收尾文案，随后对话关闭，总时长不长于现状

