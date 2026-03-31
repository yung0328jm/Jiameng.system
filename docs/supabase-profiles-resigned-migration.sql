-- 既有專案請在 Supabase SQL Editor 執行此檔（若已從頭執行更新後的 supabase-profiles.sql 則可略過）
-- 離職人員：is_resigned = true 時拒絕登入；公開名單不顯示離職者

alter table public.profiles add column if not exists is_resigned boolean default false;

create or replace function public.set_profile_role(acc text, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_count int;
  target_is_admin boolean;
begin
  if (select coalesce(is_admin, false) from public.profiles where id = auth.uid()) is not true then
    raise exception 'Only admin can set profile role';
  end if;
  if new_role not in ('admin', 'user', 'resigned') then
    raise exception 'Invalid role';
  end if;
  select coalesce(is_admin, false) into target_is_admin from public.profiles where account = acc;
  if not found then
    raise exception 'User not found';
  end if;
  if target_is_admin and new_role <> 'admin' then
    select count(*) into admin_count from public.profiles where coalesce(is_admin, false) = true;
    if admin_count <= 1 then
      raise exception 'Cannot change the last admin role';
    end if;
  end if;
  if new_role = 'admin' then
    update public.profiles set is_admin = true, is_resigned = false where account = acc;
  elsif new_role = 'resigned' then
    update public.profiles set is_admin = false, is_resigned = true where account = acc;
  else
    update public.profiles set is_admin = false, is_resigned = false where account = acc;
  end if;
end;
$$;
grant execute on function public.set_profile_role(text, text) to authenticated;

-- 公開名單排除離職者（站內選人、排行榜等）
create or replace function public.get_public_profiles()
returns table (account text, display_name text, is_admin boolean)
language sql
security definer
set search_path = public
as $$
  select p.account, p.display_name, p.is_admin
  from public.profiles p
  where coalesce(p.is_resigned, false) = false;
$$;
grant execute on function public.get_public_profiles() to authenticated;
