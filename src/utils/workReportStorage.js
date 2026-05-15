// 出工回報表單：獨立於行事曆，僅記錄案場／姓名／抵達／離場時間
import { syncKeyToSupabase } from './supabaseSync'

const STORAGE_KEY = 'jiameng_work_reports'

function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const list = raw ? JSON.parse(raw) : []
    return (Array.isArray(list) ? list : []).filter((r) => !r?.deleted)
  } catch (e) {
    console.error('workReportStorage loadAll', e)
    return []
  }
}

function loadAllIncludingDeleted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch (e) {
    console.error('workReportStorage loadAllIncludingDeleted', e)
    return []
  }
}

function saveAll(list) {
  try {
    const val = JSON.stringify(Array.isArray(list) ? list : [])
    localStorage.setItem(STORAGE_KEY, val)
    syncKeyToSupabase(STORAGE_KEY, val)
    return true
  } catch (e) {
    console.error('workReportStorage saveAll', e)
    return false
  }
}

function timeToMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim())
  if (!m) return null
  const h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

/** 抵達～離場工時（小時）；離場早於抵達視為跨日 */
export function calcWorkReportHours(arrivalTime, departureTime) {
  const a = timeToMinutes(arrivalTime)
  const d = timeToMinutes(departureTime)
  if (a == null || d == null) return null
  let diff = d - a
  if (diff < 0) diff += 24 * 60
  return Math.round((diff / 60) * 10) / 10
}

export function formatWorkReportHours(hours) {
  const x = Number(hours)
  if (!Number.isFinite(x) || x < 0) return '—'
  if (Math.abs(x - Math.round(x)) < 1e-6) return `${Math.round(x)}`
  return String(x)
}

/**
 * @param {{ date?: string, year?: number, month?: number, siteName?: string, personName?: string, limit?: number }} [opts]
 */
export function getWorkReports(opts = {}) {
  const date = String(opts.date || '').trim().slice(0, 10)
  const siteName = String(opts.siteName || '').trim()
  const personName = String(opts.personName || '').trim()
  const year = Number(opts.year)
  const month = Number(opts.month)
  let list = loadAll()
  if (date) list = list.filter((r) => String(r?.date || '').slice(0, 10) === date)
  if (Number.isFinite(year) && year > 0 && Number.isFinite(month) && month >= 1 && month <= 12) {
    const prefix = `${year}-${String(month).padStart(2, '0')}`
    list = list.filter((r) => String(r?.date || '').slice(0, 7) === prefix)
  }
  if (siteName) list = list.filter((r) => String(r?.siteName || '').trim() === siteName)
  if (personName) list = list.filter((r) => String(r?.personName || '').trim() === personName)
  list.sort((a, b) => {
    const da = String(a?.date || '').localeCompare(String(b?.date || ''))
    if (da !== 0) return da
    return (Date.parse(b?.createdAt || '') || 0) - (Date.parse(a?.createdAt || '') || 0)
  })
  const limit = Number(opts.limit)
  if (Number.isFinite(limit) && limit > 0) return list.slice(0, limit)
  return list
}

export function getWorkReportsForMonth(year, month) {
  return getWorkReports({ year: Number(year), month: Number(month) })
}

/** 依日期彙整：dateStr → 紀錄陣列 */
export function groupWorkReportsByDate(records) {
  const map = new Map()
  ;(Array.isArray(records) ? records : []).forEach((r) => {
    const d = String(r?.date || '').slice(0, 10)
    if (!d) return
    if (!map.has(d)) map.set(d, [])
    map.get(d).push(r)
  })
  return map
}

/** 某日不重複案場名稱 */
export function getWorkReportSitesForDate(records, dateStr) {
  const d = String(dateStr || '').slice(0, 10)
  const sites = new Set()
  ;(Array.isArray(records) ? records : [])
    .filter((r) => String(r?.date || '').slice(0, 10) === d)
    .forEach((r) => {
      const s = String(r?.siteName || '').trim()
      if (s) sites.add(s)
    })
  return [...sites].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
}

/**
 * 批次新增（勾選多人時每人一筆）
 * @param {Array<{ date: string, siteName: string, personName: string, arrivalTime: string, departureTime: string, submittedBy?: string, submittedByName?: string }>} entries
 */
export function addWorkReports(entries) {
  const rows = Array.isArray(entries) ? entries : []
  if (rows.length === 0) return { success: false, message: '請至少填寫一筆' }

  const list = loadAllIncludingDeleted()
  const created = []
  const now = new Date().toISOString()

  for (const row of rows) {
    const date = String(row?.date || '').trim().slice(0, 10)
    const siteName = String(row?.siteName || '').trim()
    const personName = String(row?.personName || '').trim()
    const arrivalTime = String(row?.arrivalTime || '').trim()
    const departureTime = String(row?.departureTime || '').trim()
    if (!date || !siteName || !personName || !arrivalTime || !departureTime) {
      return { success: false, message: '請填寫完整：日期、案場、姓名、抵達時間、離場時間' }
    }
    const rec = {
      id: `wr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      date,
      siteName,
      personName,
      arrivalTime,
      departureTime,
      submittedBy: String(row?.submittedBy || '').trim(),
      submittedByName: String(row?.submittedByName || '').trim(),
      createdAt: now,
      updatedAt: now
    }
    list.push(rec)
    created.push(rec)
  }

  if (!saveAll(list)) return { success: false, message: '寫入失敗' }
  return { success: true, records: created }
}

export function deleteWorkReport(id) {
  const rid = String(id || '').trim()
  if (!rid) return { success: false, message: '無效的紀錄' }
  const list = loadAllIncludingDeleted()
  const idx = list.findIndex((r) => String(r?.id || '') === rid)
  if (idx === -1) return { success: false, message: '找不到該紀錄' }
  list[idx] = { ...list[idx], deleted: true, updatedAt: new Date().toISOString() }
  if (!saveAll(list)) return { success: false, message: '刪除失敗' }
  return { success: true }
}

export { STORAGE_KEY as WORK_REPORT_STORAGE_KEY }
