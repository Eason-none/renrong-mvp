## MODIFIED Requirements

### Requirement: 每日任务内容池与图鉴层完全独立
每日任务内容 SHALL 存储在独立的内容文件（`src/content/daily_tasks.json`）中，与图鉴条目无任何共享或联动。完成每日任务 SHALL NOT 影响图鉴完成度。原推送层（`content_library_draft_v1.json` 的 `push_content`，38 条）SHALL 按 11 维场景标签体系重新映射 `scene_tags` 后并入本内容池，作为普通每日任务条目参与抽取；并入后代码 SHALL NOT 再读取 `push_content` 字段（该字段仅作运营历史档案保留）。

#### Scenario: 完成每日任务不影响图鉴
- **WHEN** 用户完成一条与图鉴某条目内容相似的每日任务
- **THEN** 图鉴对应条目的完成状态不发生任何变化

#### Scenario: 原推送层条目并入后可被正常抽取
- **WHEN** 用户 scene_tags 与某条原 push_content 条目（重映射后的标签）有交集
- **THEN** 该条目与原生每日任务条目同等参与日推卡片候选与"现在就来一件"抽取

#### Scenario: 历史 push 完成事件仍可反查标题
- **WHEN** 系统需要展示一条历史 `content_type: "push"` 完成事件对应的内容标题
- **THEN** 通过并入后的内容池按 content_id 查到原条目标题，不报错
