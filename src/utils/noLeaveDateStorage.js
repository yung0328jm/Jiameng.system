// 禁休日：管理員設定後，當日所有人員不可申請／核准入廠異動
import { syncKeyToSupabase } from './supabaseSync'
import { REALTIME_UPDATE_EVENT } from './supabaseRealtime'

export const NO_LEAVE_DATES_KEY = 'jiameng_no_leave_dates'

const normalizeDateStr = (d) => {
  const s = String(d || '').trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''
}

const notifyChanged = () => {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(REALTIME_UPDATE_EVENT, { detail: { key: NO_LEAVE_DATES_KEY } }))
    }
  } catch (_) {}
}

const persist = (dates) => {
  const sorted = [...dates].sort()
  const val = JSON.stringify(sorted)
  localStorage.setItem(NO_LEAVE_DATES_KEY, val)
  syncKeyToSupabase(NO_LEAVE_DATES_KEY, val).catch(() => {})
  notifyChanged()
  return sorted
}

export const getNoLeaveDates = () => {
  try {
    const raw = localStorage.getItem(NO_LEAVE_DATES_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return [...new Set(parsed.map(normalizeDateStr).filter(Boolean))].sort()
  } catch (_) {
    return []
  }
}

export const isNoLeaveDate = (dateStr) => {
  const d = normalizeDateStr(dateStr)
  if (!d) return false
  return getNoLeaveDates().includes(d)
}

/** 列舉區間內每一天（含起訖，YYYY-MM-DD） */
export const enumerateDatesInRange = (startDate, endDate) => {
  const start = normalizeDateStr(startDate)
  const end = normalizeDateStr(endDate)
  if (!start || !end) return []
  const out = []
  const cur = new Date(`${start}T12:00:00`)
  const last = new Date(`${end}T12:00:00`)
  if (isNaN(cur.getTime()) || isNaN(last.getTime()) || cur > last) return []
  while (cur <= last) {
    out.push(
      `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
    )
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

export const getNoLeaveDatesInRange = (startDate, endDate) => {
  const blocked = new Set(getNoLeaveDates())
  return enumerateDatesInRange(startDate, endDate).filter((d) => blocked.has(d))
}

export const hasNoLeaveDateInRange = (startDate, endDate) => {
  return getNoLeaveDatesInRange(startDate, endDate).length > 0
}

export const formatNoLeaveBlockedMessage = (startDate, endDate) => {
  const hits = getNoLeaveDatesInRange(startDate, endDate)
  if (hits.length === 0) return ''
  const preview = hits.slice(0, 5).join('、')
  const more = hits.length > 5 ? ` 等共 ${hits.length} 天` : ''
  return `以下日期為禁休，無法申請異動：${preview}${more}`
}

/** 管理員設定／取消禁休 */
export const setNoLeaveDate = (dateStr, blocked, setBy = '') => {
  const d = normalizeDateStr(dateStr)
  if (!d) return { success: false, message: '日期格式錯誤' }
  const dates = new Set(getNoLeaveDates())
  if (blocked) dates.add(d)
  else dates.delete(d)
  persist(Array.from(dates))
  return { success: true, date: d, blocked: !!blocked, setBy: String(setBy || '').trim() }
}

export const toggleNoLeaveDate = (dateStr, setBy = '') => {
  const d = normalizeDateStr(dateStr)
  if (!d) return { success: false, message: '日期格式錯誤' }
  const next = !isNoLeaveDate(d)
  return setNoLeaveDate(d, next, setBy)
}
