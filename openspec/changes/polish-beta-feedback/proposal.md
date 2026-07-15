# polish-beta-feedback

## Why

第一批内测用户反馈集中暴露了几处"功能对、体验糙"的摩擦点：呼吸引导跟不上节奏、出生日期被感知为必填且选后无法清除、聊天等待无反馈且输入行贴死键盘、AI 摘要与收束生硬、返回标偏小。这些都不改变任何核心机制，但直接影响"是否传达了正确意图/体验"，应在推广前一批打磨掉。

## What Changes

- 呼吸引导：阶段文字下方新增一排随秒数柔和点亮的淡色节奏点（吸气4/屏息7/呼气8），提供进度感；明确不用数字倒计时、不加设置开关。
- 基本信息：出生日期选择后可清除（回到未填状态）；日推卡片"去完善你的信息"引导不再把出生日期计入完整性判断。
- 聊天等待：`···` 等待超过约 8 秒后淡入一句轻的等待语，更久再换一句（小程序端无流式，前几轮长回答等待可达十几秒）。
- 聊天输入行：与键盘之间增加分离留白，不再贴死键盘顶（内测截图确认零间距）。
- 摘要 prompt：原话定位从"拼接的积木"调整为"引用的素材"，允许自然叙述串联用户原词，消除生拼感。
- 主聊 prompt：把"深入邀请至多一次""话少则不追问"等次数型硬规则改为能量匹配式渐进描述，要求降温有过渡，消除"突然收束""动线只为写总结"的观感。
- 全局返回标（返回/回去/合上/图鉴返回）：字号微增并扩大点击热区。
- （2026-07-15 第二批拍板追加）呼吸环境音：海浪声打包内置，「我准备好了」起播、2s 淡入、收尾同步淡出，引导中可开关（默认开，不持久化不上报），失败静默降级。
- （同批追加）分享卡照片画质：落库压缩长边 300px→900px（根因：卡片照片区物理宽约 840px，300px 源图放大近 3 倍）；存量照片不迁移，存储余量真机压测观察。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `breathing-entry`: ①新增"阶段节奏可感"要求——每个呼吸阶段以非数字方式呈现按秒推进的进度暗示；②新增"呼吸环境音"要求。
- `basic-info-settings`: 出生日期新增"可清除"要求——已选择的出生日期可以清掉回到未填状态。
- `daily-card`: "BasicInfo 未完整时引导完善"的判定条件收窄——出生日期不再计入，仅玩家 ID 或场景偏好为空时显示引导。
- `diary-conversation`: ①"记忆扳机采集姿态"中的次数型硬规则（至多一次、话少不追问）改为能量匹配式渐进要求，且降温必须有过渡；②新增"等待有反馈"要求——回复等待超时后出现补充等待语。
- `diary-trace`: ①"摘要保留用户原话"补充软化条款——原话是引用素材而非拼接单元，摘要允许用自然叙述串联原词；②"照片以缩略图入痕"压缩规格 300px→900px（分享画质根因修复）。

## Impact

- `src/components/BreathingGuide.vue`：节奏点渲染与定时器。
- `src/components/BasicInfoSettings.vue`：出生日期清除入口；`src/components/DailyCard.vue`：`isInfoComplete` 判定。
- `src/components/ChatView.vue`：等待补充语计时器、输入行底部留白。
- `src/api/deepseek.js`：摘要 prompt 措辞；`src/api/qwen.js`：主聊 system prompt 措辞（三件幸福小事 prompt 的对应句一并核对）。
- 各含返回标组件的样式（ChatView/TracePage/ShareCardPreview/DiaryNotebook/NavBar/BasicInfoOverlay/DailyTaskFlow/InstantFlow/CollectionDetail/ReviewView/AllReviewsView）。
- 无数据结构、无存储、无上报事件变化；prompt 变更需真机对话回归验收。
