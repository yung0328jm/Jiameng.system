// 管理者指定「一人」可於個人績效檢視全員資料（唯讀，僅切換查看）
import { syncKeyToSupabase } from './supabaseSync'

const KEY = 'jiameng_performance_viewer_account'
const LEGACY_LIST_KEY = 'jiameng_performance_view_all_accounts'

/** 取得目前指定的帳號（空字串＝未指定） */
export function getPerformanceViewerAccount() {
  try {
    let v = String(localStorage.getItem(KEY) || '').trim()
    if (v) return v
    // 舊版為帳號陣列：自動改為只取第一位並遷移
    const legacyRaw = localStorage.getItem(LEGACY_LIST_KEY)
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        const first = String(parsed[0] || '').trim()
        if (first) {
          localStorage.setItem(KEY, first)
          localStorage.removeItem(LEGACY_LIST_KEY)
          syncKeyToSupabase(KEY, first).catch(() => {})
        }
        return first || ''
      }
    }
  } catch (_) {}
  return ''
}

export function setPerformanceViewerAccount(account) {
  const v = String(account || '').trim()
  localStorage.setItem(KEY, v)
  syncKeyToSupabase(KEY, v).catch(() => {})
  return { success: true, account: v }
}

/** 目前登入帳號是否為「指定可檢視全員」者（管理者請用 role 判斷，此函式不含 admin） */
export function canViewAllPersonalPerformance(account) {
  const acc = String(account || '').trim()
  const designated = getPerformanceViewerAccount()
  if (!acc || !designated) return false
  return acc === designated
}
