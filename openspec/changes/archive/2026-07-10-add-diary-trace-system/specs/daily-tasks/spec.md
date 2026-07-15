# daily-tasks Delta

## MODIFIED Requirements

### Requirement: 点击已领取任务进入完成流程
用户 SHALL 能点击「我的日常任务」列表中的任意条目，进入任务卡片展示→做完啦→完成一拍→聊聊邀请→对话（或跳过）的完整流程。完成一拍与邀请文案遵循 completion-beat；对话采用日记语义（diary-conversation / diary-trace）：开场问具体细节，退出时归档并按成页规则生成摘要。

#### Scenario: 点击任务进入卡片
- **WHEN** 用户点击「我的日常任务」中的某条任务
- **THEN** 展示该任务的完整内容卡片（标题、时长、具体做法），提供「做完啦」按钮

#### Scenario: 点击做完啦后先一拍再邀请
- **WHEN** 用户点击「做完啦」
- **THEN** 先呈现完成一拍（落册动效 + 指向体验的确认文案），随后展示聊聊邀请（问具体细节、含照片敞口），提供「聊聊」和「跳过」按钮

#### Scenario: 完成后从 DailyTaskPool 移除
- **WHEN** 用户点击「做完啦」（无论随后选择聊聊还是跳过）
- **THEN** 该任务从 DailyTaskPool 的未完成列表中移除，不再出现在「我的日常任务」区块
