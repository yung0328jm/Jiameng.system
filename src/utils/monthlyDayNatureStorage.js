// 每月份工時報表：日期欄「平日／假日」覆寫（預設週六週日為假日，其餘平日）
import { syncKeyToSupabase } from './supabaseSync'

export const MONTHLY_DAY_NATURE_KEY = 'jiameng_monthly_day_nature'
const STORAGE_KEY = MONTHLY_DAY_NATURE_KEY

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`
}

function dateStrFromParts(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * 無覆寫時：週六、週日 → 假日；其餘 → 平日。
 * @param {Record<string, Record<string, 'weekday'|'holiday'>>} allFromStorage
 */
export function getDayNature(year, month, day, allFromStorage) {
  const dateStr = dateStrFromParts(year, month, day)
  const mk = monthKey(year, month)
  const monthData = allFromStorage?.[mk]
  const o = monthData?.[dateStr]
  if (o === 'weekday' || o === 'holiday') return o
  const dow = new Date(year, month - 1, day).getDay()
  if (dow === 0 || dow === 6) return 'holiday'
  return 'weekday'
}

/** 該月僅「與預設不同」的覆寫：dateStr → 'weekday' | 'holiday' */
export function getMonthlyDayNatureMap(year, month) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const all = raw ? JSON.parse(raw) : {}
    const mk = monthKey(year, month)
    const m = all[mk]
    return m && typeof m === 'object' ? { ...m } : {}
  } catch (_) {
    return {}
  }
}

/**
 * @param {'weekday'|'holiday'|''} value 傳空字串則刪除覆寫（恢復預設）
 */
export function setMonthlyDayNatureOverride(year, month, dateStr, value) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const all = raw ? JSON.parse(raw) : {}
    const mk = monthKey(year, month)
    const ds = String(dateStr || '').slice(0, 10)
    if (!ds) return { success: false }
    if (!all[mk] || typeof all[mk] !== 'object') all[mk] = {}
    const v = String(value || '').trim()
    if (v === 'weekday' || v === 'holiday') {
      all[mk][ds] = v
    } else {
      delete all[mk][ds]
      if (Object.keys(all[mk]).length === 0) delete all[mk]
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
    syncKeyToSupabase(STORAGE_KEY, all).catch(() => {})
    return { success: true }
  } catch (e) {
    console.error(e)
    return { success: false }
  }
}

/** 供報表一次讀取整份 JSON，再對每日呼叫 getDayNature */
export function getAllDayNatureStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const all = raw ? JSON.parse(raw) : {}
    return all && typeof all === 'object' ? all : {}
  } catch (_) {
    return {}
  }
}
