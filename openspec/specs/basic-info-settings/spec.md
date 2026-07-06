# basic-info-settings Specification

## Purpose
TBD - created by archiving change daily-task-system. Update Purpose after archive.
## Requirements
### Requirement: 基本信息设置入口位于设置弹层
设置弹层 SHALL 新增「基本信息」列表项，点击后进入基本信息编辑页。基本信息编辑页可从设置弹层打开，也可从日推卡片的「去完善你的信息」引导入口打开。

#### Scenario: 从设置进入基本信息
- **WHEN** 用户点击设置弹层中的「基本信息」
- **THEN** 进入基本信息编辑页

#### Scenario: 从日推卡片引导进入
- **WHEN** 用户点击日推卡片底部「去完善你的信息 →」
- **THEN** 关闭日推卡片，打开基本信息编辑页

### Requirement: 基本信息包含玩家 ID 和出生日期
基本信息编辑页 SHALL 提供玩家 ID 文本输入框（必填用于日推卡片称呼）和出生日期选择器（用于计算存活天数）。两个字段均为可选填写，未填写时日推卡片使用降级展示（见 daily-card spec）。

#### Scenario: 填写玩家 ID
- **WHEN** 用户在玩家 ID 输入框填入文字并保存
- **THEN** BasicInfo 存储中 `player_id` 更新为该值，日推卡片即日起使用新 ID

#### Scenario: 选择出生日期
- **WHEN** 用户选择出生日期并保存
- **THEN** BasicInfo 存储中 `birth_date` 更新，日推卡片计算 `今日日期 - birth_date` 的天数差显示

### Requirement: 基本信息包含三维度场景偏好
基本信息编辑页 SHALL 提供三个多选维度，用于每日任务内容匹配：

- **维度一·主要待的地方**：工位 / 教室 / 自己的房间（多选）
- **维度二·通勤方式**：地铁/公交 / 步行/骑行 / 私家车（多选）
- **维度三·经常去的地方**：便利店 / 食堂 / 健身房 / 菜市场（多选）

用户 SHALL 能勾选任意数量选项，三个维度均为可选。

#### Scenario: 用户勾选场景偏好
- **WHEN** 用户勾选若干选项并保存
- **THEN** BasicInfo 存储中 `scene_tags` 更新为所有已勾选项的标签值集合，下一次日推卡片使用新的场景偏好匹配任务

#### Scenario: 三个维度均未勾选
- **WHEN** 用户未勾选任何场景选项
- **THEN** 日推卡片任务从通用池（`general` 标签）抽取

### Requirement: 基本信息可随时修改
用户 SHALL 能随时重新进入基本信息编辑页修改任意字段，保存后立即生效。修改场景偏好后，下一次打开 App 展示的日推卡片 SHALL 使用最新的场景偏好匹配任务。

#### Scenario: 修改后立即生效
- **WHEN** 用户修改基本信息并保存
- **THEN** 存储中的 BasicInfo 更新，不需要重启或特殊操作

