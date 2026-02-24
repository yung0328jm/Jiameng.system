// 行程回報儲存：依案場（專案）紀錄「出發、抵達、休息、上工、收工、離場」及時間、人員
import { syncKeyToSupabase } from './supabaseSync'
const TRIP_REPORT_STORAGE_KEY = 'jiameng_trip_reports'

const actionTypes = ['出發', '抵達', '休息', '上工', '收工', '離場']
const pad2 = (n) => String(n).padStart(2, '0')
const ymdLocal = (iso) => {
  try {
    const d = new Date(iso)
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  } catch (_) {
    return ''
  }
}

/** 同一案場+同一日+同一動作只保留「第一次」時間（最早 createdAt） */
function normalizeTripReports(list) {
  const arr = Array.isArray(list) ? list : []
  const byKey = new Map()
  arr.forEach((r) => {
    const pid = String(r?.projectId || '').trim()
    const ymd = String(r?.ymd || '').trim() || ymdLocal(r?.createdAt || '')
    const action = String(r?.actionType || '').trim()
    const k = `${pid}\t${ymd}\t${action}`
    if (!pid || !ymd || !action) return
    const prev = byKey.get(k)
    const t = Date.parse(r?.createdAt || '') || 0
    if (!prev || t < (Date.parse(prev?.createdAt || '') || 0)) byKey.set(k, r)
  })
  return Array.from(byKey.values()).sort((a, b) => (Date.parse(b?.createdAt || '') || 0) - (Date.parse(a?.createdAt || '') || 0))
}

function loadAll() {
  try {
    const raw = localStorage.getItem(TRIP_REPORT_STORAGE_KEY)
    const list = raw ? JSON.parse(raw) : []
    return normalizeTripReports(list)
  } catch (e) {
    console.error('tripReportStorage loadAll', e)
    return []
  }
}

function saveAll(list) {
  try {
    const normalized = normalizeTripReports(list)
    const val = JSON.stringify(normalized)
    localStorage.setItem(TRIP_REPORT_STORAGE_KEY, val)
    syncKeyToSupabase(TRIP_REPORT_STORAGE_KEY, val)
    return true
  } catch (e) {
    console.error('tripReportStorage saveAll', e)
    return false
  }
}

/**
 * 取得某案場（projectId）的行程紀錄，依時間新到舊
 * - 若提供 todayYmd（YYYY-MM-DD），則只回傳該日（以本地時區計算）的紀錄
 */
export const getTripReportsByProject = (projectId, todayYmd = '') => {
  const list = loadAll()
  return list
    .filter((r) => r.projectId === projectId)
    .filter((r) => {
      if (!todayYmd) return true
      // 先看明確紀錄的 ymd（避免跨日/時區造成「同日卻看不到」）
      const ymd = String(r?.ymd || '').trim()
      if (ymd) return ymd === todayYmd
      return ymdLocal(r?.createdAt || '') === todayYmd
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

/** 新增一筆行程回報（同一案場、同一日期、同一動作只保留第一次紀錄，其他裝置再點不會覆蓋） */
export const addTripReport = ({ projectId, projectName, actionType, userId, userName, ymd }) => {
  if (!actionTypes.includes(actionType)) return { success: false, message: '無效的類型' }
  const list = loadAll()
  const pid = String(projectId || '').trim()
  const dateYmd = String(ymd || '').trim() || ymdLocal(new Date().toISOString())
  // 已存在同一案場、同一日期、同一動作的紀錄 → 不再新增，保留第一次時間
  const already = list.some(
    (r) => r.projectId === pid && (r.ymd || ymdLocal(r?.createdAt || '')) === dateYmd && r.actionType === actionType
  )
  if (already) {
    return { success: true, message: '該步驟已紀錄過，時間以第一次為準' }
  }
  const record = {
    id: `tr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    projectId: pid,
    projectName: projectName || pid,
    actionType,
    userId: userId || '',
    userName: userName || userId || '',
    ymd: dateYmd,
    createdAt: new Date().toISOString()
  }
  list.push(record)
  if (!saveAll(list)) return { success: false, message: '寫入失敗' }
  return { success: true, record }
}

export { actionTypes }
