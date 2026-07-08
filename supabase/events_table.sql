-- 指标体系 events 表（openspec: add-metrics-system, design.md D8）
-- 在 Supabase Dashboard → SQL Editor 里整段执行一次。
-- 回滚：drop table events;（表独立，不接触既有 function）

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

-- RLS：匿名客户端只写不读（spec: 服务端只写不读）
alter table events enable row level security;

create policy "anon insert only"
  on events for insert
  to anon
  with check (true);

-- 不创建任何 select/update/delete 策略：RLS 开启且无策略 = 默认拒绝。
-- 分析查询走 Dashboard SQL Editor（service role，不受 RLS 限制）。
