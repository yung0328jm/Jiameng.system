# 佳盟事業群 - 企業管理系統

這是一個現代化的企業管理系統，採用深色主題和金色強調色設計。

## 功能特色

- 🔐 用戶登錄系統
- 📊 工程排程管理
- 📅 行事曆管理
- 🚗 車輛資訊管理
- 📝 備忘錄功能
- 👥 公司活動管理
- ⚙️ 下拉選單管理

## 技術棧

- React 18
- Vite
- React Router
- Tailwind CSS
- Supabase（選用，用於排程／請假／特休雲端同步）

## Supabase 同步連線（選用）

要讓排程、請假申請、特休天數在多裝置同步，請：

1. 在專案根目錄新增 `.env`，填入 Supabase 專案（例如 Jiameng.system）的 API 資訊：
   ```env
   VITE_SUPABASE_URL=https://你的專案-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=你的-anon-key
   ```
   上述值請到 Supabase 專案 **Settings → API** 複製 **Project URL** 與 **anon public** key。

2. 在 Supabase **SQL Editor** 執行 `docs/supabase-schema.sql`，建立表 `engineering_schedules`、`leave_applications`、`special_leave_quota` 及 RLS 政策。

3. 有設定上述環境變數時，登入後會先從雲端拉一輪資料再進入系統，之後新增／修改／刪除排程、請假、特休設定都會自動寫回 Supabase。

未設定時，所有資料仍只存於本機 localStorage，行為與原本相同。

## 安裝與運行

1. 安裝依賴：
```bash
npm install
```

2. 啟動開發服務器：
```bash
npm run dev
```

3. 構建生產版本：
```bash
npm run build
```

## 設計風格

- 深色主題（深灰色背景）
- 金色/黃色強調色（#FFD700）
- 現代化UI設計
- 響應式布局
