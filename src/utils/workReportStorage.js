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

/** 中午休息 1 小時；抵達時間為下午（12:00 起）則不扣 */
const LUNCH_BREAK_HOURS = 1
const AFTERNOON_START_MINUTES = 12 * 60
/** 17:00 後視為加班 */
const OVERTIME_START_MINUTES = 17 * 60

function isAfternoonArrival(arrivalTime) {
  const a = timeToMinutes(arrivalTime)
  return a != null && a >= AFTERNOON_START_MINUTES
}

const roundHours = (hours) => Math.round(Number(hours) * 10) / 10

/**
 * 工時細項：天（17:00前）＋ 加班（17:00後）－ 午休
 * @returns {{ totalHours: number, dayHours: number, overtimeHours: number, lunchDeductHours: number, hasLunchDeduct: boolean, hasOvertime: boolean }|null}
 */
export function calcWorkReportHoursBreakdown(arrivalTime, departureTime) {
  const a = timeToMinutes(arrivalTime)
  const d = timeToMinutes(departureTime)
  if (a == null || d == null) return null

  let spanMin = d - a
  if (spanMin < 0) spanMin += 24 * 60

  const lunchMin = isAfternoonArrival(arrivalTime) ? 0 : LUNCH_BREAK_HOURS * 60
  const overtimeStart = Math.max(a, OVERTIME_START_MINUTES)
  const overtimeMin = d > overtimeStart ? d - overtimeStart : 0
  let dayMin = spanMin - overtimeMin - lunchMin
  if (dayMin < 0) dayMin = 0

  const dayHours = roundHours(dayMin / 60)
  const overtimeHours = roundHours(overtimeMin / 60)
  const lunchDeductHours = roundHours(lunchMin / 60)
  const totalHours = roundHours(dayHours + overtimeHours)

  return {
    totalHours,
    dayHours,
    overtimeHours,
    lunchDeductHours,
    hasLunchDeduct: lunchMin > 0,
    hasOvertime: overtimeMin > 0
  }
}

/** 抵達～離場工時（小時）；離場早於抵達視為跨日；非下午抵達扣 1 小時午休 */
export function calcWorkReportHours(arrivalTime, departureTime) {
  const bd = calcWorkReportHoursBreakdown(arrivalTime, departureTime)
  return bd?.totalHours ?? null
}

/**
 * 工時細項文字（可乘人數）
 * @param {ReturnType<typeof calcWorkReportHoursBreakdown>} breakdown
 * @param {number} [headcount]
 */
export function getWorkReportHoursDetailParts(breakdown, headcount = 1) {
  if (!breakdown) return []
  const n = Math.max(1, Math.floor(Number(headcount) || 1))
  const mul = (h) => roundHours(h * n)
  const parts = []

  if (breakdown.dayHours > 0) {
    parts.push({
      key: 'day',
      text: `(天 ${formatWorkReportDuration(mul(breakdown.dayHours))})`,
      tone: 'muted'
    })
  }
  if (breakdown.hasOvertime && breakdown.overtimeHours > 0) {
    parts.push({
      key: 'ot',
      text: `(加班 ${formatWorkReportDuration(mul(breakdown.overtimeHours))}，17:00後起算)`,
      tone: 'overtime'
    })
  }
  if (breakdown.hasLunchDeduct && breakdown.lunchDeductHours > 0) {
    parts.push({
      key: 'lunch',
      text: `(扣除中午休息共 ${formatWorkReportHours(mul(breakdown.lunchDeductHours))}小時)`,
      tone: 'muted'
    })
  }
  return parts
}

export function formatWorkReportHours(hours) {
  const x = Number(hours)
  if (!Number.isFinite(x) || x < 0) return '—'
  if (Math.abs(x - Math.round(x)) < 1e-6) return `${Math.round(x)}`
  return String(x)
}

/** 8 小時 = 1 工 */
export const HOURS_PER_WORK_UNIT = 8

export function hoursToWorkUnits(hours) {
  const x = Number(hours)
  if (!Number.isFinite(x) || x < 0) return null
  let gong = Math.floor(x / HOURS_PER_WORK_UNIT)
  let rem = Math.round((x - gong * HOURS_PER_WORK_UNIT) * 10) / 10
  if (rem >= HOURS_PER_WORK_UNIT - 1e-6) {
    gong += 1
    rem = 0
  }
  return { gong, hours: rem }
}

/** 格式：1工4小；僅小時則 4小；整工則 1工 */
export function formatWorkReportDuration(hours) {
  const u = hoursToWorkUnits(hours)
  if (!u) return '—'
  const { gong, hours: h } = u
  const parts = []
  if (gong > 0) parts.push(`${gong}工`)
  if (h > 0 || gong === 0) {
    const hStr = formatWorkReportHours(h)
    if (hStr !== '—') parts.push(`${hStr}小`)
  }
  return parts.join('') || '0小'
}

/** 超過 8 小時（超過 1 工）視為加班 */
export function isWorkReportOvertime(hours) {
  const x = Number(hours)
  return Number.isFinite(x) && x > HOURS_PER_WORK_UNIT
}

/**
 * 供 JSX 顯示：{ text, className }
 * @param {number|null|undefined} hours
 * @param {{ className?: string, overtimeClassName?: string }} [opts]
 */
/** 從 personName（如 小豪*2）或 headcount 欄位取得人數 */
export function parseWorkReportHeadcount(personName, headcountField) {
  const fromField = Number(headcountField)
  if (Number.isFinite(fromField) && fromField >= 1) return Math.floor(fromField)
  const m = /^(.+)\*(\d+)$/.exec(String(personName || '').trim())
  if (m) return Math.max(1, parseInt(m[2], 10) || 1)
  return 1
}

/** 包商顯示名：人數 > 1 時為「名稱*人數」 */
export function formatContractorPersonName(baseName, headcount) {
  const base = String(baseName || '').trim()
  const n = Math.max(1, Math.floor(Number(headcount) || 1))
  if (!base) return ''
  return n > 1 ? `${base}*${n}` : base
}

/** 單筆加總工時（每人時數 × 人數） */
export function getWorkReportRowTotalHours(row) {
  const per = calcWorkReportHours(row?.arrivalTime, row?.departureTime)
  if (per == null) return null
  const n = parseWorkReportHeadcount(row?.personName, row?.headcount)
  return Math.round(per * n * 10) / 10
}

export function getWorkReportDurationDisplay(hours, opts = {}) {
  const normalClass = opts.className || 'text-cyan-300'
  const overtimeClass = opts.overtimeClassName || 'text-red-400 font-semibold'
  const x = Number(hours)
  if (hours == null || !Number.isFinite(x) || x < 0) {
    return { text: '—', className: 'text-gray-500' }
  }
  const overtime = isWorkReportOvertime(x)
  return {
    text: formatWorkReportDuration(x),
    className: `tabular-nums ${overtime ? overtimeClass : normalClass}`
  }
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
    const headcountRaw = Number(row?.headcount)
    const headcount =
      Number.isFinite(headcountRaw) && headcountRaw >= 1 ? Math.floor(headcountRaw) : undefined
    if (!date || !siteName || !personName || !arrivalTime || !departureTime) {
      return { success: false, message: '請填寫完整：日期、案場、姓名、抵達時間、離場時間' }
    }
    const rec = {
      id: `wr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      date,
      siteName,
      personName,
      ...(headcount != null && headcount > 1 ? { headcount } : {}),
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
