// 管理者於「用戶管理」指定「一人」可在補休系統檢視全員資料並列印（與全員績效檢視模式相同）
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

/** 取得目前指定的帳號（空字串＝未指定，則無人具全員檢視權） */
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
 * 目前登入帳號是否可於補休系統檢視「全員」並使用人員篩選／列印。
 * 未指定帳號時一律 false（管理者亦同，須至用戶管理指定）。
 */
export function canViewAllCompensatoryLeave(account) {
  const designated = getCompensatoryLeaveManagerAccount()
  if (!designated) return false
  return accountsEqual(account, designated)
}
