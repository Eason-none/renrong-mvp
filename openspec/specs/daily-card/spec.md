# daily-card Specification

## Purpose
TBD - created by archiving change daily-task-system. Update Purpose after archive.
## Requirements
### Requirement: 每日首次打开展示日推卡片
App 每天首次启动时 SHALL 展示地球Online日推卡片。系统 SHALL 将当日日期（YYYY-MM-DD）与存储中的 `DailyCardShownDate` 比对，不同时触发卡片展示并更新该值。同一天内多次打开 App SHALL NOT 重复展示卡片。

#### Scenario: 首次打开当天新的一天
- **WHEN** 用户打开 App，且存储中 `DailyCardShownDate` 与当日日期不同（或为空）
- **THEN** 系统展示日推卡片，并将 `DailyCardShownDate` 更新为当日日期

#### Scenario: 同一天再次打开
- **WHEN** 用户当天已触发过卡片，再次打开 App
- **THEN** 系统不展示卡片，直接进入正常主界面

### Requirement: 卡片展示玩家个性化信息
卡片 SHALL 展示以下信息，均来自 BasicInfo 存储：玩家 ID、出生日期换算的累计存活天数、当前城市（GPS获取）、天气状况（天气 API 获取）。

#### Scenario: BasicInfo 已完整录入且 GPS/天气成功
- **WHEN** 卡片展示时 BasicInfo 中玩家 ID 和出生日期均已填写，GPS 授权通过，天气 API 返回正常
- **THEN** 卡片显示："尊敬的地球online玩家：{玩家ID}，您好。当前累计生存时长为 {天数} 天！今日编号为：{YYYY/MM/DD}。您当前登陆的城市为：{城市名}！区域环境情况：{天气描述}！"

#### Scenario: BasicInfo 未录入
- **WHEN** 卡片展示时玩家 ID 未填写
- **THEN** 玩家 ID 处显示"旅行者"；若出生日期未填，累计生存天数行不显示

#### Scenario: GPS 授权被拒绝或天气 API 失败
- **WHEN** 用户拒绝 GPS 授权，或天气接口调用失败
- **THEN** 城市显示"未知"，天气显示"未知"，卡片其余内容正常展示，不阻断卡片呈现

### Requirement: 卡片展示固定提醒文案
卡片 SHALL 在玩家信息之后展示固定文案，文案内容为：「请重视自己的感受而非必须有产出的绩效，请尝试在固有的工作和生活节奏之余做一些没意义但有意思的事。」

#### Scenario: 任意卡片展示场景
- **WHEN** 日推卡片展示
- **THEN** 固定文案始终出现，不因 BasicInfo 是否填写而改变

### Requirement: 卡片展示当日三个候选每日任务
卡片 SHALL 展示当日三个候选任务，每个候选任务显示标题和钩子文案（hook）。候选任务 SHALL 根据用户场景偏好从内容池匹配抽取（见 daily-task-content spec）。

#### Scenario: 正常展示三个候选
- **WHEN** 内容池匹配后候选池 ≥ 3 条
- **THEN** 随机抽取 3 条，各自显示标题和 hook 文案，附"领取"按钮

#### Scenario: 候选池不足三条
- **WHEN** 场景匹配后候选池 < 3 条
- **THEN** 用通用标签（`general`）条目补足至 3 条

### Requirement: BasicInfo 未完整时引导完善
若 BasicInfo 不完整，卡片 SHALL 在末尾显示「去完善你的信息」入口，点击后跳转基本信息设置页。

#### Scenario: 信息不完整时显示引导
- **WHEN** BasicInfo 中玩家 ID 或出生日期或场景偏好为空
- **THEN** 卡片底部显示"去完善你的信息 →"，点击跳转基本信息设置

