# analytics-events Specification

## ADDED Requirements

### Requirement: 匿名上报标识
系统 SHALL 在首次启动时生成随机 UUID 作为上报标识（`anon_id`），持久化到本地 storage 键 `ANALYTICS_ANON_ID`，此后所有事件 SHALL 携带同一 `anon_id`。该标识 SHALL NOT 由任何用户输入（含用户手填的 `player_id` 称呼）、微信身份（openid/unionid）或设备标识派生。

#### Scenario: 首次启动生成并复用
- **WHEN** 用户首次启动应用，随后多次使用
- **THEN** 首次启动生成一个 UUID 并持久化，后续所有事件携带同一个值

#### Scenario: 与个人信息无关联
- **WHEN** 用户在设置里填写或修改称呼（player_id）、生日、场景标签
- **THEN** `anon_id` 不变，且这些信息不出现在任何上报载荷中

### Requirement: 最小事件集
系统 SHALL 且 SHALL ONLY 上报以下三个事件；SHALL NOT 上报任何页面访问、中间步骤、点击或其他行为事件：

1. `session_start`：App onShow 时（含冷启动与后台切回），无业务属性。
2. `task_completed`：`createCompletionEvent` 成功创建完成事件时，携带 `content_type`、`content_id`、`collection_id`（非图鉴条目时为 null）。
3. `review_opened`：用户点开图鉴回顾入口时（无论快照是否已生成、生成是否成功），携带 `collection_id`。

#### Scenario: 完成图鉴条目
- **WHEN** 用户对某图鉴条目点"做完啦"，本地 CompletionEvent 创建成功
- **THEN** 上报 `task_completed`，载荷含 content_type=collection_item、该条目 content_id 与 collection_id

#### Scenario: 完成每日任务
- **WHEN** 用户完成一个每日任务
- **THEN** 上报 `task_completed`，content_type=daily_task，collection_id 为 null

#### Scenario: 点开回顾（生成失败也算）
- **WHEN** 用户点开已点亮图鉴的回顾入口，回顾生成流程随后失败
- **THEN** `review_opened` 仍已上报（口径是"打开"，不是"生成成功"）

#### Scenario: 切后台返回
- **WHEN** 用户将小程序切至后台后再切回
- **THEN** 上报一次 `session_start`（天级去重是查询口径的职责，客户端不去重）

### Requirement: 隐私边界
上报载荷 SHALL ONLY 包含：`anon_id`、事件名、`content_type`、`content_id`、`collection_id`、`client_ts`。以下数据 SHALL NOT 以任何形式出现在上报中：用户称呼、生日、场景标签、对话文本、摘要、回顾快照、位置、天气。小程序隐私保护指引 SHALL 声明"使用记录"收集项。

#### Scenario: 载荷白名单
- **WHEN** 任一事件上报发出
- **THEN** 请求体中仅含白名单字段，抓包检查不存在任何个人信息字段

### Requirement: 上报静默且不阻塞
上报 SHALL 完全静默：无任何 UI 反馈、SHALL NOT 阻塞或延迟任何用户流程；上报失败 SHALL NOT 产生用户可见的错误。上报 SHALL 仅在生产构建发出，开发环境（`import.meta.env.DEV`）SHALL NOT 发送任何事件。

#### Scenario: 断网时完成任务
- **WHEN** 用户在无网络状态下完成任务
- **THEN** 本地 CompletionEvent 照常创建，完成流程（含聊聊邀请）不受任何影响，无错误提示

#### Scenario: 开发环境零上报
- **WHEN** 开发者在本地 H5 调试完成任务
- **THEN** 不发出任何事件请求

### Requirement: 失败事件有界重发
上报失败的事件 SHALL 进入本地待发队列（上限 200 条，超限时丢弃最旧）；下次 App onShow 时 SHALL 先重发队列再上报本次 `session_start`。事件 SHALL 携带 `client_ts`（事件实际发生时间），重发不改变 `client_ts`。

#### Scenario: 断网事件下次启动补发
- **WHEN** 用户断网完成 2 个任务，次日联网打开小程序
- **THEN** 2 条 `task_completed` 补发成功，其 `client_ts` 仍为昨日实际完成时间

#### Scenario: 队列有界
- **WHEN** 待发队列已有 200 条且新事件上报失败
- **THEN** 丢弃最旧一条，新事件入队，storage 不无限膨胀

### Requirement: 服务端只写不读
Supabase `events` 表 SHALL 启用 RLS，匿名角色 SHALL ONLY 拥有 INSERT 权限，SHALL NOT 可 SELECT/UPDATE/DELETE。表结构 SHALL 不含可存放个人信息的列。

#### Scenario: 客户端无法读取他人事件
- **WHEN** 任何持 anon key 的客户端尝试 SELECT events 表
- **THEN** 请求被 RLS 拒绝

### Requirement: 反指标约束
指标文档 `metrics.md` SHALL 定义：北极星（首次使用后 7 天内自发回访 ≥1 次且再次完成任务）、`review_opened` 口径（点亮过图鉴人群中的回顾打开率，分母由 task_completed + 静态内容库推导）、诊断切片。文档 SHALL 写死反指标清单：streak/连续使用天数、人均完成量目标、会话时长最大化、完成率 KPI SHALL NOT 被计算或进入任何常规报表；这些维度仅允许作为临时诊断查询存在。产品客户端 SHALL NOT 因指标体系新增任何用户可见的计数、进度或提醒。

#### Scenario: 反指标不进报表
- **WHEN** 每周按 metrics.md 跑常规查询
- **THEN** 输出中不存在 streak、人均完成量、时长、完成率等任何反指标数字

#### Scenario: 指标体系对用户不可见
- **WHEN** 用户使用产品的任何功能
- **THEN** 看不到任何由指标体系引入的计数、打卡、进度或催促元素
