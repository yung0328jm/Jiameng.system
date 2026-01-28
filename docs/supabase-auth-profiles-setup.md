# Supabase 帳號管理：Auth + profiles 設定

依「帳號管理邏輯」：使用 **Supabase Auth** 管理登入／登出／session，用戶資料存於 **profiles** 表（account、display_name、is_admin），支援用 **email 或 account** 登入，路由依 **要登入** / **要 profiles.is_admin === true** 保護。

## 1. 建立 profiles 表（Supabase SQL Editor 執行）

**⚠️ 重要：** Supabase SQL Editor 只能執行「純 SQL」。  
**不要**複製本頁的標題（例如 `# Supabase 帳號管理`）或 Markdown 符號，否則會出現 `syntax error at or near "#"`。

**建議做法：** 開啟專案裡的 **`docs/supabase-profiles.sql`**，把該檔案的**全部內容**複製到 SQL Editor 再按 Run。

若要在本頁複製，請**只複製下面程式碼區塊內**的內容（從第一行 `-- profiles` 開始，到最後一行 `authenticated;` 為止），不要複製「\`\`\`sql」或標題。

```sql
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

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- 註冊時允許插入自己的 profile（id = auth.uid()）
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- 允許 anon 呼叫 get_email_by_account（僅用於登入時查 email）
grant execute on function public.get_email_by_account(text) to anon;
grant execute on function public.get_email_by_account(text) to authenticated;
```

**若你之前已跑過上述 SQL**，只需在 SQL Editor 再執行 **`docs/supabase-profiles.sql`** 裡**最後兩段**（`get_all_profiles` 與 `set_profile_admin`），用戶管理頁才能正確顯示並修改 profiles 的管理員。

## 2. 欄位說明

| 欄位 | 說明 |
|------|------|
| id | 對應 auth.users(id)，主鍵 |
| account | 帳號（唯一），登入時可用此欄查 email |
| display_name | 顯示名稱 |
| is_admin | 是否為管理員（路由 ProtectedRoute 用） |
| email | Auth 用 email，用 account 登入時由此取得 |

## 3. 管理員設定

- 管理員由 **profiles.is_admin** 決定。
- 在資料庫手動設定：`update profiles set is_admin = true where account = 'admin';`

## 4. 登入流程

- **用 email 登入**：直接 `auth.signInWithPassword({ email, password })`。
- **用 account 登入**：先呼叫 `get_email_by_account(account)` 取得 email，再 `auth.signInWithPassword({ email, password })`。

## 5. 路由保護

- **UserProtectedRoute**：要登入（有 session）才可進入。
- **ProtectedRoute**：要 `profiles.is_admin === true` 才可進入（例如用戶管理、下拉選單管理）。

## 6. 確保用戶資料正確儲存

- **註冊**：`signUpWithProfile` 會先建立 Auth 用戶，再 `insert` 一筆 `profiles`（id、account、display_name、is_admin、email），並在寫入後重新查詢該筆 profile 以確認。
- **登入**：登入成功後會依 `auth.users.id` 查詢 `profiles`，將 `account`、`is_admin` 同步到本地（authStorage），供路由與 UI 使用。
- **重整頁面**：App 啟動時若偵測到 Supabase，會呼叫 `getSession()` 與 `getProfile()` 還原登入狀態與角色，確保與資料庫一致。
