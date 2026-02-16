-- 在 Supabase SQL Editor 執行此檔，建立排程／請假／特休同步用表
-- 專案：Jiameng.system

-- 工程排程（整筆以 JSON 存放，與前端結構一致）
create table if not exists public.engineering_schedules (
  id text primary key,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- 請假申請
create table if not exists public.leave_applications (
  id text primary key,
  user_id text not null default '',
  user_name text not null default '',
  start_date text not null default '',
  end_date text not null default '',
  reason text not null default '',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  approved_by text default '',
  approved_at timestamptz
);

-- 特休可休天數（依帳號）
create table if not exists public.special_leave_quota (
  account text primary key,
  days int not null default 0
);

-- 啟用 RLS 時可依需求設 policy；以下為允許 anon 讀寫（方便前端直連，正式環境可再收緊）
alter table public.engineering_schedules enable row level security;
alter table public.leave_applications enable row level security;
alter table public.special_leave_quota enable row level security;

-- 允許 anon 與 authenticated 讀寫（登入後用 authenticated，未登入用 anon）
drop policy if exists "Allow anon read write engineering_schedules" on public.engineering_schedules;
create policy "Allow anon read write engineering_schedules"
  on public.engineering_schedules for all to anon using (true) with check (true);
drop policy if exists "Allow authenticated read write engineering_schedules" on public.engineering_schedules;
create policy "Allow authenticated read write engineering_schedules"
  on public.engineering_schedules for all to authenticated using (true) with check (true);

drop policy if exists "Allow anon read write leave_applications" on public.leave_applications;
create policy "Allow anon read write leave_applications"
  on public.leave_applications for all to anon using (true) with check (true);
drop policy if exists "Allow authenticated read write leave_applications" on public.leave_applications;
create policy "Allow authenticated read write leave_applications"
  on public.leave_applications for all to authenticated using (true) with check (true);

drop policy if exists "Allow anon read write special_leave_quota" on public.special_leave_quota;
create policy "Allow anon read write special_leave_quota"
  on public.special_leave_quota for all to anon using (true) with check (true);
drop policy if exists "Allow authenticated read write special_leave_quota" on public.special_leave_quota;
create policy "Allow authenticated read write special_leave_quota"
  on public.special_leave_quota for all to authenticated using (true) with check (true);

-- 其餘所有功能共用：key = localStorage 的 key，data = 整份 JSON
create table if not exists public.app_data (
  key text primary key,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.app_data enable row level security;
drop policy if exists "Allow anon read write app_data" on public.app_data;
create policy "Allow anon read write app_data"
  on public.app_data for all to anon using (true) with check (true);
drop policy if exists "Allow authenticated read write app_data" on public.app_data;
create policy "Allow authenticated read write app_data"
  on public.app_data for all to authenticated using (true) with check (true);

-- 啟用 Realtime（多人即時同步用）；已在 publication 則略過，可重複執行
do $$
begin
  alter publication supabase_realtime add table public.engineering_schedules;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.leave_applications;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.special_leave_quota;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.app_data;
exception when duplicate_object then null;
end $$;
