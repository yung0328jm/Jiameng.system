// 管理者指定「一人」可於個人績效檢視全員資料（唯讀，僅切換查看）
// 注意：localStorage 須存 JSON 字串（如 "acc"），否則 sync 時 JSON.parse 會失敗、雲端無法同步
import { syncKeyToSupabase } from './supabaseSync'

const KEY = 'jiameng_performance_viewer_account'
const LEGACY_LIST_KEY = 'jiameng_performance_view_all_accounts'

function parseStoredValue(raw) {
  if (raw == null || raw === '') return ''
  const s = String(raw).trim()
  if (!s) return ''
  try {
    const p = JSON.parse(s)
    if (typeof p === 'string') return p.trim()
  } catch (_) {
    /* 舊版：未包 JSON 的純文字帳號 */
  }
  return s.replace(/^["']|["']$/g, '').trim()
}

/** 取得目前指定的帳號（空字串＝未指定） */
export function getPerformanceViewerAccount() {
  try {
    let raw = localStorage.getItem(KEY)
    let v = parseStoredValue(raw)
    // 舊版曾寫入純文字帳號，JSON.parse 在同步時會失敗；自動改為 JSON 字串並重送雲端
    if (raw != null && raw !== '' && v && !String(raw).trim().startsWith('"')) {
      const fixed = JSON.stringify(v)
      localStorage.setItem(KEY, fixed)
      syncKeyToSupabase(KEY, fixed).catch(() => {})
    }
    if (v) return v
    // 舊版為帳號陣列：只取第一位並遷移
    const legacyRaw = localStorage.getItem(LEGACY_LIST_KEY)
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        const first = String(parsed[0] || '').trim()
        if (first) {
          setPerformanceViewerAccount(first)
          localStorage.removeItem(LEGACY_LIST_KEY)
        }
        return first || ''
      }
    }
  } catch (_) {}
  return ''
}

export function setPerformanceViewerAccount(account) {
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

/** 目前登入帳號是否為「指定可檢視全員」者（管理者請用 role 判斷，此函式不含 admin） */
export function canViewAllPersonalPerformance(account) {
  const designated = getPerformanceViewerAccount()
  return accountsEqual(account, designated)
}
