# add-share-card-styles

## Why

分享卡是传播出口，内测反馈希望能"自己装饰一下"。参考微信读书书摘的思路：同一页内容给几种排版性格 + 几张手账纸，用户轻选即换，不做贴纸/自由拖拽（第二档，另行评估）。样机已经用户定稿（2026-07-15，artifact 24ad9f94）：3 版式 × 5 纸样。

## What Changes

- 分享预览页新增两排轻选择器（复用"节选/全文"切换的视觉样式）：
  - **版式**（仅日记卡）：标本页（现状）/ 摘句（文字主角，居中大字+落款）/ 照片开窗（首图满幅在顶，仅有照片时出现该选项）
  - **纸样**（所有卡）：宣纸米（默认）/ 水彩晕 / 信笺线 / 叶影 / 苔点——纯白纸面取消，默认即有纸感
- 信笺线与正文逐行对齐（每行字坐在线上），layout() 已知每行 baseline，随文字绘制
- 叶影纹理与摘句版式的叶印使用完成一拍（CompletionBeat）同一片压花叶（对称轮廓+中轴+四条错落侧脉），叶影中叶片倾斜散布
- 选择是组件态：不落库、不上报、不进 card model（verify-shareCard 红线字段不变）

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `share-card`: 新增"卡面版式与纸样可选"要求（注意：share-card 主 spec 随 add-share-cards 归档落地，本变更需在其后归档）。

## Impact

- `src/components/ShareCardPreview.vue`：选择器 UI + layout() 版式分支 + 纸样绘制函数 + 适配层补 translate/rotate/scale/bezierCurveTo。
- 无数据结构、无存储、无上报变化；card model 字段不变。
