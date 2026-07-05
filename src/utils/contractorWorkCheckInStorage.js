// 承攬商出工登記（免登入；紀錄同步至 Supabase app_data）
import { getSupabaseClient } from './supabaseClient'
import { syncKeyToSupabase } from './supabaseSync'
import { REALTIME_UPDATE_EVENT } from './supabaseRealtime'
import { CONTRACTOR_REGISTRATION_KEY } from './contractorRegistrationStorage'

export const CONTRACTOR_WORK_LOG_KEY = 'jiameng_contractor_work_logs'
export const CONTRACTOR_STANDARD_DEPARTURE = '17:00'
export const CONTRACTOR_ON_TIME_CUTOFF = '08:00'

const roundHours = (hours) => Math.round(Number(hours) * 10) / 10

/** 進廠超過 08:00 視為遲到 */
export const isContractorLate = (arrivalTime) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(arrivalTime || '').trim())
  if (!m) return false
  const mins = (parseInt(m[1], 10) || 0) * 60 + (parseInt(m[2], 10) || 0)
  return mins > 8 * 60
}

/** 緊急入場時數：僅採已核准之加班申請，不依進離廠時間計算 */
export const getContractorEmergencyHours = (log) => {
  if (String(log?.overtimeStatus || '').trim() !== 'approved') return 0
  return roundHours(Number(log?.approvedOvertimeHours ?? log?.overtimeRequestHours) || 0)
}

export const CONTRACTOR_OVERTIME_HOUR_OPTIONS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6]

const notifyChanged = () => {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(REALTIME_UPDATE_EVENT, { detail: { key: CONTRACTOR_WORK_LOG_KEY } }))
    }
  } catch (_) {}
}

const persist = (list) => {
  const val = JSON.stringify(list)
  localStorage.setItem(CONTRACTOR_WORK_LOG_KEY, val)
  syncKeyToSupabase(CONTRACTOR_WORK_LOG_KEY, val).catch(() => {})
  notifyChanged()
}

