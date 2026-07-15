# Proposal: add-share-cards

## Why

回顾叙事和手记页是产品里情绪浓度最高的产出，但目前只能在小程序内查看，没有任何出口。产品主动拆掉了全部留存/传播杠杆（无推送、无红点、记忆不追人），分享卡是唯一一个与理念自洽的内生传播面：用户主动把一页记忆保存成图片、自愿发给朋友——被分享者看到的是一页真实的生活，不是一张打卡海报。方案已经用户审阅批准（视觉 mockup 见 Artifact「分享卡片方案」，2026-07-11）。

## What Changes

- 新增**分享卡生成能力**：把日记页 / 回顾叙事绘制成竖版长图，保存到相册。三种版式：
  - 手记页卡·照片版（photo_thumb 作卡面 + 日期时段 + 标题 + 摘要）
  - 手记页卡·纯文字版（无照片的日记页与三件幸福小事共用，楷体正文 + 叶形符号）
  - 回顾信纸卡（图鉴名 + 叙事，**默认节选首段，分享全文需用户在预览中主动勾选**）
- 卡面固定元素：slogan「给生活做点丰容」+ 小程序码（MVP 阶段用预生成的静态码图，scene 渠道参数留到生产阶段有代理后启用）
- 入口：TracePage（重逢弹层）页脚与回顾页页脚各一处安静的文字入口「保存这一页」，与「← 返回」同级；**BREAKING（对既有规格）**：trace-reencounter 现行要求"弹层 SHALL NOT 包含分享入口"，本变更将其修改为"不含主动弹出式分享，允许页脚常驻的保存入口"
- 三条红线写入规格：卡面永无数字（日期除外）；文案永无打卡系词汇；入口永不在完成/聊聊/回顾生成的任何瞬间主动弹出
- 流程：点入口 → 生成卡片预览 overlay → 确认保存相册（回顾卡多一步节选/全文选择）；相册授权被拒时温婉提示引导，不阻断不重复索权

## Capabilities

### New Capabilities

- `share-card`: 分享卡生成与保存——三种版式的构成要素、红线约束、预览确认流程、太阳码 MVP 降级策略、相册授权处理

### Modified Capabilities

- `trace-reencounter`: 重逢弹层"无分享入口"要求放宽为"无主动弹出式分享；页脚允许常驻「保存这一页」文字入口"
- `collection-review`: 回顾页新增「保存这一页」入口与节选/全文预览选择（新增关注点，既有生成/棘轮/照片图集要求不变）

## Impact

- 新增：`src/utils/shareCard.js`（卡片数据模型组装，纯函数可断言）、`src/components/ShareCardPreview.vue`（预览 overlay + canvas 2d 绘制 + 保存）、`scripts/verify-shareCard.mjs`（数据组装断言）、静态太阳码图资源
- 修改：`src/components/TracePage.vue`（页脚入口）、`src/components/ReviewView.vue`（页脚入口 + 节选/全文选择）
- 文档同步：`manual_acceptance_checklist_v2.md`（保存流程/授权拒绝/红线核对）、`product_handoff.md`（功能清单）
- 不触碰：回顾快照生成与棘轮、completionSummaries 数据结构、analytics 载荷（分享事件上报留待生产阶段与 scene 参数一起评估）
- 已知约束：photo_thumb 现按长边约 300px 压缩落库，卡面放大清晰度有上限——接受（唯一留存物），照片压缩参数调整属待决事项 #11 独立处理
