// 請假申請儲存：記錄請假申請；僅在管理員核准後才由頁面呼叫 saveSchedule 寫入行事曆
import { getSupabaseClient } from './supabaseClient'
import { syncKeyToSupabase } from './supabaseSync'
import { REALTIME_UPDATE_EVENT } from './supabaseRealtime'
import { formatNoLeaveBlockedMessage, hasNoLeaveDateInRange } from './noLeaveDateStorage'
import { LEAVE_APPLICATION_KEY } from './leaveApplicationMerge'

export { LEAVE_APPLICATION_KEY } from './leaveApplicationMerge'
const LEAVE_FILLER_KEY = 'jiameng_leave_filler_account'
const LEAVE_LAST_WRITE_KEY = 'jiameng_leave_applications_last_write'

const toRow = (r, { includeSubmittedBy = true } = {}) => {
  const row = {
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
  }
  if (includeSubmittedBy) row.submitted_by = r.submittedBy ?? ''
  return row
}

const markLeaveLastWrite = () => {
  try { localStorage.setItem(LEAVE_LAST_WRITE_KEY, String(Date.now())) } catch (_) {}
}

const notifyLeaveChanged = () => {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(REALTIME_UPDATE_EVENT, { detail: { key: LEAVE_APPLICATION_KEY } }))
    }
  } catch (_) {}
}

const persistLeaveList = (list, { notify = true } = {}) => {
  localStorage.setItem(LEAVE_APPLICATION_KEY, JSON.stringify(list))
  markLeaveLastWrite()
  if (notify) notifyLeaveChanged()
}

