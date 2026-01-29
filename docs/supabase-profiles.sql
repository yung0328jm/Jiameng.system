-- 請將此檔案「全部內容」複製到 Supabase SQL Editor 執行
-- profiles：帳號、顯示名稱、是否管理員；id 對應 auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  account text unique not null,
  display_name text,
  is_admin boolean default false,
  email text not null
);

-- 供「用 account 登入」時查詢對應 email（僅回傳 email，不暴露其他欄位）
create or replace function public.get_email_by_account(acc text)
returns text
language sql
security definer
set search_path = public
as $$
  select email from profiles where account = acc limit 1;
$$;

-- 僅允許已登入用戶讀取／更新自己的 profile
alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- 註冊時允許插入自己的 profile（id = auth.uid()）
drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- 允許 anon 呼叫 get_email_by_account（僅用於登入時查 email）
grant execute on function public.get_email_by_account(text) to anon;
grant execute on function public.get_email_by_account(text) to authenticated;

-- 僅管理員可取得所有 profiles（用戶管理頁用）
create or replace function public.get_all_profiles()
returns setof public.profiles
language sql
security definer
set search_path = public
as $$
  select p.* from public.profiles p
  where (select is_admin from public.profiles where id = auth.uid()) = true;
$$;
grant execute on function public.get_all_profiles() to authenticated;

-- 供全站功能（排行榜分發/團體獎勵）使用：所有已登入用戶都可取得公開 profiles 清單
-- 只回傳 account / display_name / is_admin，不回傳 email，避免暴露敏感資料
create or replace function public.get_public_profiles()
returns table (account text, display_name text, is_admin boolean)
language sql
security definer
set search_path = public
as $$
  select p.account, p.display_name, p.is_admin
  from public.profiles p;
$$;
grant execute on function public.get_public_profiles() to authenticated;

-- 僅管理員可設定某帳號的 is_admin
create or replace function public.set_profile_admin(acc text, new_is_admin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select is_admin from public.profiles where id = auth.uid()) <> true then
    raise exception 'Only admin can set profile admin';
  end if;
  update public.profiles set is_admin = new_is_admin where account = acc;
end;
$$;
grant execute on function public.set_profile_admin(text, boolean) to authenticated;
