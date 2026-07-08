# 指标体系 · 技术设计

## Context

产品行为数据全部在本地 storage（`src/state/storage.js`），Supabase 项目目前只承载两个 LLM 代理 edge function。客户端已持有 `VITE_SUPABASE_ANON_KEY`（用于敲代理网关），`uni.request` 是既有网络层惯例。所有完成行为收敛在唯一漏斗 `createCompletionEvent`（`src/state/completionEvent.js`），自带 `content_type` / `content_id` / `collection_id` 字段。

指标决策已在 grill 阶段稳定（见 proposal）：北极星 = 首用后 7 天内自发回访且再完成；最小事件集 3 个；隐私零个人信息；反指标清单写死。

## Goals / Non-Goals

**Goals:**
- 上线前打通"客户端 → Supabase events 表"的匿名事件链路，覆盖 3 个事件。
- 事件对用户完全不可感知：无 UI、无阻塞、失败静默。
- `metrics.md` 落库：北极星 SQL、诊断切片 SQL、反指标清单。

**Non-Goals:**
- 不做看板、自动报告、告警。
- 不采漏斗/页面级/中间步骤事件（微信数据助手已覆盖页面维度）。
- 不做用户画像、A/B 实验框架。
- 不处理对抗性刷量（anon key 公开可写是已接受的风险，见 Risks）。

## Decisions

### D1 上报通道：PostgREST 直插，不走 edge function
客户端用 `uni.request` 直接 POST `{SUPABASE_URL}/rest/v1/events`，带 anon key。events 表开 RLS：anon 角色**只允许 INSERT**，无 SELECT/UPDATE/DELETE。
备选是再写一个 edge function 中转——多一层部署物却不带来任何过滤能力（function 一样是匿名可调），排除。

### D2 匿名标识：本地随机 UUID，不用 openid
首次启动生成 UUID 持久化到 storage 新键 `ANALYTICS_ANON_ID`，此后所有事件带它。
不用微信 openid：需要 login 链路 + 服务端换取（复杂度），且 openid 可关联微信身份（隐私更差）。不用用户手填的 `player_id`：那是用户称呼，属个人信息（grill 阶段已排除）。
接受的代价：用户删小程序重装 = 新用户。早期样本下失真可忽略。

### D3 session_start 触发点：App onShow，分析口径天级去重
`onShow`（含冷启动和切后台返回）都报，客户端不做去重——去重逻辑放在 SQL 口径里（按 anon_id + 天 DISTINCT）。北极星是天级判定，事件多报不影响口径；客户端保持无状态最简。
备选 onLaunch（只报冷启动）会漏掉"切回来继续用"这种真实回访形态，排除。

### D4 task_completed 挂接：createCompletionEvent 内部
在唯一漏斗里加一次上报调用，载荷直接复用既有字段（`content_type` / `content_id` / `collection_id`）。不在各 UI 入口分别埋——漏斗保证未来新入口自动覆盖。

### D5 review_opened 挂接：回顾入口点开处
用户点开图鉴回顾入口时上报（无论快照是否已生成、生成是否成功），带 `collection_id`。口径上分母（点亮过图鉴的人）由 `task_completed` + 静态内容库条目数推导，不另设曝光事件。

### D6 可靠性：失败入有界本地队列，下次启动随批重发
上报 fire-and-forget；失败的事件写入 storage 待发队列（上限 200 条，超限丢最旧），每次 App onShow 先冲队列再报本次 session_start。载荷带 `client_ts`（事件真实发生时间），服务端另有 `inserted_at`；重发场景以 `client_ts` 为分析时间。
备选"失败即丢"最简，但早期每个种子用户的事件都珍贵，一个 200 行的队列换回它值得。不做定时重试/指数退避——下次启动就是天然的重试时机。

### D7 环境门槛：仅生产构建上报
开发/H5 调试环境（`import.meta.env.DEV`）不发任何事件，避免污染数据。不需要独立的 staging 表。

### D8 表结构

```sql
create table events (
  id bigint generated always as identity primary key,
  anon_id text not null,
  event text not null,          -- session_start | task_completed | review_opened
  content_type text,            -- task_completed: collection_item | daily_task
  content_id text,
  collection_id text,
  client_ts timestamptz not null,
  inserted_at timestamptz not null default now()
);
-- RLS: enable; policy 仅允许 anon INSERT；无任何读策略。
```

列就是载荷白名单本身：表里没有能放个人信息的列。

## Risks / Trade-offs

- [anon key 公开，任何人可向 events 表写垃圾] → 接受：早期无对抗价值；分析时可按 anon_id 行为形态剔异常；若真被刷再上 edge function + 简单校验，表结构不变。
- [客户端时钟不可信，client_ts 可能偏差] → 北极星是 7 天窗口的天级判定，小时级偏差无影响；极端异常值在 SQL 里用 inserted_at 交叉剔除。
- [删重装导致 anon_id 重置，北极星分母虚增] → 已接受（D2）；解读数据时记住这个失真方向（北极星只会被低估不会被高估，结论偏保守是安全方向）。
- [微信 request 域名白名单] → supabase.co 域名因 LLM 代理已在白名单，无新增配置；上线检查单里确认一次。
- [未来内容扩容后"点亮图鉴"分母口径漂移] → 已知限制，记录在 metrics.md：扩容时该查询需按内容版本对齐（grill 阶段决策：现在不上报版本号）。

## Migration Plan

1. Supabase 建表 + RLS（SQL 一次执行，可随时 drop 回滚——表独立，不接触既有 function）。
2. 客户端上报模块合入（纯增量，不改任何既有行为；回滚 = 删调用点）。
3. 微信后台隐私保护指引新增"使用记录"声明（上线前置项）。
4. `metrics.md` 入库。

## Open Questions

（无——grill 阶段已全部收敛。）
