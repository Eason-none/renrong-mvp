# Tasks: remove-pushflow-merge-instant-task

## 1. 内容合并（先行，后续任务依赖新池）

- [ ] 1.1 产出 38 条 push_content 的 11 维 scene_tags 映射表（按 content_principles.md §五 定义初标），写入本变更目录 `retag_map.md` 供用户抽查；抽查通过后再执行 1.2
- [ ] 1.2 将重标签后的 38 条追加进 `src/content/daily_tasks.json`（保留原 id/title/hook/time/instructions，替换 scene_tags），确认与现有 42 条无 id 冲突
- [ ] 1.3 `content_library_draft_v1.json` 的 `push_content` 字段加 `_说明` 标注"已于 remove-pushflow 变更并入每日任务池，代码不再读取"
- [ ] 1.4 `scripts/verify-library.mjs` 同步断言：每日任务池 80 条、id 唯一、每条 scene_tags 均来自 11 维集合；删除推送层相关断言

## 2. 移除旧机制

- [ ] 2.1 删除 `src/components/PushFlow.vue`、`src/state/pushPool.js`、`scripts/verify-pushPool.mjs`
- [ ] 2.2 `src/pages/index/index.vue` 移除 PushFlow 引用；呼吸完成后常规布局 = "现在就来一件" + "今日任务候选"入口 + 我的日常任务 + 今日已完成
- [ ] 2.3 `src/state/completionEvent.js`：删除 `markPushDone` 导入与调用；`VALID_CONTENT_TYPES` 保留 `"push"`（历史事件兼容），补注释说明不再有创建入口
- [ ] 2.4 `src/state/storage.js`：KEYS 移除 `PUSH_GLOBAL_DONE_SET`
- [ ] 2.5 `src/content/library.js`：移除 push_content 读取与查询接口；全库 grep 确认无残留调用方（含按 content_id 反查标题的路径改走每日任务池）

## 3. "现在就来一件"

- [ ] 3.1 `index.vue` 新增"现在就来一件"按钮与 `instantTask` 视图状态：点击时按 `getBasicInfo().scene_tags` 复用 `getDailyTaskCandidates` 抽 1 条（排除 DailyTaskPool 已领取 + 今日已完成）
- [ ] 3.2 即时任务详情卡：复用每日任务详情卡样式，操作仅"做完啦"与"← 返回"（无"领取"、无"换一个"、无"不想做了移除"）
- [ ] 3.3 "做完啦"：`createCompletionEvent({contentType:'daily_task'})` + `saveCompletedTask` 计入今日已完成 → 聊聊邀请 → ChatView（layer 默认 push，退出不生成摘要）；"← 返回"不产生任何记录
- [ ] 3.4 池耗尽空态：抽取结果为空时展示温婉文案（大意"今天的都做过了，歇一歇也很好"），不报错不空白

## 4. 文档同步

- [ ] 4.1 `product_handoff.md`：§12.6 落差 #1 标记已解决；§12.1 功能表同步（场景选择行移除、新增即时入口行）
- [ ] 4.2 `spec_v1.md` 时效警告：场景三分类条目更新为"机制已删除（remove-pushflow 变更）"
- [ ] 4.3 `manual_acceptance_checklist_v2.md`：§3 整节替换为"现在就来一件"验收项（零决策抽取 / 做完啦进今日已完成 / 返回不留痕 / 空态降级）

## 5. 验收

- [ ] 5.1 全部 verify 脚本通过；`npm run build:mp-weixin` 通过
- [ ] 5.2 主页全流程走查：无场景三选残留；即时抽取与 scene_tags 匹配；做完啦→聊聊→"说完了"后 completionSummaries 不新增（推送层语义）
- [ ] 5.3 含历史 push 完成事件的旧存储数据下打开 App：历史对话入口正常、无报错
- [ ] 5.4 回归：日推卡片候选（此时来自 80 条池）、领取/完成、图鉴全链路行为不变
