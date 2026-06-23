// 承攬商出工登記（免登入；紀錄同步至 Supabase app_data）
import { getSupabaseClient } from './supabaseClient'
import { syncKeyToSupabase } from './supabaseSync'
import { REALTIME_UPDATE_EVENT } from './supabaseRealtime'
import { CONTRACTOR_REGISTRATION_KEY } from './contractorRegistrationStorage'

export const CONTRACTOR_WORK_LOG_KEY = 'jiameng_contractor_work_logs'

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

export const getContractorWorkLogs = () => {
  try {
    const raw = localStorage.getItem(CONTRACTOR_WORK_LOG_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch (_) {
    return []
  }
}

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

/** 免登入頁面：從雲端拉承攬商名單與出工紀錄 */
export async function pullPublicContractorData() {
  const sb = getSupabaseClient()
  if (!sb) return { ok: true, localOnly: true }
  try {
    const keys = [CONTRACTOR_REGISTRATION_KEY, CONTRACTOR_WORK_LOG_KEY, 'jiameng_dropdown_options']
    const { data, error } = await sb.from('app_data').select('key, data').in('key', keys)
    if (error) throw error
    ;(data || []).forEach((row) => {
      const key = String(row?.key || '').trim()
      if (!key) return
      const val = typeof row?.data === 'string' ? row.data : JSON.stringify(row?.data ?? [])
      localStorage.setItem(key, val)
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
    const list = getContractorWorkLogs()
    const idx = list.findIndex((r) => logKey(r.date, r.siteName, r.companyId, r.personId) === logKey(d, site, cid, pid))
    if (idx >= 0 && list[idx]?.arrivalTime) {
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
      departureTime: idx >= 0 ? (list[idx].departureTime || '') : '',
      createdAt: idx >= 0 ? (list[idx].createdAt || now) : now,
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
  departureTime
}) => {
  try {
    const d = String(date || '').slice(0, 10)
    const site = String(siteName || '').trim()
    const cid = String(companyId || '').trim()
    const pid = String(personId || '').trim()
    const dt = String(departureTime || '').trim()
    if (!d || !site || !cid || !pid) return { success: false, message: '資料不完整' }
    if (!dt) return { success: false, message: '請填寫離廠時間' }
    const list = getContractorWorkLogs()
    const idx = list.findIndex((r) => logKey(r.date, r.siteName, r.companyId, r.personId) === logKey(d, site, cid, pid))
    if (idx < 0 || !list[idx]?.arrivalTime) {
      return { success: false, message: '請先登記進廠' }
    }
    if (list[idx]?.departureTime) {
      return { success: false, message: '此人今日此案場已登記離廠' }
    }
    const now = new Date().toISOString()
    list[idx] = { ...list[idx], departureTime: dt, updatedAt: now }
    persist(list)
    return { success: true, record: list[idx] }
  } catch (e) {
    console.error('registerContractorDeparture:', e)
    return { success: false, message: '離廠登記失敗' }
  }
}
