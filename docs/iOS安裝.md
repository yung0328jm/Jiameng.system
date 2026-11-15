# iPhone 安裝（Capacitor iOS）

程式已接 iOS 專案（`ios/`）。**這台 Windows 電腦無法編譯、也無法把 App 裝進 iPhone。** Apple 規定必須用 Mac + Xcode。

## 現在就能用（不用 Mac）

iPhone 用 **Safari** 打開網站（例如 `https://jiameng-system.vercel.app`）→ 分享 → **加入主畫面**。會像 App 一樣全螢幕開，但這不是 App Store 那套；關瀏覽器後的系統推播也比較受限。

## 要裝成像 Android APK 那樣的 App

需要：

1. 一台 **Mac**（自己、同事、或租雲端 Mac）
2. 安裝 **Xcode**（App Store）
3. **Apple Developer** 帳號（個人年費約 99 美元；沒有帳號就無法裝到別人的 iPhone）
4. 在 Mac 上打開這個專案後執行：

```bash
npm install
npm run build:ios
npx cap open ios
```

第一次 `cap sync ios` 會跑 CocoaPods（Mac 上要先裝：`sudo gem install cocoapods`）。

Xcode 裡再做：

1. 選 App target → **Signing & Capabilities** → 勾自己的 Team  
2. **+ Capability** → **Push Notifications**  
3. Firebase Console 新增 iOS App，套件名稱 `com.jiameng.app`，下載 `GoogleService-Info.plist` 拖進 `ios/App/App/`  
4. 用 USB 接 iPhone，選實機 → Run；或 Archive 後上傳 **TestFlight** 給同事裝

## 推播

登入後會依平台把 token 存成 `android` 或 `ios`。iPhone 要允許通知才收得到站內信推播。

## 注意

- Windows 上的 `npx cap open ios` 打不開 Xcode，請忽略。  
- Apple 審查對「只是包一個網站的 App」較嚴，員工內部用 **TestFlight** 最實際。  
- 沒有 Mac、也不想買開發者帳號時，先用 Safari「加入主畫面」。
