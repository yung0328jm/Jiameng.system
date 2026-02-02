// 請假申請儲存：記錄請假申請；僅在管理員核准後才由頁面呼叫 saveSchedule 寫入行事曆
import { getSupabaseClient } from './supabaseClient'

const LEAVE_APPLICATION_KEY = 'jiameng_leave_applications'

const toRow = (r) => ({
  id: r.id,
  user_id: r.userId ?? '',
  user_name: r.userName ?? '',
  start_date: r.startDate ?? '',
  end_date: r.endDate ?? '',
  reason: r.reason ?? '',
  status: r.status ?? 'pending',
  created_at: r.createdAt ?? new Date().toISOString(),
  approved_by: r.approvedBy ?? '',
  approved_at: r.approvedAt ?? null
})

const syncLeaveToSupabase = async (rec) => {
  const sb = getSupabaseClient()
  if (!sb || !rec?.id) return
  try {
    await sb.from('leave_applications').upsert(toRow(rec), { onConflict: 'id' })
  } catch (e) {
    console.warn('syncLeaveToSupabase:', e)
  }
}

export const getLeaveApplications = () => {
  try {
    const data = localStorage.getItem(LEAVE_APPLICATION_KEY)
    return data ? JSON.parse(data) : []
  } catch (e) {
    console.error('getLeaveApplications:', e)
    return []
  }
}

/** 待審核清單（status === 'pending'） */
export const getPendingLeaveApplications = () => {
  return getLeaveApplications().filter((r) => (r.status || 'pending') === 'pending')
}

/** 新增一筆請假申請（status: pending），不寫入行事曆 */
export const addLeaveApplication = ({ userId, userName, startDate, endDate, reason }) => {
  try {
    const list = getLeaveApplications()
    const id = `leave-${Date.now()}`
    const rec = {
      id,
      userId: userId || '',
      userName: userName || userId || '',
      startDate: startDate || '',
      endDate: endDate || '',
      reason: reason || '',
      status: 'pending',
      createdAt: new Date().toISOString()
    }
    list.push(rec)
    localStorage.setItem(LEAVE_APPLICATION_KEY, JSON.stringify(list))
    syncLeaveToSupabase(rec)
    return { success: true, id, record: rec }
  } catch (e) {
    console.error('addLeaveApplication:', e)
    return { success: false, message: '儲存失敗' }
  }
}

/** 管理員核准或駁回；核准後由呼叫方負責寫入行事曆 */
export const updateLeaveApplicationStatus = (id, status, approvedBy = '') => {
  try {
    const list = getLeaveApplications()
    const idx = list.findIndex((r) => r.id === id)
    if (idx === -1) return { success: false, message: '找不到該申請' }
    list[idx] = {
      ...list[idx],
      status: status === 'approved' || status === 'rejected' ? status : list[idx].status,
      approvedBy: approvedBy || list[idx].approvedBy,
      approvedAt: (status === 'approved' || status === 'rejected') ? new Date().toISOString() : list[idx].approvedAt
    }
    localStorage.setItem(LEAVE_APPLICATION_KEY, JSON.stringify(list))
    syncLeaveToSupabase(list[idx])
    return { success: true, record: list[idx] }
  } catch (e) {
    console.error('updateLeaveApplicationStatus:', e)
    return { success: false, message: '更新失敗' }
  }
}

/** 依 id 取單筆（供核准時寫入行事曆用） */
export const getLeaveApplicationById = (id) => {
  return getLeaveApplications().find((r) => r.id === id) || null
}

/** 管理員刪除請假申請（同時同步刪除到 Supabase leave_applications） */
export const deleteLeaveApplication = (id) => {
  try {
    const leaveId = String(id || '').trim()
    if (!leaveId) return { success: false, message: '缺少 id' }
    const list = getLeaveApplications()
    const next = (Array.isArray(list) ? list : []).filter((r) => String(r?.id || '').trim() !== leaveId)
    localStorage.setItem(LEAVE_APPLICATION_KEY, JSON.stringify(next))

    const sb = getSupabaseClient()
    if (sb) {
      sb.from('leave_applications').delete().eq('id', leaveId).catch((e) => console.warn('deleteLeaveApplication supabase:', e))
    }
    return { success: true }
  } catch (e) {
    console.error('deleteLeaveApplication:', e)
    return { success: false, message: '刪除失敗' }
  }
}
