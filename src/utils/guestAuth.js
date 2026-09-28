import { getCurrentUser, getCurrentUserRole, clearAuthStatus } from './authStorage'

/** 訪客帳號（僅供參觀系統；畫面為範例資料，不寫入真實內容） */
export const GUEST_ACCOUNT = 'guest'
export const GUEST_PASSWORD = 'guest'
export const GUEST_NAME = '訪客'
export const GUEST_ROLE = 'guest'

const GUEST_SNAPSHOT_KEY = 'jiameng_guest_ls_snapshot_v1'
const GUEST_SNAPSHOT_READY_KEY = 'jiameng_guest_sandbox_ready'

export const isGuestAccount = (account) =>
  String(account || '').trim().toLowerCase() === GUEST_ACCOUNT

export const isGuestCredentials = (account, password) =>
  isGuestAccount(account) && String(password || '') === GUEST_PASSWORD

export const isGuestSession = () =>
  isGuestAccount(getCurrentUser()) || getCurrentUserRole() === GUEST_ROLE

/** 訪客操作只留在本機沙盒，登出後還原，且不可寫入雲端 */
export const isGuestCloudWriteBlocked = () => isGuestSession()

const sessionFlag = (value) => {
  try {
    if (value === undefined) return sessionStorage.getItem(GUEST_SNAPSHOT_READY_KEY)
    if (value == null) sessionStorage.removeItem(GUEST_SNAPSHOT_READY_KEY)
    else sessionStorage.setItem(GUEST_SNAPSHOT_READY_KEY, value)
  } catch (_) {}
}

/** 同步完成後拍一次本機快照；同一分頁只拍一次，避免把訪客亂點寫進還原點 */
export const snapshotGuestSandboxIfNeeded = () => {
  if (!isGuestSession() || typeof localStorage === 'undefined') return
  if (sessionFlag() === '1') return
  try {
    const dump = {}
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || k === GUEST_SNAPSHOT_KEY) continue
      dump[k] = localStorage.getItem(k)
    }
    localStorage.setItem(GUEST_SNAPSHOT_KEY, JSON.stringify(dump))
    sessionFlag('1')
  } catch (e) {
    console.warn('snapshotGuestSandboxIfNeeded:', e)
  }
}

/** 還原訪客登入當下的資料並結束訪客登入（操作不留存） */
export const restoreGuestSandboxAndLogout = () => {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(GUEST_SNAPSHOT_KEY) : null
    if (raw) {
      const dump = JSON.parse(raw)
      const keys = []
      for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i))
      keys.forEach((k) => {
        if (k) localStorage.removeItem(k)
      })
      Object.entries(dump || {}).forEach(([k, v]) => {
        if (!k || k === GUEST_SNAPSHOT_KEY || v == null) return
        try { localStorage.setItem(k, v) } catch (_) {}
      })
    }
  } catch (e) {
    console.warn('restoreGuestSandboxAndLogout:', e)
  }
  try { localStorage.removeItem(GUEST_SNAPSHOT_KEY) } catch (_) {}
  sessionFlag(null)
  clearAuthStatus()
}

/** 若上次訪客未正常登出，在非訪客登入時還原沙盒資料（保留目前登入狀態） */
export const restoreOrphanGuestSnapshot = () => {
  if (isGuestSession() || typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(GUEST_SNAPSHOT_KEY)
    if (!raw) return
    const dump = JSON.parse(raw)
    const authStatus = localStorage.getItem('jiameng_auth_status')
    const currentUser = localStorage.getItem('jiameng_current_user')
    const keys = []
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i))
    keys.forEach((k) => {
      if (k) localStorage.removeItem(k)
    })
    Object.entries(dump || {}).forEach(([k, v]) => {
      if (!k || k === GUEST_SNAPSHOT_KEY || v == null) return
      if (k === 'jiameng_auth_status' || k === 'jiameng_current_user') return
      try { localStorage.setItem(k, v) } catch (_) {}
    })
    if (authStatus != null) localStorage.setItem('jiameng_auth_status', authStatus)
    if (currentUser != null) localStorage.setItem('jiameng_current_user', currentUser)
    localStorage.removeItem(GUEST_SNAPSHOT_KEY)
    sessionFlag(null)
  } catch (e) {
    console.warn('restoreOrphanGuestSnapshot:', e)
  }
}
