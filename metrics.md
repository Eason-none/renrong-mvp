# 丰容指标体系

> 读者：只有维护者一个人。节奏：**每周跑一次**，不建看板、不做日报——样本量撑不起日级解读，日级波动全是噪声。
> 运行方式：Supabase Dashboard → SQL Editor 逐段执行（service role 不受 RLS 限制）。
> 运营基本盘（UV / 留存 / 页面访问 / 时长）看微信小程序后台"数据助手"，本文档不重复。
>
> 决策记录：`openspec/changes/add-metrics-system/`（proposal / design / specs）。

---

## 一、北极星：回访再完成率

**定义**：新用户在首次使用后的 7 个自然日内，回来并再次完成了任务的比例。

产品零催促——没有推送、没有红点、没有 streak——所以每一次回访都是纯自发投票。用户回来只可能因为上次真的有什么抵达了他。这是"普通时刻因产品变真实了一点"这个不可直接测量的核心假设，所能选到的最诚实代理信号。

**口径细则**：
- 首日 = 该 `anon_id` 第一条事件的日期（北京时间）。
- 达成 = 首日之后的 7 个自然日内存在 ≥1 条 `task_completed`。非首日的完成事件本身就证明了回访，无需单独校验 `session_start`。
- 不要求首日完成过任务——"首日只逛没做、第三天回来做了第一个"同样算达成（那也是产品把人拉回来了）。
- 分母只统计首日距今已满 7 天的用户（窗口未走完的不进分母）。

```sql
-- 北极星：回访再完成率（按首用周分组看趋势）
with firsts as (
  select anon_id,
         min((client_ts at time zone 'Asia/Shanghai')::date) as first_day
  from events
  group by anon_id
),
achieved as (
  select distinct e.anon_id
  from events e
  join firsts f using (anon_id)
  where e.event = 'task_completed'
    and (e.client_ts at time zone 'Asia/Shanghai')::date > f.first_day
    and (e.client_ts at time zone 'Asia/Shanghai')::date <= f.first_day + 7
)
select
  date_trunc('week', f.first_day)::date as cohort_week,
  count(*) as new_users,
  count(a.anon_id) as achieved_users,
  round(100.0 * count(a.anon_id) / count(*), 1) as north_star_pct
from firsts f
left join achieved a using (anon_id)
where f.first_day <= (now() at time zone 'Asia/Shanghai')::date - 7  -- 窗口走完才进分母
group by 1
order by 1;
```

---

## 二、诊断切片

诊断指标回答"北极星为什么是这个数"，**只做解释，不做目标**。

### 2.1 回顾打开率（点亮人群口径）

回顾入口只在图鉴 100% 点亮时出现。绝对数无意义（分散完成的用户从未见过入口），必须用比率口径：**点亮过 ≥1 本图鉴的人里，多少人打开过回顾**。分母由 `task_completed` + 静态内容库条目数推导，不依赖曝光埋点。

```sql
-- 回顾打开率。collection_sizes 与 src/content/library.js 同步维护（见 §四）。
-- 2026-07-12 同步：图鉴已重组为 8 本（角落/物件已删、时间实验并入城市探索），
-- 条目数与 scripts/verify-library.mjs 的 expectedCollections 一致。
with collection_sizes(collection_id, size) as (values
  ('collection_001', 8), ('collection_003', 8), ('collection_004', 7),
  ('collection_006', 10), ('collection_007', 7), ('collection_008', 9),
  ('collection_010', 6), ('collection_011', 7)
),
lit as (  -- 点亮过至少一本图鉴的用户
  select e.anon_id
  from events e
  join collection_sizes s using (collection_id)
  where e.event = 'task_completed' and e.content_type = 'collection_item'
  group by e.anon_id, e.collection_id, s.size
  having count(distinct e.content_id) >= s.size
),
lit_users as (select distinct anon_id from lit)
select
  (select count(*) from lit_users) as lit_user_count,
  (select count(distinct e.anon_id) from events e
    join lit_users using (anon_id)
    where e.event = 'review_opened') as opened_count,
  round(100.0 * (select count(distinct e.anon_id) from events e
    join lit_users using (anon_id) where e.event = 'review_opened')
    / nullif((select count(*) from lit_users), 0), 1) as review_open_pct;
```

### 2.2 完成分布：聚焦 vs 分散

