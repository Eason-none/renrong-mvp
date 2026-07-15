## 1. 呼吸节奏点

- [x] 1.1 BreathingGuide.vue：阶段文字下方渲染节奏点排（数量=阶段秒数），每秒经 `later()` 点亮一颗，0.4s 透明度缓变；跳过时随 `clearTimers()` 清理；无数字、无开关

## 2. 出生日期可选

- [x] 2.1 BasicInfoSettings.vue：出生日期已选时字段行内显示"清除"入口，点击置空 `form.birth_date`（无确认弹窗）
- [x] 2.2 DailyCard.vue：`isInfoComplete` 去掉 `birth_date` 项，仅判玩家 ID 与场景偏好

## 3. 聊天体验

- [x] 3.1 ChatView.vue：输入行 `padding-bottom` 增加并叠加 `env(safe-area-inset-bottom)`，与键盘形成分离留白
- [x] 3.2 ChatView.vue：等待补充语（3s 首条淡入，此后每 5s 轮换文案池，轻语气）；首字到达、完整回复、失败、卸载均清理；快速响应不闪现

## 4. Prompt 打磨

- [x] 4.1 deepseek.js buildSummaryPrompt：加入"原话是引用的素材而非拼接的积木，用自然叙述串联原词"的措辞，既有禁评价/禁定性词/[无内容] 约束不动
- [x] 4.2 qwen.js buildMainChatSystemPrompt：次数型硬规则（"最多一次""不再追问"）改为能量匹配式渐进描述 + 降温过渡要求，保留"不连环提问"底线；buildThreeGoodThingsSystemPrompt 对应句同步核对

## 5. 返回标加大

- [x] 5.1 各含返回标组件（ChatView/TracePage/ShareCardPreview/DiaryNotebook/NavBar/BasicInfoOverlay/DailyTaskFlow/InstantFlow/CollectionDetail/ReviewView/AllReviewsView）：返回/回去/合上标字号 +2rpx 并加 padding 扩大热区

## 6. 第二批追加（2026-07-15 拍板）

- [x] 6.1 BreathingGuide.vue：海浪环境音（static/audio/breathing-sea.mp3 打包内置，起播挂"我准备好了"，2s 淡入 0.5、收尾 0.6s 淡出停止，"海浪声 开/关"开关不持久化，onError 静默降级）
- [x] 6.2 imageCompress.js：THUMB_MAX_EDGE 300→900（分享卡照片画质根因；小程序端 compressedWidth 同一常量自动跟随）

## 7. 验证

- [x] 7.1 跑既有 verify 脚本（conversation/storage/library 等）确认无回归
- [ ] 7.2 真机验收：呼吸节奏点跟得上+海浪声起停与开关、出生日期清除链路、输入行留白、长等待轮换补充语出现与撤除、话多/话少两轮对话收束不突兀、旧对话重生成摘要对比拼接感、新照片分享卡清晰度对比、各返回标点击热区
