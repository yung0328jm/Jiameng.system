// 補休系統「操作用戶」：由管理員在補休頁面指定一名帳號，該帳號與管理員相同可檢視全員、篩選人員並列印
import { syncKeyToSupabase } from './supabaseSync'

const KEY = 'jiameng_compensatory_leave_manager_account'

function parseStoredValue(raw) {
  if (raw == null || raw === '') return ''
  const s = String(raw).trim()
  if (!s) return ''
  try {
    const p = JSON.parse(s)
    if (typeof p === 'string') return p.trim()
  } catch (_) {}
  return s.replace(/^["']|["']$/g, '').trim()
}

/** 取得管理員在補休頁面指定的操作用戶帳號（空＝未指定，僅管理員具全員權限） */
export function getCompensatoryLeaveManagerAccount() {
  try {
    let raw = localStorage.getItem(KEY)
    let v = parseStoredValue(raw)
    if (raw != null && raw !== '' && v && !String(raw).trim().startsWith('"')) {
      const fixed = JSON.stringify(v)
      localStorage.setItem(KEY, fixed)
      syncKeyToSupabase(KEY, fixed).catch(() => {})
    }
    return v || ''
  } catch (_) {
    return ''
  }
}

export function setCompensatoryLeaveManagerAccount(account) {
  const v = String(account || '').trim()
  const stored = JSON.stringify(v)
  localStorage.setItem(KEY, stored)
  syncKeyToSupabase(KEY, stored).catch(() => {})
  return { success: true, account: v }
}

function accountsEqual(a, b) {
  const x = String(a || '').trim().toLowerCase()
  const y = String(b || '').trim().toLowerCase()
  return x !== '' && y !== '' && x === y
}

/**
 * 是否可於補休系統檢視「全員」、使用人員篩選與列印。
 * - 管理員：一律 true
 * - 一般帳號：僅當與儲存之操作用戶帳號相同時為 true（須由管理員先指定）
 */
export function canViewAllCompensatoryLeave(account, isAdminUser) {
  if (isAdminUser) return true
  const designated = getCompensatoryLeaveManagerAccount()
  if (!designated) return false
  return accountsEqual(account, designated)
}
