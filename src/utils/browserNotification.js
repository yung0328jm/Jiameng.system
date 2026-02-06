/**
 * 瀏覽器 / 手機 PWA 通知（站內信等）
 * 當 App 在背景或分頁時，可提示用戶有新訊息
 */

const TITLE = '佳盟事業群'
const MESSAGE_BODY = '您有新的站內信，請至「個人服務」→ 站內信 查看。'

/** 是否支援 Notification API（含 HTTPS 或 localhost） */
export function isNotificationSupported() {
  try {
    return typeof window !== 'undefined' && 'Notification' in window
  } catch (_) {
    return false
  }
}

/** 目前權限狀態 */
export function getNotificationPermission() {
  if (!isNotificationSupported()) return 'unsupported'
  return Notification.permission
}

/** 請求通知權限（僅在尚未詢問時會跳出系統提示） */
export function requestNotificationPermission() {
  if (!isNotificationSupported()) return Promise.resolve('unsupported')
  if (Notification.permission === 'granted') return Promise.resolve('granted')
  if (Notification.permission === 'denied') return Promise.resolve('denied')
  return Notification.requestPermission()
}

/** 顯示站內信提示（需先取得權限；建議在未讀數「增加」時呼叫） */
export function showMessageNotification() {
  if (!isNotificationSupported()) return
  if (Notification.permission !== 'granted') return
  try {
    const n = new Notification(TITLE, {
      body: MESSAGE_BODY,
      icon: '/jiameng-logo.png',
      tag: 'jiameng-message',
      requireInteraction: false
    })
    n.onclick = () => {
      try {
        window.focus()
        n.close()
      } catch (_) {}
    }
    setTimeout(() => n.close(), 8000)
  } catch (_) {}
}

/**
 * 當站內信未讀數增加時：可選擇請求權限並顯示通知（僅在分頁/App 非可見時顯示，避免干擾）
 */
export function maybeShowMessageNotification(prevCount, newCount) {
  if (newCount <= prevCount || newCount <= 0) return
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return
  if (!isNotificationSupported()) return

  const run = () => {
    if (Notification.permission === 'granted') {
      showMessageNotification()
      return
    }
    if (Notification.permission === 'denied') return
    Notification.requestPermission().then((p) => {
      if (p === 'granted') showMessageNotification()
    })
  }

  run()
}
