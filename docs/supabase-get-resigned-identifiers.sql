-- 出工回報等：讓「非管理員」也能取得離職者帳號／顯示名，用於過濾勾選名單
-- （get_public_profiles 已排除離職者，前端無法從該 RPC 得知誰已離職）
-- 請在 Supabase SQL Editor 執行後，一般員工頁面才能正確隱藏離職人員。

create or replace function public.get_resigned_profile_identifiers()
returns table (account text, display_name text)
language sql
security definer
set search_path = public
as $$
  select p.account, p.display_name
  from public.profiles p
  where coalesce(p.is_resigned, false) = true;
$$;

grant execute on function public.get_resigned_profile_identifiers() to authenticated;
