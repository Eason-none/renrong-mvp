## 1. Supabase 服务端

- [x] 1.1 建 `events` 表（design.md D8 的 DDL：anon_id/event/content_type/content_id/collection_id/client_ts/inserted_at）
- [x] 1.2 启用 RLS：anon 角色仅 INSERT 策略，无任何读策略；用 anon key 实测 INSERT 成功、SELECT 被拒

## 2. 客户端上报模块

- [x] 2.1 新建 `src/state/analytics.js`：`ANALYTICS_ANON_ID` 键注册进 storage.js KEYS；首次调用时生成 UUID 并持久化
- [x] 2.2 实现 `track(event, props)`：白名单字段组装（含 client_ts）、`import.meta.env.DEV` 时直接 no-op、`uni.request` POST 到 `/rest/v1/events`（fire-and-forget，静默失败）
- [x] 2.3 实现有界待发队列：失败事件入 storage 队列（上限 200，超限丢最旧）；`flushQueue()` 重发不修改 client_ts
- [x] 2.4 Node 断言脚本（沿用项目现有 scripts/ 断言惯例，mock uni）：验证 anon_id 复用、DEV no-op、载荷白名单、队列上限丢弃策略

## 3. 三个挂接点

- [x] 3.1 App onShow：先 `flushQueue()` 再 `track("session_start")`
- [x] 3.2 `createCompletionEvent`（src/state/completionEvent.js）成功路径末尾：`track("task_completed", { content_type, content_id, collection_id })`
- [x] 3.3 回顾入口点开处（快照生成流程启动之前）：`track("review_opened", { collection_id })`——确保生成失败也已上报

## 4. 指标文档与合规

- [x] 4.1 新建 `metrics.md`：北极星定义与 SQL（首用后 7 天内自发回访≥1 次且再完成，按 anon_id+天去重）、review_opened 打开率 SQL（分母由 task_completed+内容库条目数推导）、完成分布诊断切片 SQL（聚焦 vs 分散）、反指标清单（永不计算/永不进报表）、已知失真备注（删重装、内容扩容后分母口径需按版本对齐）
- [x] 4.2 微信小程序后台隐私保护指引新增"使用记录"声明（记入上线检查单 manual_acceptance_checklist；域名白名单确认 supabase.co 已覆盖）

## 5. 端到端验证

- [x] 5.1 生产构建真机（或开发者工具生产模式）跑一遍：打开→完成任务→点开回顾，Supabase 后台确认 3 类事件落表、载荷无个人信息
- [x] 5.2 断网完成任务→联网重启，确认补发成功且 client_ts 为原发生时间
