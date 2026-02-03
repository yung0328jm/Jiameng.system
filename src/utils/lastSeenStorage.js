// 全站「未讀/通知」用：記錄各功能最後查看時間（每帳號）
import { syncKeyToSupabase } from './supabaseSync'

const KEY = 'jiameng_last_seen_v1'

const safeParse = (raw) => {
  try {
    const obj = raw ? JSON.parse(raw) : {}
    return (obj && typeof obj === 'object') ? obj : {}
  } catch (_) {
    return {}
  }
}

const persist = (obj) => {
  const val = JSON.stringify(obj || {})
  localStorage.setItem(KEY, val)
  syncKeyToSupabase(KEY, val)
}

export const getLastSeen = (account, channel) => {
  const acc = String(account || '').trim()
  const ch = String(channel || '').trim()
  if (!acc || !ch) return ''
  const obj = safeParse(localStorage.getItem(KEY))
  return String(obj?.[acc]?.[ch] || '')
}

export const setLastSeen = (account, channel, iso) => {
  const acc = String(account || '').trim()
  const ch = String(channel || '').trim()
  const ts = String(iso || '').trim()
  if (!acc || !ch || !ts) return { success: false }
  const obj = safeParse(localStorage.getItem(KEY))
  const prev = (obj?.[acc] && typeof obj[acc] === 'object') ? obj[acc] : {}
  obj[acc] = { ...prev, [ch]: ts }
  persist(obj)
  return { success: true }
}

export const touchLastSeen = (account, channel) => {
  return setLastSeen(account, channel, new Date().toISOString())
}

