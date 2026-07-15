# daily-task-content Delta: add-instant-moment-fit

## MODIFIED Requirements

### Requirement: 每日任务内容条目格式
每条内容 SHALL 包含以下字段：
- `id`：唯一标识符（字符串）
- `title`：任务标题（简短，用于列表展示）
- `hook`：钩子文案（一句话，用于日推卡片候选预览，激发好奇心）
- `time`：预估时长（如"5分钟"、"通勤途中"）
- `instructions`：具体做法（完整说明，进入任务卡片后展示）
- `scene_tags`：场景标签数组，值来自预定义集合（见下方标签体系）

每条内容 MAY 包含以下可选字段（仅供"现在就来一件"即时抽取的软优先使用，日推卡片候选逻辑不读取）：
- `moments`：时段亲和数组，取值 `morning | daytime | evening | late-night`——条目**特别适合**的时段，不是限定；缺省 = 全时段中性
- `weather_affinity`：天气亲和数组，首版取值 `rain | sunny`；缺省 = 与天气无关

#### Scenario: 内容条目加载
- **WHEN** 系统需要为日推卡片抽取候选任务
- **THEN** 从内容文件中读取全部条目，按场景标签过滤后随机抽取

#### Scenario: 可选字段缺省不影响抽取资格
- **WHEN** 某条目无 `moments` 与 `weather_affinity` 字段
- **THEN** 该条目在日推候选与即时抽取中均正常参与，仅不享受软优先

## ADDED Requirements

### Requirement: 时段/天气亲和打标准则
打标语义 SHALL 为"亲和加分"而非"时段限定"：只给**明显更适合特定时刻**的条目打标（如"路灯亮起来的瞬间"→ `evening`；听雨类 → `rain`），普适条目 SHALL 保持无标。错标/漏标的最坏结果 SHALL 仅为"退回无软优先的现行抽取行为"，不得使任何条目因打标而无法被抽中。打标为内容生产工作，SHALL 整表人工复核后落库，时段桶名与亲和标签 SHALL NOT 出现在任何用户可见界面或 analytics 载荷中。

#### Scenario: 打标不缩小可抽池
- **WHEN** 全池仅有 3 条命中当前时段桶的打标条目且均已完成
- **THEN** 即时抽取从其余无标/未命中条目中正常抽出，不出现因打标导致的空态

#### Scenario: 打标对用户不可见
- **WHEN** 用户浏览任务卡、日推候选或任何界面
- **THEN** 不出现"深夜特供""雨天推荐"等时段/天气标签文案
