-- 站內信推播：存放各帳號的 FCM 推播 token（後端發送推播時依 account 查詢）
-- 在 Supabase SQL Editor 執行此檔

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  account text not null,
  token text not null,
  platform text not null default 'android',
  updated_at timestamptz not null default now(),
  unique(account, platform)
);

create index if not exists idx_push_tokens_account on public.push_tokens(account);

alter table public.push_tokens enable row level security;

drop policy if exists "Allow anon read write push_tokens" on public.push_tokens;
create policy "Allow anon read write push_tokens"
  on public.push_tokens for all to anon using (true) with check (true);
drop policy if exists "Allow authenticated read write push_tokens" on public.push_tokens;
create policy "Allow authenticated read write push_tokens"
  on public.push_tokens for all to authenticated using (true) with check (true);

-- 說明：Edge Function send-push 會用 service_role 查此表並呼叫 FCM，不需透過 RLS。
