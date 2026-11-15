import { syncKeyToSupabase } from './supabaseSync'
import { isGuestCloudWriteBlocked } from './guestAuth'

export const SPOT_WORK_STORAGE_KEY = 'jiameng_spot_work_logs'
export const SPOT_WORK_PEOPLE_KEY = 'jiameng_spot_work_people'

function todayDateStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function normalizeNames(names) {
  const seen = new Set()
  const out = []
  ;(Array.isArray(names) ? names : []).forEach((n) => {
    const t = String(n || '').trim()
    if (!t || seen.has(t)) return
    seen.add(t)
    out.push(t)
  })
  return out
}

export function getSpotWorkLogs() {
  try {
    const raw = localStorage.getItem(SPOT_WORK_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    return []
  }
}

function saveSpotWorkLogs(list) {
  const data = Array.isArray(list) ? list : []
  const val = JSON.stringify(data)
  localStorage.setItem(SPOT_WORK_STORAGE_KEY, val)
  if (!isGuestCloudWriteBlocked()) {
    syncKeyToSupabase(SPOT_WORK_STORAGE_KEY, val)
  }
}

export function getSpotWorkLogByDate(dateStr) {
  const d = String(dateStr || '').trim().slice(0, 10)
  if (!d) return null
  return getSpotWorkLogs().find((r) => String(r?.date || '').slice(0, 10) === d) || null
}

export function upsertSpotWorkLog({ date, names, count, note, createdBy }) {
  const d = String(date || todayDateStr()).trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { success: false, message: '日期無效' }
  const listNames = normalizeNames(names)
  const n = Math.max(0, Math.floor(Number(count) || 0))
  const people = Math.max(n, listNames.length)
  if (people <= 0 && listNames.length === 0) {
    return { success: false, message: '請填人數或至少選一位出工者' }
  }
  const now = new Date().toISOString()
  const logs = getSpotWorkLogs()
  const idx = logs.findIndex((r) => String(r?.date || '').slice(0, 10) === d)
  const rec = {
    id: idx >= 0 ? logs[idx].id : `sw-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    date: d,
    names: listNames,
    count: people,
    note: String(note || '').trim(),
    createdAt: idx >= 0 ? logs[idx].createdAt || now : now,
    createdBy: String(createdBy || (idx >= 0 ? logs[idx].createdBy : '') || '').trim(),
    updatedAt: now
  }
  if (idx >= 0) logs[idx] = rec
  else logs.push(rec)
  logs.sort((a, b) => String(b.date).localeCompare(String(a.date)))
  try {
    saveSpotWorkLogs(logs)
    return { success: true, record: rec }
  } catch (e) {
    console.error('Error saving spot work log:', e)
    return { success: false, message: '儲存失敗' }
  }
}

export function getSpotWorkPeople() {
  try {
    const raw = localStorage.getItem(SPOT_WORK_PEOPLE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    const names = normalizeNames(parsed)
    names.sort((a, b) => a.localeCompare(b, 'zh-Hant'))
    return names
  } catch (e) {
    return []
  }
}

function saveSpotWorkPeople(names) {
  const data = normalizeNames(names)
  data.sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  const val = JSON.stringify(data)
  localStorage.setItem(SPOT_WORK_PEOPLE_KEY, val)
  if (!isGuestCloudWriteBlocked()) {
    syncKeyToSupabase(SPOT_WORK_PEOPLE_KEY, val)
  }
  return data
}

export function addSpotWorkPerson(name) {
  const t = String(name || '').trim()
  if (!t) return { success: false, message: '請輸入姓名' }
  const list = getSpotWorkPeople()
  if (list.includes(t)) return { success: false, message: '這個人已經在名單裡' }
  try {
    const next = saveSpotWorkPeople([...list, t])
    return { success: true, names: next }
  } catch (e) {
    return { success: false, message: '新增失敗' }
  }
}

export function deleteSpotWorkPerson(name) {
  const t = String(name || '').trim()
  if (!t) return { success: false, message: '姓名無效' }
  try {
    const next = saveSpotWorkPeople(getSpotWorkPeople().filter((n) => n !== t))
    return { success: true, names: next }
  } catch (e) {
    return { success: false, message: '刪除失敗' }
  }
}

export function deleteSpotWorkLog(dateStr) {
  const d = String(dateStr || '').trim().slice(0, 10)
  if (!d) return { success: false, message: '日期無效' }
  try {
    saveSpotWorkLogs(getSpotWorkLogs().filter((r) => String(r?.date || '').slice(0, 10) !== d))
    return { success: true }
  } catch (e) {
    return { success: false, message: '刪除失敗' }
  }
}
