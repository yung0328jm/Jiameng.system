// 加班申請儲存：與排程綁定，記錄申請人、日期、開始/結束時間、時數、加班人員
import { syncKeyToSupabase } from './supabaseSync'
import { REALTIME_UPDATE_EVENT } from './supabaseRealtime'
import { getWorkReports, getWorkReportRowShiftSummary, parseWorkReportBaseName } from './workReportStorage'

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
    const id = `overtime-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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

/** 待審核的加班申請（管理員用） */
export const getPendingOvertimeApplications = () => getOvertimeApplications().filter((r) => (r.status || '') === 'pending')

function persistOvertimeList(list) {
  localStorage.setItem(OVERTIME_APPLICATION_KEY, JSON.stringify(list))
  syncKeyToSupabase(OVERTIME_APPLICATION_KEY, list).catch(() => {})
  notifyOvertimeKeyChanged()
}

/**
 * 出工超過 8 小時時自動送出緊急入場申請（待管理員審核）。
 * 已有待審／已核准則不重複；若僅更新待審單的時數。
 */
export function ensureWorkReportOvertimeApplication(row, { replaceRejected = false } = {}) {
  try {
    if (!row?.id) return { success: true, skipped: true }
    const summary = getWorkReportRowShiftSummary(row)
    const otHours = Number(summary?.totalOvertimeHours ?? 0)
    if (!summary?.hasOvertime || otHours <= 0) return { success: true, skipped: true }

    const apps = getOvertimeApplicationsByWorkReportRowId(row.id)
    const pending = apps.find((a) => String(a?.status || 'pending') === 'pending')
    const approved = apps.find((a) => String(a?.status || '') === 'approved')
    if (approved) return { success: true, skipped: true }

    const personnel = [parseWorkReportBaseName(row?.personName) || row?.personName].filter(Boolean)
    const patch = {
      siteName: String(row?.siteName || '').trim(),
      date: String(row?.date || '').trim(),
      startTime: String(row?.arrivalTime || '').trim(),
      endTime: String(row?.departureTime || '').trim(),
      hours: otHours,
      overtimePersonnel: personnel,
      applicant: String(row?.submittedByName || row?.submittedBy || '').trim()
    }

    if (pending) {
      const same =
        Number(pending.hours) === otHours &&
        String(pending.startTime || '') === patch.startTime &&
        String(pending.endTime || '') === patch.endTime &&
        String(pending.siteName || '') === patch.siteName
      if (same) return { success: true, skipped: true }
      const list = getOvertimeApplications()
      const idx = list.findIndex((r) => String(r?.id || '') === String(pending.id || ''))
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...patch }
        persistOvertimeList(list)
      }
      return { success: true, updated: true }
    }

    const onlyRejected = apps.length > 0 && apps.every((a) => String(a?.status || '') === 'rejected')
    if (onlyRejected && !replaceRejected) return { success: true, skipped: true }

    return addOvertimeApplication({
      workReportRowId: row.id,
      ...patch
    })
  } catch (e) {
    console.error('ensureWorkReportOvertimeApplication:', e)
    return { success: false, message: '自動申報失敗' }
  }
}

/** 近 N 日有加班時數但尚未送出的出工，補送待審申請 */
export function backfillWorkReportOvertimeApplications({ days = 14 } = {}) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  ;(getWorkReports() || []).forEach((row) => {
    const date = String(row?.date || '').slice(0, 10)
    if (!date || date < cutoffStr) return
    ensureWorkReportOvertimeApplication(row, { replaceRejected: false })
  })
}

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
