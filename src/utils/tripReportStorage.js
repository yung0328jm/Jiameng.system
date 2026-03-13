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

/** 同一「排程+段落+日+動作」或（舊資料）同一「案場+日+動作」只保留「第一次」時間（最早 createdAt）。各卡片各自回報、互不混淆。 */
function normalizeTripReports(list) {
  const arr = Array.isArray(list) ? list : []
  const byKey = new Map()
  arr.forEach((r) => {
    const sid = String(r?.scheduleId ?? '').trim()
    const seg = Number(r?.segmentIndex)
    const segIdx = Number.isInteger(seg) && seg >= 0 ? seg : 0
    const pid = String(r?.projectId || '').trim()
    const ymd = String(r?.ymd || '').trim() || ymdLocal(r?.createdAt || '')
    const action = String(r?.actionType || '').trim()
    const k = sid ? `${sid}\t${segIdx}\t${ymd}\t${action}` : `${pid}\t0\t${ymd}\t${action}`
    if ((!sid && !pid) || !ymd || !action) return
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
 * 取得「某排程＋某段落＋某日」的行程紀錄（依時間新到舊）。各卡片各自回報，不會抓到其他卡片或他日資料。
 */
export const getTripReportsBySchedule = (scheduleId, segmentIndex, todayYmd) => {
  const sid = String(scheduleId ?? '').trim()
  const segIdx = Number.isInteger(segmentIndex) && segmentIndex >= 0 ? segmentIndex : 0
  const ymd = String(todayYmd ?? '').trim()
  if (!sid || !ymd) return []
  const list = loadAll()
  return list
    .filter((r) => String(r?.scheduleId ?? '').trim() === sid && (Number(r?.segmentIndex) || 0) === segIdx)
    .filter((r) => {
      const rYmd = String(r?.ymd || '').trim() || ymdLocal(r?.createdAt || '')
      return rYmd === ymd
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

/**
 * 取得某案場（projectId）的行程紀錄，依時間新到舊（用於 TripReport 頁：僅含未綁定排程的紀錄，或舊資料）
 * - 若提供 todayYmd（YYYY-MM-DD），則只回傳該日
 */
export const getTripReportsByProject = (projectId, todayYmd = '') => {
  const list = loadAll()
  return list
    .filter((r) => r.projectId === projectId && (r.scheduleId == null || String(r.scheduleId).trim() === ''))
    .filter((r) => {
      if (!todayYmd) return true
      const ymd = String(r?.ymd || '').trim()
      if (ymd) return ymd === todayYmd
      return ymdLocal(r?.createdAt || '') === todayYmd
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

/** 新增一筆行程回報。若傳 scheduleId/segmentIndex 則綁定該排程+段落（各卡片各自回報）；同一排程+段落+日+動作只保留第一次。 */
export const addTripReport = ({ scheduleId, segmentIndex, projectId, projectName, actionType, userId, userName, ymd }) => {
  if (!actionTypes.includes(actionType)) return { success: false, message: '無效的類型' }
  const list = loadAll()
  const sid = String(scheduleId ?? '').trim()
  const segIdx = Number.isInteger(segmentIndex) && segmentIndex >= 0 ? segmentIndex : 0
  const pid = String(projectId || '').trim()
  const dateYmd = String(ymd || '').trim() || ymdLocal(new Date().toISOString())
  const already = list.some((r) => {
    const rYmd = (r?.ymd || ymdLocal(r?.createdAt || '')) === dateYmd
    const sameAction = r.actionType === actionType
    if (sid) {
      return String(r?.scheduleId ?? '').trim() === sid && (Number(r?.segmentIndex) || 0) === segIdx && rYmd && sameAction
    }
    return !r?.scheduleId && r.projectId === pid && rYmd && sameAction
  })
  if (already) {
    return { success: true, message: '該步驟已紀錄過，時間以第一次為準' }
  }
  const record = {
    id: `tr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    scheduleId: sid || undefined,
    segmentIndex: sid ? segIdx : undefined,
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