用户把完成事件铺在几本图鉴上、每本走了多深。若普遍广撒不聚焦，说明"点亮一本"的路径可能太长——这是内容结构信号，驱动的是内容侧决策，不是催用户聚焦。

```sql
-- 每用户的图鉴触达广度与深度
with per_user_col as (
  select anon_id, collection_id, count(distinct content_id) as items_done
  from events
  where event = 'task_completed' and content_type = 'collection_item'
  group by anon_id, collection_id
)
select
  anon_id,
  count(*) as collections_touched,
  sum(items_done) as total_items,
  round(avg(items_done), 1) as avg_depth_per_collection
from per_user_col
group by anon_id
order by collections_touched desc;
```

### 2.3 聊聊率（2026-07-12 新增，chat_engaged 事件）

完成摘要 → 回顾叙事 → 手记册 → 重逢 → 分享卡，这半个产品的素材全部来自聊聊。聊聊率是这条管道的唯一供血阀门，低了下游集体饿死——它是解释北极星的第一优先切片。

**口径**：`chat_engaged` 只在对话**第一条用户消息**发出时上报（每对话至多一次）。"点聊聊进去没说话就说完了"的空对话不上报、不入分子——聊聊率反映实质开口，不被虚高。分母用 `task_completed`（两者经完成事件 1:1 对应）。

```sql
-- 聊聊率：按周 + 按内容类型
select
  date_trunc('week', (client_ts at time zone 'Asia/Shanghai')::date)::date as week,
  content_type,
  count(*) filter (where event = 'task_completed') as completed,
  count(*) filter (where event = 'chat_engaged') as engaged,
  round(100.0 * count(*) filter (where event = 'chat_engaged')
    / nullif(count(*) filter (where event = 'task_completed'), 0), 1) as chat_rate_pct
from events
where event in ('task_completed', 'chat_engaged')
group by 1, 2
order by 1, 2;
```

注意它进反指标清单的边界：聊聊率是**诊断指标**（解释回顾/手记/分享卡有没有素材），不是目标——不许为拉高它加催促机制，允许的手段只有"把记录的回报讲清楚"（如 chat-invite 首次气泡）这类信息补全。

### 2.4 内容方向：什么被完成得多

内容扩产解冻后往哪个方向投的直接依据。

```sql
-- 图鉴条目 / 每日任务 的完成分布
select content_type, content_id, collection_id,
       count(*) as times_completed,
       count(distinct anon_id) as distinct_users
from events
where event = 'task_completed'
group by content_type, content_id, collection_id
order by distinct_users desc, times_completed desc;
```

---

## 三、反指标清单（永不计算、永不进报表）

被展示的数字最终都会被优化（Goodhart 定律）。以下维度**禁止**出现在任何常规报表里，防止指标体系把产品拖回它明文反对的绩效逻辑（PRODUCT.md：不打卡、不设绩效、成功不是"做了多少事"）：

| 禁止项 | 为什么禁止 |
|---|---|
| streak / 连续使用天数 | 产品没有 streak，指标里也不许有——否则迟早长出签到功能 |
| 人均完成量目标 | "做了多少事"不是成功定义；量是诊断素材，不是目标 |
| 会话时长最大化 | 产品成功不是占用时间，时长接近反指标 |
| 完成率 KPI | 距离"打卡逻辑"一步之遥 |

这些维度只允许作为**临时诊断查询**存在（写在一次性会话里，跑完即弃），不写入本文档、不定期跑。

---

## 四、已知失真与维护备注

- **删除重装 = 新用户**：`anon_id` 是本地随机 UUID，重装后重置。北极星只会因此被**低估**不会被高估——结论偏保守，是安全方向。
- **内容扩容后分母漂移**：§2.1 的 `collection_sizes` CTE 是当前内容库（2026-07 冻结版）的快照。内容扩产解冻、图鉴条目数变化时，"点亮"的历史口径需按内容版本对齐——届时把 CTE 拆成按时间段生效的版本表，不需要客户端上报版本号。
- **客户端时钟**：`client_ts` 是事件真实发生时间（断网补发不改写），但依赖用户设备时钟；极端异常值可用 `inserted_at` 交叉剔除。天级口径下小时级偏差无影响。
- **开发环境零污染**：DEV 构建及未配置 `VITE_SUPABASE_URL` 时上报整体禁用（`src/state/analytics.js`），表里不会有调试数据。
