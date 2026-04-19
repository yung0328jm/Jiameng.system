// 加班費／補休：每位人員對「已核准」加班單的選擇（與行事曆加班申請 id 對應）
import { syncKeyToSupabase } from './supabaseSync'
import { REALTIME_UPDATE_EVENT } from './supabaseRealtime'

export const OVERTIME_COMPENSATION_CHOICE_KEY = 'jiameng_overtime_compensation_choices'

const notify = () => {
  try {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent(REALTIME_UPDATE_EVENT, { detail: { key: OVERTIME_COMPENSATION_CHOICE_KEY } }))
  } catch (_) {}
}

const makeKey = (overtimeId, personLabel) => {
  const id = String(overtimeId || '').trim()
  const person = String(personLabel || '').trim()
  return `${id}\u001f${person}`
}

/** @returns {Record<string, { mode: 'pay'|'comp_leave', updatedAt: string }>} */
export const getOvertimeCompensationChoicesMap = () => {
  try {
    const raw = localStorage.getItem(OVERTIME_COMPENSATION_CHOICE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch (e) {
    console.error('getOvertimeCompensationChoicesMap:', e)
    return {}
  }
}

/** @returns {'pay'|'comp_leave'|null} */
export const getOvertimeCompensationMode = (overtimeId, personLabel) => {
  const map = getOvertimeCompensationChoicesMap()
  const row = map[makeKey(overtimeId, personLabel)]
  const m = row?.mode
  if (m === 'pay' || m === 'comp_leave') return m
  return null
}

/**
 * @param {string} overtimeId
 * @param {string} personLabel 與加班單上「加班人員／申請人」完全一致的字串
 * @param {'pay'|'comp_leave'} mode
 */
export const setOvertimeCompensationMode = (overtimeId, personLabel, mode) => {
  try {
    if (mode !== 'pay' && mode !== 'comp_leave') {
      return { success: false, message: '無效的選項' }
    }
    const k = makeKey(overtimeId, personLabel)
    if (!String(overtimeId || '').trim() || !String(personLabel || '').trim()) {
      return { success: false, message: '缺少參數' }
    }
    const map = { ...getOvertimeCompensationChoicesMap() }
    map[k] = { mode, updatedAt: new Date().toISOString() }
    const val = JSON.stringify(map)
    localStorage.setItem(OVERTIME_COMPENSATION_CHOICE_KEY, val)
    syncKeyToSupabase(OVERTIME_COMPENSATION_CHOICE_KEY, val).catch(() => {})
    notify()
    return { success: true }
  } catch (e) {
    console.error('setOvertimeCompensationMode:', e)
    return { success: false, message: '儲存失敗' }
  }
}

/** 清除該筆單、該人員的選擇（改回未指定） */
export const clearOvertimeCompensationMode = (overtimeId, personLabel) => {
  try {
    const k = makeKey(overtimeId, personLabel)
    const map = { ...getOvertimeCompensationChoicesMap() }
    if (!(k in map)) return { success: true }
    delete map[k]
    const val = JSON.stringify(map)
    localStorage.setItem(OVERTIME_COMPENSATION_CHOICE_KEY, val)
    syncKeyToSupabase(OVERTIME_COMPENSATION_CHOICE_KEY, val).catch(() => {})
    notify()
    return { success: true }
  } catch (e) {
    console.error('clearOvertimeCompensationMode:', e)
    return { success: false, message: '清除失敗' }
  }
}