const syncLeaveToSupabase = async (rec) => {
  const sb = getSupabaseClient()
  if (!sb || !rec?.id) return
  try {
    const { error } = await sb.from('leave_applications').upsert(toRow(rec), { onConflict: 'id' })
    if (error && /submitted_by/i.test(error.message || '')) {
      await sb.from('leave_applications').upsert(toRow(rec, { includeSubmittedBy: false }), { onConflict: 'id' })
    } else if (error) {
      throw error
    }
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
export const addLeaveApplication = ({ userId, userName, startDate, endDate, reason, submittedBy }) => {
  try {
    if (hasNoLeaveDateInRange(startDate, endDate)) {
      return { success: false, message: formatNoLeaveBlockedMessage(startDate, endDate) || '所選日期含禁休日，無法申請異動' }
    }
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
      createdAt: new Date().toISOString(),
      submittedBy: submittedBy ? String(submittedBy).trim() : ''
    }
    list.push(rec)
    persistLeaveList(list)
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
    const nextStart = list[idx].startDate
    const nextEnd = list[idx].endDate
    if (status === 'approved' && hasNoLeaveDateInRange(nextStart, nextEnd)) {
      return { success: false, message: formatNoLeaveBlockedMessage(nextStart, nextEnd) || '所選日期含禁休日，無法核准異動' }
    }
    list[idx] = {
      ...list[idx],
      status: status === 'approved' || status === 'rejected' ? status : list[idx].status,
      approvedBy: approvedBy || list[idx].approvedBy,
      approvedAt: (status === 'approved' || status === 'rejected') ? new Date().toISOString() : list[idx].approvedAt
    }
    persistLeaveList(list)
    syncLeaveToSupabase(list[idx])
    return { success: true, record: list[idx] }
  } catch (e) {
    console.error('updateLeaveApplicationStatus:', e)
    return { success: false, message: '更新失敗' }
  }
}

/** 管理員更新請假紀錄（日期、事由、狀態等）；核准後由呼叫方負責更新行事曆 */
export const updateLeaveApplication = (id, updates) => {
  try {
    const list = getLeaveApplications()
    const idx = list.findIndex((r) => r.id === id)
    if (idx === -1) return { success: false, message: '找不到該申請' }
    const prev = list[idx]
    const next = { ...prev }
    if (updates.startDate != null) next.startDate = String(updates.startDate).trim()
    if (updates.endDate != null) next.endDate = String(updates.endDate).trim()
    if (updates.reason != null) next.reason = String(updates.reason).trim()
    if (updates.status === 'approved' || updates.status === 'rejected') {
      next.status = updates.status
      next.approvedBy = updates.approvedBy != null ? String(updates.approvedBy).trim() : (prev.approvedBy || '')
      next.approvedAt = new Date().toISOString()
    }
    if (next.status === 'approved' && hasNoLeaveDateInRange(next.startDate, next.endDate)) {
      return { success: false, message: formatNoLeaveBlockedMessage(next.startDate, next.endDate) || '所選日期含禁休日，無法核准異動' }
    }
    list[idx] = next
    persistLeaveList(list)
    syncLeaveToSupabase(next)
    return { success: true, record: next }
  } catch (e) {
    console.error('updateLeaveApplication:', e)
    return { success: false, message: '更新失敗' }
  }
}

/** 依 id 取單筆（供核准時寫入行事曆用） */
export const getLeaveApplicationById = (id) => {
  return getLeaveApplications().find((r) => r.id === id) || null
}

function addDaysYmd(ymd, delta) {
  const d = new Date(`${String(ymd || '').slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  d.setDate(d.getDate() + delta)
  return d.toISOString().slice(0, 10)
}

function personKeysSet(personIdentifiers) {
  const raw = Array.isArray(personIdentifiers) ? personIdentifiers : [personIdentifiers]
  return new Set(
    raw.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
  )
}

/** 已核准請假：指定人員在指定日期的申請（可能多筆） */
export function findApprovedLeaveApplicationsForPersonOnDate(personIdentifiers, dateStr) {
  const d = String(dateStr || '').slice(0, 10)
  const keys = personKeysSet(personIdentifiers)
  if (!d || keys.size === 0) return []
  return getLeaveApplications().filter((la) => {
    if ((la.status || '') !== 'approved') return false
    const a = String(la.startDate || '').slice(0, 10)
    const b = String(la.endDate || '').slice(0, 10)
    if (!a || !b || d < a || d > b) return false
    const names = [la.userName, la.userId]
      .map((x) => String(x || '').trim().toLowerCase())
      .filter(Boolean)
    return names.some((n) => keys.has(n))
  })
}

/**
 * 從已核准請假區間移除單日；若為區間最後一天則刪除整筆。
 * 區間中間日：拆成兩筆已核准申請（左段保留原 id，右段新建）。
 */
export function removeApprovedLeaveDate(leaveId, dateStr) {
  const id = String(leaveId || '').trim()
  const d = String(dateStr || '').slice(0, 10)
  const rec = getLeaveApplicationById(id)
  if (!rec || (rec.status || '') !== 'approved') {
    return { success: false, message: '找不到已核准請假' }
  }
  const a = String(rec.startDate || '').slice(0, 10)
  const b = String(rec.endDate || '').slice(0, 10)
  if (!d || d < a || d > b) return { success: false, message: '日期不在請假區間內' }

  if (a === b) return deleteLeaveApplication(id)

  if (d === a) {
    const newStart = addDaysYmd(a, 1)
    if (!newStart || newStart > b) return deleteLeaveApplication(id)
    return updateLeaveApplication(id, { startDate: newStart, endDate: b })
  }
  if (d === b) {
    const newEnd = addDaysYmd(b, -1)
    if (!newEnd || newEnd < a) return deleteLeaveApplication(id)
    return updateLeaveApplication(id, { startDate: a, endDate: newEnd })
  }

  const leftEnd = addDaysYmd(d, -1)
  const rightStart = addDaysYmd(d, 1)
  const leftResult = updateLeaveApplication(id, { startDate: a, endDate: leftEnd })
  if (!leftResult.success) return leftResult

  const list = getLeaveApplications()
  const newId = `leave-${Date.now()}`
  const rightRec = {
    ...rec,
    id: newId,
    startDate: rightStart,
    endDate: b,
    status: 'approved',
    createdAt: new Date().toISOString(),
    approvedAt: new Date().toISOString()
  }
  list.push(rightRec)
  persistLeaveList(list)
  syncLeaveToSupabase(rightRec)
  return { success: true, record: rightRec, split: true }
}

/**
 * 行事曆刪除入廠異動後同步請假申請：
 * - 有 leaveApplicationId：刪除整筆申請（與多天行事曆連動）
 * - 無 leaveApplicationId（舊資料）：僅移除該日，不影響同區間其他天
 */
export function syncLeaveApplicationAfterCalendarDelete({ leaveApplicationId, personIdentifiers, dateStr }) {
  const leaveId = String(leaveApplicationId || '').trim()
  const d = String(dateStr || '').slice(0, 10)
  if (leaveId) {
    deleteLeaveApplication(leaveId)
    return { success: true, mode: 'deleted_application' }
  }
  if (!d) return { success: true, mode: 'skipped' }

  const matches = findApprovedLeaveApplicationsForPersonOnDate(personIdentifiers, d)
  if (matches.length === 0) return { success: true, mode: 'no_application' }

  matches.forEach((app) => {
    removeApprovedLeaveDate(app.id, d)
  })
  return { success: true, mode: 'removed_date', count: matches.length }
}

/** 管理員刪除請假申請（同時同步刪除到 Supabase leave_applications） */
export const deleteLeaveApplication = (id) => {
  try {
    const leaveId = String(id || '').trim()
    if (!leaveId) return { success: false, message: '缺少 id' }
    const list = getLeaveApplications()
    const next = (Array.isArray(list) ? list : []).filter((r) => String(r?.id || '').trim() !== leaveId)
    persistLeaveList(next)

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

/** 取得管理員指派的請假代填人帳號（僅此帳號可代他人送出請假） */
export const getLeaveFillerAccount = () => {
  try {
    const v = localStorage.getItem(LEAVE_FILLER_KEY)
    return v != null ? String(v).trim() : ''
  } catch (e) {
    return ''
  }
}

/** 管理員設定請假代填人帳號（寫入 Supabase 時需傳 JSON 字串，否則 _doUpsert 的 JSON.parse 會拋錯導致未寫入） */
export const setLeaveFillerAccount = (account) => {
  try {
    const val = account != null ? String(account).trim() : ''
    localStorage.setItem(LEAVE_FILLER_KEY, val)
    syncKeyToSupabase(LEAVE_FILLER_KEY, JSON.stringify(val))
    return { success: true }
  } catch (e) {
    console.error('setLeaveFillerAccount:', e)
    return { success: false, message: '儲存失敗' }
  }
}
