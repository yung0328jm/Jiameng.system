// 特休天數：管理者設定可休天數，事由為「特休」之核准請假自動計入已休
import { getLeaveApplications } from './leaveApplicationStorage'
import { getSupabaseClient } from './supabaseClient'

const SPECIAL_LEAVE_QUOTA_KEY = 'jiameng_special_leave_quota'

const syncQuotaToSupabase = async (account, days) => {
  const sb = getSupabaseClient()
  if (!sb || account == null) return
  try {
    await sb.from('special_leave_quota').upsert({ account: String(account), days: Number(days) || 0 }, { onConflict: 'account' })
  } catch (e) {
    console.warn('syncQuotaToSupabase:', e)
  }
}

/** 取得各使用者特休可休天數 { account: number } */
const getQuotaMap = () => {
  try {
    const raw = localStorage.getItem(SPECIAL_LEAVE_QUOTA_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch (e) {
    console.error('getQuotaMap:', e)
    return {}
  }
}

/** 取得指定帳號的特休可休天數（管理者設定） */
export const getSpecialLeaveQuota = (account) => {
  const map = getQuotaMap()
  const v = map[account]
  return typeof v === 'number' && v >= 0 ? v : 0
}

/** 設定指定帳號的特休可休天數（僅管理者） */
export const setSpecialLeaveQuota = (account, days) => {
  try {
    const map = getQuotaMap()
    const d = Math.max(0, Math.floor(Number(days) || 0))
    map[account] = d
    localStorage.setItem(SPECIAL_LEAVE_QUOTA_KEY, JSON.stringify(map))
    syncQuotaToSupabase(account, d)
    return { success: true }
  } catch (e) {
    console.error('setSpecialLeaveQuota:', e)
    return { success: false, message: '儲存失敗' }
  }
}

/** 從請假申請計算：事由含「特休」且已核准的天數總和（供單一帳號） */
export const getSpecialLeaveUsed = (account) => {
  const list = getLeaveApplications()
  const is特休 = (reason) => (reason || '').toString().trim().includes('特休')
  let days = 0
  list.forEach((r) => {
    if (r.userId !== account) return
    if ((r.status || '') !== 'approved') return
    if (!is特休(r.reason)) return
    const start = new Date(r.startDate)
    const end = new Date(r.endDate)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return
    const cur = new Date(start)
    while (cur <= end) {
      days += 1
      cur.setDate(cur.getDate() + 1)
    }
  })
  return days
}

/** 剩餘特休天數 = 可休 - 已休（不小於 0） */
export const getSpecialLeaveRemaining = (account) => {
  const quota = getSpecialLeaveQuota(account)
  const used = getSpecialLeaveUsed(account)
  return Math.max(0, quota - used)
}
