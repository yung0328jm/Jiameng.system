import { getCurrentUser, getCurrentUserRole } from './authStorage'

/** 訪客帳號（僅供參觀系統；畫面為範例資料，不寫入真實內容） */
export const GUEST_ACCOUNT = 'guest'
export const GUEST_PASSWORD = 'guest'
export const GUEST_NAME = '訪客'
export const GUEST_ROLE = 'guest'

export const isGuestAccount = (account) =>
  String(account || '').trim().toLowerCase() === GUEST_ACCOUNT

export const isGuestCredentials = (account, password) =>
  isGuestAccount(account) && String(password || '') === GUEST_PASSWORD

export const isGuestSession = () =>
  isGuestAccount(getCurrentUser()) || getCurrentUserRole() === GUEST_ROLE
