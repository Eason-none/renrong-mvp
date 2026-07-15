# collection-review Delta: add-share-cards

## ADDED Requirements

### Requirement: 回顾页提供保存入口
回顾页页脚 SHALL 常驻一处安静的「保存这一页」文字入口（与返回操作同级样式），点击进入 share-card 能力定义的回顾信纸卡预览流程（默认节选、全文需勾选）。该入口 SHALL NOT 在回顾生成完成的瞬间以任何形式主动引导；回顾快照的生成、定格与棘轮机制 SHALL 不因保存动作发生任何变化。

#### Scenario: 从回顾页保存节选卡
- **WHEN** 用户在已生成的回顾页点「保存这一页」并直接确认
- **THEN** 存入相册的是节选版信纸卡，快照数据无任何变化

#### Scenario: 生成完成不引导保存
- **WHEN** 回顾叙事首次生成完成并展示
- **THEN** 页面不出现任何指向保存入口的弹窗、气泡或高亮
