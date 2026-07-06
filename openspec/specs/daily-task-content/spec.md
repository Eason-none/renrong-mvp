# daily-task-content Specification

## Purpose
TBD - created by archiving change daily-task-system. Update Purpose after archive.
## Requirements
### Requirement: 每日任务内容池与推送层/图鉴层完全独立
每日任务内容 SHALL 存储在独立的内容文件中，与 `content_library_draft_v1.json` 中的推送内容和图鉴条目无任何共享或联动。完成每日任务 SHALL NOT 影响推送层去重池或图鉴完成度。

#### Scenario: 完成每日任务不影响图鉴
- **WHEN** 用户完成一条与图鉴某条目内容相似的每日任务
- **THEN** 图鉴对应条目的完成状态不发生任何变化

### Requirement: 每日任务内容条目格式
每条内容 SHALL 包含以下字段：
- `id`：唯一标识符（字符串）
- `title`：任务标题（简短，用于列表展示）
- `hook`：钩子文案（一句话，用于日推卡片候选预览，激发好奇心）
- `time`：预估时长（如"5分钟"、"通勤途中"）
- `instructions`：具体做法（完整说明，进入任务卡片后展示）
- `scene_tags`：场景标签数组，值来自预定义集合（见下方标签体系）

#### Scenario: 内容条目加载
- **WHEN** 系统需要为日推卡片抽取候选任务
- **THEN** 从内容文件中读取全部条目，按场景标签过滤后随机抽取

### Requirement: 场景标签体系
场景标签 SHALL 使用以下预定义值集合，与基本信息设置的场景偏好选项一一对应：

| 标签值 | 对应场景偏好 |
|---|---|
| `workspace` | 工位 |
| `classroom` | 教室 |
| `home` | 自己的房间 |
| `transit` | 地铁/公交 |
| `walking` | 步行/骑行 |
| `driving` | 私家车 |
| `convenience-store` | 便利店 |
| `canteen` | 食堂 |
| `gym` | 健身房 |
| `market` | 菜市场 |
| `general` | 通用（无特定场景要求，作为候选池不足时的补充） |

每条内容 SHALL 至少有一个场景标签。

#### Scenario: 标签匹配
- **WHEN** 用户的 scene_tags 集合为 {transit, workspace}，内容条目标签为 {transit}
- **THEN** 该条目进入候选池（任意交集即纳入）

### Requirement: 候选任务抽取规则
系统 SHALL 在展示日推卡片时，从内容池中按以下规则抽取 3 条候选任务：
1. 过滤出与用户 scene_tags 有任意标签交集的所有条目
2. 从过滤结果中随机抽取（排除已在 DailyTaskPool 中的条目）
3. 若过滤结果不足 3 条，用 `general` 标签条目补足
4. 若加上 general 仍不足 3 条，展示实际可用数量（不强制凑满）

#### Scenario: 正常匹配足够候选
- **WHEN** 用户场景标签匹配到 10 条内容，DailyTaskPool 中已有 1 条
- **THEN** 从剩余 9 条中随机抽取 3 条作为候选

#### Scenario: 匹配不足时补通用条目
- **WHEN** 场景匹配仅得到 1 条内容，general 池有 5 条
- **THEN** 从 general 池随机补 2 条，共展示 3 条候选

