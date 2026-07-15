# Design: add-share-cards

## Context

日记页数据齐备：`completionSummaries`（summary_text / photo_thumb / completed_at）+ 标题反查（getDailyTaskById / getCollectionItemById / THREE_GOOD_THINGS_TITLE，diaryNotebook.js 已有同款反查链）。回顾数据在 ReviewSnapshot（text / collection_id）。展示入口 TracePage（重逢弹层）与 ReviewView 均为现成组件。MVP 无后端：小程序码的带参生成接口（getwxacodeunlimit）需要服务端 access_token，前端拿不到。

## Goals / Non-Goals

**Goals:**
- 用户从 TracePage / 回顾页一步预览、二步存进相册
- 卡片视觉与产品标本册质感同源（色板 token、纸纹、楷体正文）
- 红线可验收：无数字、无打卡词、入口永不主动弹出

**Non-Goals:**
- 不做带 scene 参数的动态太阳码（需后端，生产阶段随代理一起做）
- 不做分享事件 analytics 上报（与 scene 参数同期评估）
- 不做 H5 端保存（主战场是小程序相册→微信会话，H5 后置）
- 不改照片压缩策略（待决事项 #11 独立处理）

## Decisions

### D1 数据组装与绘制分层：纯函数模型 + canvas 渲染器

`src/utils/shareCard.js` 导出纯函数：
- `buildDiaryCardModel(page)` → `{ kind: "photo"|"text", date, period, title, lines[], photoThumb? }`（三件幸福小事 → lines 为三条原文；普通页 → lines 为摘要）
- `buildReviewCardModel(snapshot, collectionName, useFullText)` → `{ kind: "letter", collectionName, paragraphs[] }`，`useFullText=false` 时截取首段（首个换行符前，无换行则前 120 字 + 省略号）

绘制在 `ShareCardPreview.vue` 内用 canvas 2d（wx.createCanvasContext 新接口 type="2d"），输入即模型。理由：模型层可被 `verify-shareCard.mjs` 直接断言（节选规则、三版式分派、红线字段不存在），canvas 只负责像素，真机验收。

### D2 预览即确认，保存是唯一动作

点「保存这一页」→ 全屏预览 overlay（已绘好的卡）→ 底部单按钮「存进相册」。回顾卡预览多一个开关「只这一段 / 全文」（默认只这一段），切换即重绘。不提供"直接转发"按钮——先进自己的相册，发不发是相册里的下一步，语序本身就是"感知先于展示"。

### D3 太阳码 MVP 降级：静态码图打包进资源

预先在小程序后台生成一张不带参的太阳码 PNG，作为静态资源打包，绘卡时贴图。生产阶段有代理后换 getwxacodeunlimit 带 scene 参数，绘制层只换图片来源一行。理由：不为一张码提前搭后端；渠道归因数据损失在内测期可接受。

### D4 相册授权失败的语气兜底

`wx.saveImageToPhotosAlbum` 授权被拒 → 展示温婉提示（「相册没有打开，可以在右上角设置里允许保存」类），提供打开设置入口（wx.openSetting），不重复弹权限、不阻断预览关闭。canvas 导出失败 → 「这一页没存上，等下再试试」，无技术报错字样。

### D5 红线落在模型层强制

模型构造函数不接收、不输出任何计数/进度字段（完成度、次数、页数在类型上就进不来）；slogan 常量唯一（「给生活做点丰容」）；入口渲染条件只依赖"当前正在展示的页/回顾"，不存在任何自动触发路径。

## Risks / Trade-offs

- [photo_thumb 300px 放大发虚] → 接受：卡面照片区按 2 倍屏宽绘制会糊，首版把照片区设计尺寸压在缩略图原始像素的 1.5 倍内；根治靠待决事项 #11 调压缩参数
- [canvas 2d 在低端安卓机的字体渲染差异（楷体缺失回退宋体）] → 字体栈声明多级回退，真机验收覆盖一台安卓
- [长文回顾全文卡超出 canvas 高度限制] → 全文模式按段落测高动态算画布高度，超过 4096px 硬上限时强制回退节选模式并提示
- [用户把卡发到公开平台引来陌生流量，落地页承接不住] → 内测期太阳码指向小程序首页，量级极小；生产阶段随 scene 参数一起做落地承接

## Migration Plan

纯新增能力 + 两处页脚入口，无存储/数据迁移。回滚 = revert。依赖顺序：无（不依赖 add-instant-moment-fit）。

## Open Questions

（无——版式、红线、入口位置、节选默认、静态码降级均已由用户批准）