const readAllContractorWorkLogs = () => {
  try {
    const raw = localStorage.getItem(CONTRACTOR_WORK_LOG_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch (_) {
    return []
  }
}

/** 有效出工紀錄（排除已刪除） */
export const getContractorWorkLogs = () =>
  readAllContractorWorkLogs().filter((r) => !r?.deleted)

export const getTodayDateStr = () => {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

export const nowTimeStr = () => {
  const n = new Date()
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`
}

const logKey = (date, siteName, companyId, personId) =>
  `${String(date || '').slice(0, 10)}|${String(siteName || '').trim()}|${String(companyId || '').trim()}|${String(personId || '').trim()}`

export const findWorkLog = ({ date, siteName, companyId, personId }) => {
  const key = logKey(date, siteName, companyId, personId)
  return getContractorWorkLogs().find((r) => logKey(r.date, r.siteName, r.companyId, r.personId) === key) || null
}

export const getWorkLogsForDate = (date, { companyId, siteName } = {}) => {
  const d = String(date || '').slice(0, 10)
  return getContractorWorkLogs().filter((r) => {
    if (String(r?.date || '').slice(0, 10) !== d) return false
    if (companyId && String(r?.companyId || '').trim() !== String(companyId).trim()) return false
    if (siteName && String(r?.siteName || '').trim() !== String(siteName).trim()) return false
    return true
  })
}

const updatedAtOfLog = (r) =>
  Math.max(Date.parse(r?.updatedAt || '') || 0, Date.parse(r?.createdAt || '') || 0)

/** 合併本機與雲端出工紀錄（以 id 為準，保留較新 updatedAt；欄位聯集避免進離廠被蓋掉） */
export const mergeContractorWorkLogs = (existing, incoming) => {
  const byId = new Map()
  const rows = [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])]
  rows.forEach((r) => {
    const id = String(r?.id || '').trim() || logKey(r.date, r.siteName, r.companyId, r.personId)
    if (!id) return
    const prev = byId.get(id)
    if (!prev) {
      byId.set(id, r)
      return
    }
    const keep = updatedAtOfLog(r) >= updatedAtOfLog(prev) ? r : prev
    const other = keep === r ? prev : r
    const merged = {
      ...other,
      ...keep,
      arrivalTime: String(keep.arrivalTime || other.arrivalTime || '').trim(),
      departureTime: String(keep.departureTime || other.departureTime || '').trim(),
      personName: String(keep.personName || other.personName || '').trim(),
      companyName: String(keep.companyName || other.companyName || '').trim(),
      siteName: String(keep.siteName || other.siteName || '').trim(),
      overtimeStatus: String(keep.overtimeStatus || other.overtimeStatus || 'none').trim() || 'none',
      overtimeRequestHours: Number(keep.overtimeRequestHours ?? other.overtimeRequestHours) || 0,
      approvedOvertimeHours: keep.approvedOvertimeHours ?? other.approvedOvertimeHours
    }
    if (keep.deleted || other.deleted) {
      const delKeep = keep.deleted ? keep : other
      const delOther = keep.deleted ? other : keep
      merged.deleted = updatedAtOfLog(delKeep) >= updatedAtOfLog(delOther) ? !!delKeep.deleted : !!delOther.deleted
    }
    byId.set(id, merged)
  })
  return Array.from(byId.values()).sort(
    (a, b) => updatedAtOfLog(b) - updatedAtOfLog(a)
  )
}

/** 免登入頁面：從雲端拉承攬商名單與出工紀錄 */
export async function pullPublicContractorData() {
  const sb = getSupabaseClient()
  if (!sb) return { ok: true, localOnly: true }
  try {
    const keys = [
      CONTRACTOR_REGISTRATION_KEY,
      CONTRACTOR_WORK_LOG_KEY,
      'jiameng_dropdown_options',
      'jiameng_food_order_merchants',
      'jiameng_food_order_records'
    ]
    const { data, error } = await sb.from('app_data').select('key, data').in('key', keys)
    if (error) throw error
    ;(data || []).forEach((row) => {
      const key = String(row?.key || '').trim()
      if (!key) return
      if (key === CONTRACTOR_WORK_LOG_KEY) {
        const incoming = Array.isArray(row?.data)
          ? row.data
          : (typeof row?.data === 'string' ? (() => { try { return JSON.parse(row.data || '[]') } catch (_) { return [] } })() : [])
        const merged = mergeContractorWorkLogs(readAllContractorWorkLogs(), incoming)
        localStorage.setItem(key, JSON.stringify(merged))
      } else {
        const val = typeof row?.data === 'string' ? row.data : JSON.stringify(row?.data ?? [])
        localStorage.setItem(key, val)
      }
      try {
        window.dispatchEvent(new CustomEvent(REALTIME_UPDATE_EVENT, { detail: { key } }))
      } catch (_) {}
    })
    return { ok: true }
  } catch (e) {
    console.warn('pullPublicContractorData:', e)
    return { ok: false, error: e }
  }
}

export const registerContractorArrival = ({
  date,
  siteName,
  companyId,
  companyName,
  personId,
  personName,
  employeeNo,
  arrivalTime
}) => {
  try {
    const d = String(date || '').slice(0, 10)
    const site = String(siteName || '').trim()
    const cid = String(companyId || '').trim()
    const pid = String(personId || '').trim()
    const name = String(personName || '').trim()
    const at = String(arrivalTime || '').trim()
    if (!d || !site || !cid || !pid || !name) return { success: false, message: '資料不完整' }
    if (!at) return { success: false, message: '請填寫進廠時間' }
    const list = readAllContractorWorkLogs()
    const idx = list.findIndex((r) => logKey(r.date, r.siteName, r.companyId, r.personId) === logKey(d, site, cid, pid))
    if (idx >= 0 && list[idx]?.arrivalTime && !list[idx]?.deleted) {
      return { success: false, message: '此人今日此案場已登記進廠' }
    }
    const now = new Date().toISOString()
    const rec = {
      id: idx >= 0 ? list[idx].id : `cwl-${Date.now()}`,
      date: d,
      siteName: site,
      companyId: cid,
      companyName: String(companyName || '').trim(),
      personId: pid,
      personName: name,
      employeeNo: String(employeeNo || '').trim(),
      arrivalTime: at,
      departureTime: idx >= 0 && !list[idx]?.deleted ? (list[idx].departureTime || '') : '',
      deleted: false,
      createdAt: idx >= 0 && !list[idx]?.deleted ? (list[idx].createdAt || now) : now,
      updatedAt: now
    }
    if (idx >= 0) list[idx] = rec
    else list.push(rec)
    persist(list)
    return { success: true, record: rec }
  } catch (e) {
    console.error('registerContractorArrival:', e)
    return { success: false, message: '進廠登記失敗' }
  }
}

export const registerContractorDeparture = ({
  date,
  siteName,
  companyId,
  personId,
  departureTime,
  overtimeRequestHours,
  overtimeStatus
}) => {
  try {
    const d = String(date || '').slice(0, 10)
    const site = String(siteName || '').trim()
    const cid = String(companyId || '').trim()
    const pid = String(personId || '').trim()
    const dt = String(departureTime || CONTRACTOR_STANDARD_DEPARTURE).trim()
    const otHours = Math.max(0, Number(overtimeRequestHours) || 0)
    const otStatus = overtimeStatus || (otHours > 0 ? 'pending' : 'none')
    if (!d || !site || !cid || !pid) return { success: false, message: '資料不完整' }
    if (!dt) return { success: false, message: '請填寫離廠時間' }
    if (otStatus === 'pending' && otHours <= 0) {
      return { success: false, message: '請填寫申請加班時數' }
    }
    const list = readAllContractorWorkLogs()
    const idx = list.findIndex((r) => logKey(r.date, r.siteName, r.companyId, r.personId) === logKey(d, site, cid, pid))
    if (idx < 0 || !list[idx]?.arrivalTime || list[idx]?.deleted) {
      return { success: false, message: '請先登記進廠' }
    }
    if (list[idx]?.departureTime) {
      return { success: false, message: '此人今日此案場已登記離廠' }
    }
    const now = new Date().toISOString()
    list[idx] = {
      ...list[idx],
      departureTime: dt,
      overtimeRequestHours: otHours,
      overtimeStatus: otStatus,
      approvedOvertimeHours: undefined,
      updatedAt: now
    }
    persist(list)
    return { success: true, record: list[idx] }
  } catch (e) {
    console.error('registerContractorDeparture:', e)
    return { success: false, message: '離廠登記失敗' }
  }
}

/** 管理者更新進離廠時間 */
export const updateContractorWorkLog = (id, patch) => {
  try {
    const rid = String(id || '').trim()
    if (!rid) return { success: false, message: '紀錄不存在' }
    const list = readAllContractorWorkLogs()
    const idx = list.findIndex((r) => String(r?.id || '').trim() === rid)
    if (idx < 0 || list[idx]?.deleted) return { success: false, message: '找不到紀錄' }
    const prev = list[idx]
    const next = { ...prev, ...patch, updatedAt: new Date().toISOString() }
    if (patch.arrivalTime !== undefined) {
      next.arrivalTime = String(patch.arrivalTime || '').trim()
    }
    if (patch.departureTime !== undefined) {
      next.departureTime = String(patch.departureTime || '').trim()
    }
    if (patch.overtimeRequestHours !== undefined) {
      next.overtimeRequestHours = Math.max(0, Number(patch.overtimeRequestHours) || 0)
    }
    if (patch.overtimeStatus !== undefined) {
      next.overtimeStatus = String(patch.overtimeStatus || 'none').trim() || 'none'
    }
    if (patch.approvedOvertimeHours !== undefined) {
      const v = Number(patch.approvedOvertimeHours)
      next.approvedOvertimeHours = Number.isFinite(v) && v > 0 ? v : undefined
    }
    if (!next.arrivalTime && !next.departureTime) {
      return { success: false, message: '進廠與離廠時間不可皆為空' }
    }
    list[idx] = next
    persist(list)
    return { success: true, record: next }
  } catch (e) {
    console.error('updateContractorWorkLog:', e)
    return { success: false, message: '更新失敗' }
  }
}

/** 管理員審核承攬商加班申請 */
export const reviewContractorOvertime = (id, { action, approvedHours } = {}) => {
  try {
    const rid = String(id || '').trim()
    if (!rid) return { success: false, message: '紀錄不存在' }
    const act = String(action || '').trim()
    if (act !== 'approve' && act !== 'reject') return { success: false, message: '無效操作' }
    const list = readAllContractorWorkLogs()
    const idx = list.findIndex((r) => String(r?.id || '').trim() === rid)
    if (idx < 0 || list[idx]?.deleted) return { success: false, message: '找不到紀錄' }
    const prev = list[idx]
    if (String(prev?.overtimeStatus || '').trim() !== 'pending') {
      return { success: false, message: '此筆無待審加班申請' }
    }
    const now = new Date().toISOString()
    if (act === 'approve') {
      const hrs = Number(approvedHours ?? prev.overtimeRequestHours) || 0
      if (hrs <= 0) return { success: false, message: '請填寫核准加班時數' }
      list[idx] = {
        ...prev,
        overtimeStatus: 'approved',
        approvedOvertimeHours: hrs,
        updatedAt: now
      }
    } else {
      list[idx] = {
        ...prev,
        overtimeStatus: 'rejected',
        approvedOvertimeHours: undefined,
        updatedAt: now
      }
    }
    persist(list)
    return { success: true, record: list[idx] }
  } catch (e) {
    console.error('reviewContractorOvertime:', e)
    return { success: false, message: '審核失敗' }
  }
}

/** 刪除出工紀錄（軟刪除，同步雲端後行事曆與出勤紀錄會一併移除） */
export const deleteContractorWorkLog = (id) => {
  try {
    const rid = String(id || '').trim()
    if (!rid) return { success: false, message: '紀錄不存在' }
    const list = readAllContractorWorkLogs()
    const idx = list.findIndex((r) => String(r?.id || '').trim() === rid)
    if (idx < 0 || list[idx]?.deleted) return { success: false, message: '找不到紀錄' }
    const now = new Date().toISOString()
    list[idx] = { ...list[idx], deleted: true, updatedAt: now }
    persist(list)
    return { success: true }
  } catch (e) {
    console.error('deleteContractorWorkLog:', e)
    return { success: false, message: '刪除失敗' }
  }
}

const chipKey = (date, siteName, companyId) =>
  `${String(date || '').slice(0, 10)}|${String(siteName || '').trim()}|${String(companyId || '').trim()}`

/** 當月有進廠紀錄的承攬商出工（僅含已登記進廠者） */
export const getContractorWorkLogsForMonth = (year, month) => {
  const m = String(month).padStart(2, '0')
  const prefix = `${year}-${m}`
  return getContractorWorkLogs().filter((r) => {
    const d = String(r?.date || '').slice(0, 10)
    return d.startsWith(prefix) && String(r?.arrivalTime || '').trim()
  })
}

/** 月曆用：date → [{ siteName, companyId, companyName }] */
export const getContractorWorkChipsForMonth = (year, month) => {
  const map = new Map()
  getContractorWorkLogsForMonth(year, month).forEach((r) => {
    const d = String(r.date || '').slice(0, 10)
    const site = String(r.siteName || '').trim()
    const cid = String(r.companyId || '').trim()
    const cname = String(r.companyName || '').trim()
    if (!d || !site || !cid) return
    const key = chipKey(d, site, cid)
    if (!map.has(key)) {
      map.set(key, { date: d, siteName: site, companyId: cid, companyName: cname })
    }
  })
  const byDate = new Map()
  map.forEach((chip) => {
    if (!byDate.has(chip.date)) byDate.set(chip.date, [])
    byDate.get(chip.date).push(chip)
  })
  byDate.forEach((chips, date) => {
    chips.sort((a, b) => {
      const s = String(a.siteName || '').localeCompare(String(b.siteName || ''), 'zh-Hant')
      if (s !== 0) return s
      return String(a.companyName || '').localeCompare(String(b.companyName || ''), 'zh-Hant')
    })
    byDate.set(date, chips)
  })
  return byDate
}

export const getContractorWorkLogsForChip = ({ date, dateStr, siteName, companyId }) =>
  getWorkLogsForDate(date || dateStr, { companyId, siteName }).filter((r) => String(r?.arrivalTime || '').trim())

export const formatContractorTimeLabel = (log) => {
  const arr = String(log?.arrivalTime || '').trim()
  const dep = String(log?.departureTime || '').trim()
  if (!arr) return '—'
  if (!dep) return `${arr}~ (待離廠)`
  return `${arr}~${dep}`
}

/** 單人出工摘要：有離廠即 1 工；緊急入場僅採已核准加班申請時數 */
export const getContractorWorkLogShiftSummary = (log) => {
  const arr = String(log?.arrivalTime || '').trim()
  const dep = String(log?.departureTime || '').trim()
  if (!arr || !dep) return null
  const headcount = 1
  const totalOvertimeHours = getContractorEmergencyHours(log)
  return {
    headcount,
    perPersonOvertimeHours: totalOvertimeHours,
    totalOvertimeHours,
    hasOvertime: totalOvertimeHours > 0,
    underHeadcount: 0,
    underActualHours: 0,
    underPerPersonHours: 0,
    hasUnderHours: false,
    fullDayHeadcount: headcount,
    isLate: isContractorLate(arr),
    lateHeadcount: isContractorLate(arr) ? 1 : 0
  }
}

/** 多人合計摘要（承攬商：不計未滿 8 小時，有出工即 1 工） */
export const aggregateContractorWorkLogsSummary = (logs) => {
  const list = Array.isArray(logs) ? logs : []
  let totalHeadcount = 0
  let totalOvertimeHours = 0
  let fullDayHeadcount = 0
  let lateHeadcount = 0
  list.forEach((log) => {
    const s = getContractorWorkLogShiftSummary(log)
    if (!s) return
    totalHeadcount += s.headcount
    totalOvertimeHours += s.totalOvertimeHours
    fullDayHeadcount += s.fullDayHeadcount
    lateHeadcount += s.lateHeadcount || 0
  })
  totalOvertimeHours = roundHours(totalOvertimeHours)
  return {
    totalHeadcount,
    totalOvertimeHours,
    hasOvertime: totalOvertimeHours > 0,
    underHeadcount: 0,
    underActualHours: 0,
    underPerPersonHours: 0,
    hasUnderHours: false,
    fullDayHeadcount,
    lateHeadcount,
    hasLate: lateHeadcount > 0
  }
}

/** 承攬商出勤紀錄：依月份彙整每日各案場人員與人數 */
export const getContractorAttendanceByMonth = (companyId, year, month) => {
  const cid = String(companyId || '').trim()
  if (!cid) return []
  const logs = getContractorWorkLogsForMonth(year, month).filter(
    (r) => String(r?.companyId || '').trim() === cid
  )
  const byDate = new Map()
  logs.forEach((r) => {
    const d = String(r.date || '').slice(0, 10)
    if (!byDate.has(d)) byDate.set(d, [])
    byDate.get(d).push(r)
  })
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, dayLogs]) => {
      const sites = new Map()
      dayLogs.forEach((r) => {
        const site = String(r.siteName || '').trim() || '—'
        if (!sites.has(site)) sites.set(site, [])
        sites.get(site).push(r)
      })
      return {
        date,
        totalHeadcount: dayLogs.length,
        sites: [...sites.entries()]
          .sort((a, b) => a[0].localeCompare(b[0], 'zh-Hant'))
          .map(([siteName, rows]) => ({
            siteName,
            headcount: rows.length,
            rows: [...rows].sort((a, b) =>
              String(a?.personName || '').localeCompare(String(b?.personName || ''), 'zh-Hant')
            )
          }))
      }
    })
}
