# trace-reencounter Delta: add-share-cards

## MODIFIED Requirements

### Requirement: 重逢弹层展示日记页
系统 SHALL 提供统一的重逢弹层（底部弹层），展示一页日记：完成日期（"10月14日 · 傍晚"粒度）、条目标题、"那天你说："引导语 + 摘要原文、照片缩略图（`photo_thumb` 非空时）。弹层 SHALL NOT 包含任何评价性文案或计数；SHALL NOT 包含主动弹出式的分享引导。弹层页脚 MAY 常驻一处安静的「保存这一页」文字入口（与「← 返回」同级样式，行为见 share-card 能力），该入口 SHALL NOT 使用按钮强调样式、SHALL NOT 附带任何红点或动效提示。

#### Scenario: 完整日记页展示
- **WHEN** 用户点开一条有摘要有照片的痕迹
- **THEN** 弹层显示日期、标题、"那天你说：…"原话摘要与照片缩略图

#### Scenario: 无照片的页
- **WHEN** 用户点开一条有摘要无照片的痕迹
- **THEN** 弹层正常显示文字内容，不出现照片占位或"没有照片"暗示

#### Scenario: 保存入口安静常驻
- **WHEN** 用户打开任意重逢弹层
- **THEN** 页脚存在「保存这一页」文字入口，无高亮、无动效、无引导气泡
