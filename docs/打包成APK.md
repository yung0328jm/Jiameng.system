# 佳盟事業群 — 打包成 APK

用 **Capacitor** 把網頁包成 Android APK，休息後照下面步驟做即可。

---

## 一、環境需求

- **Node.js**（你已有）
- **Android Studio**（用來產生 APK）  
  下載：<https://developer.android.com/studio>  
  安裝時勾選 **Android SDK**。

---

## 二、步驟（在專案根目錄執行）

### 1. 安裝依賴

```bash
cd "C:\Users\user\Desktop\APP製作\jiameng2.0"
npm install
```

（若已裝過 Capacitor 可略過）

### 2. 建置網頁

```bash
npm run build
```

會產生 `dist/` 資料夾。

### 3. 加入 Android 專案（第一次要做）

```bash
npx cap add android
```

會產生 `android/` 資料夾。

### 4. 同步網頁到 Android

```bash
npx cap sync android
```

（或直接執行：`npm run build:android`，會先 build 再 sync）

### 5. 用 Android Studio 產生 APK

```bash
npx cap open android
```

會開啟 Android Studio：

1. 等 Gradle 同步完成（右下角跑完）。
2. 選單 **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**。
3. 完成後點 **Locate** 或到  
   `android/app/build/outputs/apk/debug/app-debug.apk`  
   即可取得 APK。

---

## 三、之後改程式要重新打包

1. `npm run build`
2. `npx cap sync android`
3. 在 Android Studio 再 **Build APK(s)**，或直接再 `npx cap open android` 後建置。

---

## 四、注意

- **Supabase 網址與金鑰**：APK 內是包你建置時的環境變數（`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`）。建 APK 前請確認 `.env` 正確，再執行 `npm run build`。
- **release 簽名**：要上架 Google Play 需簽名與 release 建置，可在 Android Studio 選 **Generate Signed Bundle / APK** 依指示設定。

祝你休息後順利產出 APK。
