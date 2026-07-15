# diary-conversation Specification

## Purpose
TBD - created by archiving change add-diary-trace-system. Update Purpose after archive.
## Requirements
### Requirement: 开场白问具体细节
对话开场白 SHALL 以具体细节为问句主体（如"有没有哪个瞬间/什么颜色/什么声音留下来了"），SHALL NOT 以抽象感受为问句主体（现状"这件事给你带来了什么感受吗"废止）。开场白 SHALL 保持现状的零 API 调用行为（本地模板生成）。

#### Scenario: 开场问细节
- **WHEN** 用户从聊聊邀请进入对话
- **THEN** 开场白围绕该任务问一个具体细节问题，不调用模型 API

### Requirement: 记忆扳机采集姿态
主对话 system prompt SHALL 引导模型：优先追问感官细节、地点、意外感等能在未来唤起记忆的具体线索；接住用户给出的具体内容（复述其原话中的细节）；深入邀请至多一次，跟随用户的表达能量，用户话少则不追问。既有约束（不评价、不指导、不布置任务）SHALL 保持。

#### Scenario: 接住细节并适度深入
- **WHEN** 用户说出一个具体细节（如"消防栓褪成粉色了"）
- **THEN** 模型回应中呼应该细节本身，至多追问一次相关的具体线索，不连环提问

#### Scenario: 用户话少不索取
- **WHEN** 用户回复简短且未展开
- **THEN** 模型不重复追问、不催促补充，以陪伴语气自然收束

### Requirement: 结束权永远在用户
"说完了"按钮 SHALL 始终可用；系统与模型 SHALL NOT 以任何形式阻拦、挽留或在结束前索取更多内容（如"再说一件吧"）。

#### Scenario: 随时结束
- **WHEN** 用户在对话任意时点点击"说完了"
- **THEN** 直接进入收尾流程，无任何确认弹窗或挽留话术

