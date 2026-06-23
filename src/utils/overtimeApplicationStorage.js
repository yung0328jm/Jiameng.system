// 加班申請儲存：與排程綁定，記錄申請人、日期、開始/結束時間、時數、加班人員
import { syncKeyToSupabase } from './supabaseSync'
import { REALTIME_UPDATE_EVENT } from './supabaseRealtime'

const OVERTIME_APPLICATION_KEY = 'jiameng_overtime_applications'

const notifyOvertimeKeyChanged = () => {
  try {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent(REALTIME_UPDATE_EVENT, { detail: { key: OVERTIME_APPLICATION_KEY } }))
  } catch (_) {
    // ignore
  }
}

export const getOvertimeApplications = () => {
  try {
    const data = localStorage.getItem(OVERTIME_APPLICATION_KEY)
    return data ? JSON.parse(data) : []
  } catch (e) {
    console.error('getOvertimeApplications:', e)
    return []
  }
}

/** 依排程 ID 取得該排程的加班申請列表 */
export const getOvertimeApplicationsByScheduleId = (scheduleId) => {
  const list = getOvertimeApplications()
  const id = String(scheduleId || '').trim()
  if (!id) return []
  return list.filter((r) => String(r?.scheduleId || '').trim() === id)
}

/** 依出工回報 row ID 取得申報紀錄（新流程：緊急追加服務費 申報） */
export const getOvertimeApplicationsByWorkReportRowId = (rowId) => {
  const list = getOvertimeApplications()
  const id = String(rowId || '').trim()
  if (!id) return []
  return list.filter((r) => String(r?.workReportRowId || '').trim() === id)
}

/** 新增一筆加班申請（狀態：待審核 pending） */
export const addOvertimeApplication = ({ scheduleId, workReportRowId, applicant, date, startTime, endTime, hours, overtimePersonnel, siteName }) => {
  try {
    const list = getOvertimeApplications()
    const id = `overtime-${Date.now()}`
    const rec = {
      id,
      scheduleId: String(scheduleId || '').trim(),
      workReportRowId: String(workReportRowId || '').trim(),
      siteName: String(siteName || '').trim(),
      applicant: String(applicant || '').trim(),
      date: String(date || '').trim(),
      startTime: String(startTime || '').trim(),
      endTime: String(endTime || '').trim(),
      hours: hours != null && hours !== '' ? Number(hours) : null,
      overtimePersonnel: Array.isArray(overtimePersonnel) ? overtimePersonnel : (typeof overtimePersonnel === 'string' ? String(overtimePersonnel).split(',').map((s) => s.trim()).filter(Boolean) : []),
      status: 'pending', // pending | approved | rejected
      createdAt: new Date().toISOString()
    }
    list.push(rec)
    localStorage.setItem(OVERTIME_APPLICATION_KEY, JSON.stringify(list))
    // 同步到 Supabase，確保不同用戶/裝置也能看見「待審核/已核准」狀態
    syncKeyToSupabase(OVERTIME_APPLICATION_KEY, list).catch(() => {})
    notifyOvertimeKeyChanged()
    return { success: true, id, record: rec }
  } catch (e) {
    console.error('addOvertimeApplication:', e)
    return { success: false, message: '儲存失敗' }
  }
}

/** 管理員審核：更新加班申請狀態；駁回時可傳 rejectionReason */
export const updateOvertimeApplicationStatus = (id, status, reviewedBy = '', rejectionReason = '') => {  try {
    const list = getOvertimeApplications()
    const idx = list.findIndex((r) => String(r?.id || '') === String(id || ''))
    if (idx < 0) return { success: false, message: '找不到該申請' }
    const next = list.slice()
    const reasonTrim = String(rejectionReason || '').trim()
    next[idx] = {
      ...next[idx],
      status: status === 'approved' || status === 'rejected' ? status : next[idx].status,
      reviewedBy: String(reviewedBy || '').trim(),
      reviewedAt: (status === 'approved' || status === 'rejected') ? new Date().toISOString() : (next[idx].reviewedAt || null),
      ...(status === 'rejected'
        ? { rejectionReason: reasonTrim }
        : status === 'approved'
          ? { rejectionReason: undefined }
          : {})
    }
    localStorage.setItem(OVERTIME_APPLICATION_KEY, JSON.stringify(next))
    syncKeyToSupabase(OVERTIME_APPLICATION_KEY, next).catch(() => {})
    notifyOvertimeKeyChanged()
    return { success: true }
  } catch (e) {
    console.error('updateOvertimeApplicationStatus:', e)
    return { success: false, message: '更新失敗' }
  }
}

/** 待審核的加班申請（管理員用） */export const getPendingOvertimeApplications = () => getOvertimeApplications().filter((r) => (r.status || '') === 'pending')

/** 刪除一筆加班申請 */
export const deleteOvertimeApplication = (id) => {
  try {
    const list = getOvertimeApplications()
    const next = list.filter((r) => String(r?.id || '') !== String(id || ''))
    localStorage.setItem(OVERTIME_APPLICATION_KEY, JSON.stringify(next))
    syncKeyToSupabase(OVERTIME_APPLICATION_KEY, next).catch(() => {})
    notifyOvertimeKeyChanged()
    return { success: true }
  } catch (e) {
    console.error('deleteOvertimeApplication:', e)
    return { success: false, message: '刪除失敗' }
  }
}
