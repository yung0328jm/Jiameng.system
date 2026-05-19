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
/** 當日累積超過 8 小時視為加班 */
export const HOURS_PER_DAY = 8
/** @deprecated 請改用 HOURS_PER_DAY */
export const HOURS_PER_WORK_UNIT = HOURS_PER_DAY

function isAfternoonArrival(arrivalTime) {
  const a = timeToMinutes(arrivalTime)
  return a != null && a >= AFTERNOON_START_MINUTES
}

const roundHours = (hours) => Math.round(Number(hours) * 10) / 10

/**
 * 工時細項：抵達～離場扣午休；當日超過 8 小時起算加班
 * @returns {{ totalHours: number, dayHours: number, overtimeHours: number, lunchDeductHours: number, hasLunchDeduct: boolean, hasOvertime: boolean }|null}
 */
export function calcWorkReportHoursBreakdown(arrivalTime, departureTime) {
  const a = timeToMinutes(arrivalTime)
  const d = timeToMinutes(departureTime)
  if (a == null || d == null) return null

  let spanMin = d - a
  if (spanMin < 0) spanMin += 24 * 60

  const lunchMin = isAfternoonArrival(arrivalTime) ? 0 : LUNCH_BREAK_HOURS * 60
  let workMin = spanMin - lunchMin
  if (workMin < 0) workMin = 0

  const totalHours = roundHours(workMin / 60)
  const dayHours = roundHours(Math.min(HOURS_PER_DAY, totalHours))
  const overtimeHours = roundHours(Math.max(0, totalHours - HOURS_PER_DAY))
  const lunchDeductHours = roundHours(lunchMin / 60)

  return {
    totalHours,
    dayHours,
    overtimeHours,
    lunchDeductHours,
    hasLunchDeduct: lunchMin > 0,
    hasOvertime: overtimeHours > 0
  }
}

/** 抵達～離場工時（小時）；離場早於抵達視為跨日；非下午抵達扣 1 小時午休 */
export function calcWorkReportHours(arrivalTime, departureTime) {
  const bd = calcWorkReportHoursBreakdown(arrivalTime, departureTime)
  return bd?.totalHours ?? null
}

export function formatWorkReportHours(hours) {
  const x = Number(hours)
  if (!Number.isFinite(x) || x < 0) return '—'
  if (Math.abs(x - Math.round(x)) < 1e-6) return `${Math.round(x)}`
  return String(x)
}

export function hoursToDayUnits(hours) {
  const x = Number(hours)
  if (!Number.isFinite(x) || x < 0) return null
  let days = Math.floor(x / HOURS_PER_DAY)
  let rem = Math.round((x - days * HOURS_PER_DAY) * 10) / 10
  if (rem >= HOURS_PER_DAY - 1e-6) {
    days += 1
    rem = 0
  }
  return { days, hours: rem }
}

/** @deprecated 請改用 hoursToDayUnits */
export function hoursToWorkUnits(hours) {
  const u = hoursToDayUnits(hours)
  if (!u) return null
  return { gong: u.days, hours: u.hours }
}

/** 格式：1 天 4 小時；僅小時則 4 小時；整天則 1 天 */
export function formatWorkReportDuration(hours) {
  const u = hoursToDayUnits(hours)
  if (!u) return '—'
  const { days, hours: h } = u
  const parts = []
  if (days > 0) parts.push(`${days} 天`)
  if (h > 0 || days === 0) {
    const hStr = formatWorkReportHours(h)
    if (hStr !== '—') parts.push(`${hStr} 小時`)
  }
  return parts.join(' ') || '0 小時'
}

/** 當日超過 8 小時視為加班（紅字） */
export function isWorkReportOvertime(hours) {
  const x = Number(hours)
  return Number.isFinite(x) && x > HOURS_PER_DAY
}

/**
 * 單筆出工摘要：出工人數 ＋ 超過 8 小時的加班時數（不換算成天）
 * @param {{ arrivalTime?: string, departureTime?: string, personName?: string, headcount?: number }} row
 */
export function getWorkReportRowShiftSummary(row) {
  const bd = calcWorkReportHoursBreakdown(row?.arrivalTime, row?.departureTime)
  if (!bd) return null
  const headcount = parseWorkReportHeadcount(row?.personName, row?.headcount)
  const totalOvertimeHours = roundHours(bd.overtimeHours * headcount)
  const isUnderFull = bd.totalHours < HOURS_PER_DAY
  const underHeadcount = isUnderFull ? headcount : 0
  const underActualHours = isUnderFull ? roundHours(bd.totalHours * headcount) : 0
  return {
    headcount,
    perPersonHours: bd.totalHours,
    perPersonOvertimeHours: bd.overtimeHours,
    totalOvertimeHours,
    hasOvertime: totalOvertimeHours > 0,
    underHeadcount,
    underActualHours,
    underPerPersonHours: isUnderFull ? bd.totalHours : 0,
    hasUnderHours: isUnderFull
  }
}

