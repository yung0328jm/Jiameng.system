// 指定帳號可於「個人績效」檢視所有員工（非管理者）；清單由管理員在用戶管理維護
import { syncKeyToSupabase } from './supabaseSync'

const KEY = 'jiameng_performance_view_all_accounts'

export function getPerformanceViewAllAccounts() {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.map((a) => String(a || '').trim()).filter(Boolean) : []
  } catch (_) {
    return []
  }
}

export function setPerformanceViewAllAccounts(accounts) {
  const list = Array.isArray(accounts)
    ? [...new Set(accounts.map((a) => String(a || '').trim()).filter(Boolean))]
    : []
  const val = JSON.stringify(list)
  localStorage.setItem(KEY, val)
  syncKeyToSupabase(KEY, val).catch(() => {})
  return { success: true, list }
}

/** 是否可於個人績效切換檢視其他員工（管理者永遠為 true，無需列入清單） */
export function canViewAllPersonalPerformance(account) {
  const acc = String(account || '').trim()
  if (!acc) return false
  return getPerformanceViewAllAccounts().includes(acc)
}
