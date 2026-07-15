# Tasks: add-share-cards

## 1. 数据模型层（纯函数，可断言）

- [x] 1.1 新增 `src/utils/shareCard.js`：`buildDiaryCardModel(page)`（照片版/纯文字版/三件小事分派）+ `buildReviewCardModel(snapshot, collectionName, useFullText)`（节选规则：首个换行前，无换行则前 120 字+省略号）；slogan 常量唯一；模型类型上不含任何计数/进度字段。实现注记：三件小事摘要是散文不保证多行，仅摘要天然多行时才启用叶形条目（不硬拆结构）
- [x] 1.2 新增 `scripts/verify-shareCard.mjs`：三版式分派、日期粒度、节选边界（无换行/超长/短文）、三件小事 lines 组装、模型键集合白名单（红线字段在类型上进不来）——全部通过

## 2. 绘制与预览

- [ ] 2.1 静态太阳码 PNG 资源落库【剩用户操作】：码图来源已封装为 `ShareCardPreview.vue` 顶部单一常量 `SUNCODE_IMAGE`，为空时绘制占位环（不发请求）；**待用户从小程序后台生成不带参静态码 PNG，放入 src/static/ 并填入常量**
- [x] 2.2 新增 `src/components/ShareCardPreview.vue`：全屏预览 overlay + canvas 绘制（照片版 cover 裁切圆角/纯文字版/信纸版三套布局，桌面绿底+纸面+胶带质感与 token 同源，楷体栈多级回退，mp 端 base64 照片先落临时文件）+「存进相册」保存（canvasToTempFilePath 2 倍导出 → saveImageToPhotosAlbum；H5 走下载）。两遍布局（先量高再落笔），双端构建通过
- [x] 2.3 回顾卡预览内「只这一段 / 全文」开关（默认节选），切换重绘；全文超画布上限（1400 逻辑px）自动回退节选 + 提示「全文有点长，这张卡先收下开头这一段。」
- [x] 2.4 授权与失败兜底：授权被拒 → 「相册没有打开…」+ [去设置]（uni.openSetting），不重复索权不阻断关闭；导出失败 → 「这一页没存上，等下再试试。」；用户主动取消不提示

## 3. 入口接线

- [x] 3.1 `TracePage.vue` 页脚新增「保存这一页」虚线文字入口（与「‹ 回去」同级样式，无按钮强调、无红点、无动效），三个调用方（图鉴条目/今日昨日完成/手记册）走同一 current 页，预览打开时 stop 触摸事件不与相邻翻页打架
- [x] 3.2 `ReviewView.vue` 页脚同款入口，进入信纸卡预览（取 snapshots[0] 快照文本）
- [x] 3.3 全链路核对"入口永不主动弹出"：grep 确认 ShareCardPreview 仅 TracePage/ReviewView 两处挂载，做完啦（CompletionBeat→invite）/ 说完了（ChatView finish）/ 回顾生成完成（ReviewView.generate）均无任何新增引导

## 4. 验收与文档

- [x] 4.1 `manual_acceptance_checklist_v2.md` 新增 §13 分享卡验收节（13.1-13.8：三版式、节选默认与超长回退、双端保存、授权拒绝、离线、红线核对、安卓字体回退、与相邻翻页共存）
- [ ] 4.2 真机（mp-weixin）验收：iOS + 一台安卓（楷体回退渲染）、长文全文卡、photo_thumb 清晰度确认【用户真机操作，按清单 §13】
- [x] 4.5 补齐入口盲区（2026-07-13，用户首验反馈"幸福小事没有分享逻辑"）：手记册条目卡此前无点击行为，幸福小事页与翻册子看到的历史页没有任何分享路径。落地：`diaryNotebook.js` 新增 `getBookTimeline()`（全册页时间线，三件幸福小事逐页独立）+ DiaryNotebook 点卡片打开 TracePage（复用其现成的 pages/startIndex 相邻翻页 props，幸福小事从当天第一段进入）→ 页脚「保存这一页」即分享。H5 实测通过（清单 13.11）
- [x] 4.6 分享首次说明气泡（2026-07-13 用户决策，与 chat-invite 同机制）：TracePage 与 ReviewView 共用 hintKey `share-save-entry`，第一次见到"页"或回顾时弹一次说明保存入口，全生命周期一次（清单 13.12）
- [x] 4.4 修复（2026-07-12，用户首验发现「‹ 回去」与节选/全文切换在 mp 端点不动）：根因=旧 canvas-id 接口在微信端是非同层原生组件（悬浮于一切普通组件之上、无视 z-index、吃掉手势，官方已停止维护）。mp-weixin 改用同层 `type="2d"` canvas（`legacyCtxAdapter` 把标准 2d 上下文适配成旧接口方法名，layout 绘制代码零改动；像素尺寸按 dpr 采样封顶 4096；drawImage 走 `node.createImage()` 预载；导出改传 canvas node），H5 保持旧接口（Chrome 实测回归通过：切换/关闭/绘制全正常）。附带加固：render 全程 try/finally 确保 drawing 标志不卡死、旧接口 draw 回调 600ms 兜底、照片预载失败降级为无照片版式
- [x] 4.3 `product_handoff.md` 同步：v8.6 注记更新为已实施、§12.1 功能清单加行、待决事项新增 11.5（静态码回填 / getwxacodeunlimit+scene / 分享 analytics / H5 保存体验）