/** 多筆合併（包商同日多批） */
export function aggregateWorkReportShiftSummary(rows) {
  const list = Array.isArray(rows) ? rows : []
  let totalHeadcount = 0
  let totalOvertimeHours = 0
  let underHeadcount = 0
  let underActualHours = 0
  list.forEach((row) => {
    const s = getWorkReportRowShiftSummary(row)
    if (!s) return
    totalHeadcount += s.headcount
    totalOvertimeHours += s.totalOvertimeHours
    underHeadcount += s.underHeadcount
    underActualHours += s.underActualHours
  })
  totalOvertimeHours = roundHours(totalOvertimeHours)
  underActualHours = roundHours(underActualHours)
  return {
    totalHeadcount,
    totalOvertimeHours,
    hasOvertime: totalOvertimeHours > 0,
    underHeadcount,
    underActualHours,
    hasUnderHours: underHeadcount > 0
  }
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

/** 包商顯示名去掉 *人數，例：小豪*2 → 小豪 */
export function parseWorkReportBaseName(personName) {
  const t = String(personName || '').trim()
  const m = /^(.+)\*(\d+)$/.exec(t)
  return m ? m[1].trim() : t
}

/** 是否為包商出工（名稱含 *人數） */
export function isWorkReportContractorName(personName) {
  return /\*\d+$/.test(String(personName || '').trim())
}

/** 統計用 key：包商依名稱合併，勞務承攬者用全名 */
export function getWorkReportStatsPersonKey(personName) {
  const t = String(personName || '').trim()
  if (!t) return ''
  return isWorkReportContractorName(t) ? parseWorkReportBaseName(t) : t
}

/**
 * 當日明細：包商依「案場＋名稱」合併為一列；勞務承攬者維持一列一筆
 * @param {Array} rows
 */
export function groupWorkReportRowsForDisplay(rows) {
  const list = Array.isArray(rows) ? rows : []
  const contractorMap = new Map()
  const singles = []

  for (const row of list) {
    const person = String(row?.personName || '').trim()
    if (!person) continue
    if (isWorkReportContractorName(person)) {
      const base = parseWorkReportBaseName(person)
      const site = String(row?.siteName || '').trim()
      const key = `${site}\0${base}`
      if (!contractorMap.has(key)) {
        contractorMap.set(key, { kind: 'contractor', baseName: base, siteName: site, rows: [] })
      }
      contractorMap.get(key).rows.push(row)
    } else {
      singles.push({ kind: 'single', rows: [row] })
    }
  }

  const contractorGroups = [...contractorMap.values()].map((g) => {
    const shiftSummary = aggregateWorkReportShiftSummary(g.rows)
    let totalHours = 0
    g.rows.forEach((r) => {
      const h = getWorkReportRowTotalHours(r)
      if (h != null) totalHours += h
    })
    const totalHeadcount = shiftSummary.totalHeadcount
    const times = g.rows.map((r) => ({
      arrivalTime: r.arrivalTime,
      departureTime: r.departureTime,
      headcount: parseWorkReportHeadcount(r.personName, r.headcount)
    }))
    const sameTime =
      times.length === 1 ||
      times.every(
        (t) =>
          t.arrivalTime === times[0].arrivalTime && t.departureTime === times[0].departureTime
      )
    return {
      kind: 'contractor',
      id: `cg_${g.siteName}_${g.baseName}_${g.rows.map((r) => r.id).join('_')}`,
      personName: g.baseName,
      siteName: g.siteName,
      rows: g.rows,
      totalHours: Math.round(totalHours * 10) / 10,
      totalHeadcount,
      shiftSummary,
      batchCount: g.rows.length,
      arrivalTime: sameTime ? times[0]?.arrivalTime : '',
      departureTime: sameTime ? times[0]?.departureTime : '',
      timeLabel: sameTime
        ? `${times[0]?.arrivalTime || ''}–${times[0]?.departureTime || ''}`
        : `共 ${g.rows.length} 批`
    }
  })

  const singleGroups = singles.map((s) => {
    const row = s.rows[0]
    const shiftSummary = aggregateWorkReportShiftSummary(s.rows)
    return {
      kind: 'single',
      id: row.id,
      personName: row.personName,
      siteName: row.siteName,
      rows: s.rows,
      totalHours: getWorkReportRowTotalHours(row),
      totalHeadcount: shiftSummary.totalHeadcount,
      shiftSummary,
      batchCount: 1,
      arrivalTime: row.arrivalTime,
      departureTime: row.departureTime,
      timeLabel: `${row.arrivalTime || ''}–${row.departureTime || ''}`
    }
  })

  return [...contractorGroups, ...singleGroups].sort((a, b) =>
    String(a.personName || '').localeCompare(String(b.personName || ''), 'zh-Hant')
  )
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
