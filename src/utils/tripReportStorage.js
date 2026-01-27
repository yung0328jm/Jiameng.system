// 行程回報儲存：依案場（專案）紀錄「出發、休息、上工、收工、離場」及時間、人員
import { syncKeyToSupabase } from './supabaseSync'
const TRIP_REPORT_STORAGE_KEY = 'jiameng_trip_reports'

const actionTypes = ['出發', '休息', '上工', '收工', '離場']

function loadAll() {
  try {
    const raw = localStorage.getItem(TRIP_REPORT_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (e) {
    console.error('tripReportStorage loadAll', e)
    return []
  }
}

function saveAll(list) {
  try {
    const val = JSON.stringify(list)
    localStorage.setItem(TRIP_REPORT_STORAGE_KEY, val)
    syncKeyToSupabase(TRIP_REPORT_STORAGE_KEY, val)
    return true
  } catch (e) {
    console.error('tripReportStorage saveAll', e)
    return false
  }
}

/** 取得某案場（projectId）的行程紀錄，依時間新到舊 */
export const getTripReportsByProject = (projectId) => {
  const list = loadAll()
  return list
    .filter((r) => r.projectId === projectId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

/** 新增一筆行程回報 */
export const addTripReport = ({ projectId, projectName, actionType, userId, userName }) => {
  if (!actionTypes.includes(actionType)) return { success: false, message: '無效的類型' }
  const list = loadAll()
  const record = {
    id: `tr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    projectId: projectId || '',
    projectName: projectName || '',
    actionType,
    userId: userId || '',
    userName: userName || userId || '',
    createdAt: new Date().toISOString()
  }
  list.push(record)
  if (!saveAll(list)) return { success: false, message: '寫入失敗' }
  return { success: true, record }
}

export { actionTypes }
