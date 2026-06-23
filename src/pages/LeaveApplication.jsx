import { useState, useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { getCurrentUser, getCurrentUserRole } from '../utils/authStorage'
import { getUsers } from '../utils/storage'
import { getDisplayNameForAccount, resolveDisplayNameToAccount } from '../utils/displayName'
import { getDropdownOptionsByCategory } from '../utils/dropdownStorage'
import {
  addLeaveApplication,
  getLeaveApplications,
  getPendingLeaveApplications,
  updateLeaveApplicationStatus,
  updateLeaveApplication,
  getLeaveApplicationById,
  deleteLeaveApplication,
  getLeaveFillerAccount
} from '../utils/leaveApplicationStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'
import {
  saveSchedule,
  deleteSchedulesByLeaveApplicationId,
  deleteLeaveSchedulesForPersonOnDate
} from '../utils/scheduleStorage'
import { touchLastSeen } from '../utils/lastSeenStorage'
import {
  getNoLeaveDatesInRange,
  formatNoLeaveBlockedMessage,
  hasNoLeaveDateInRange,
  NO_LEAVE_DATES_KEY
} from '../utils/noLeaveDateStorage'

const DEFAULT_LEAVE_REASON = '當日不須申請入廠證及參加工具箱會議'
const LEAVE_CALENDAR_STATUS = '不需申請入廠證'

/** 可選異動人員（參與人員＋負責人，排除離職） */
function getSelectableMemberNames() {
  const users = getUsers() || []
  const resignedAccounts = new Set(
    users.filter((u) => u?.role === 'resigned').map((u) => String(u?.account || '').trim()).filter(Boolean)
  )
  const resignedNames = new Set(
    users.filter((u) => u?.role === 'resigned').map((u) => String(u?.name || '').trim()).filter(Boolean)
  )

  const seen = new Set()
  const out = []
  const add = (n) => {
    const t = String(n || '').trim()
    if (!t || seen.has(t) || resignedNames.has(t)) return
    const acc = resolveDisplayNameToAccount(t)
    if (acc && resignedAccounts.has(acc)) return
    seen.add(t)
    out.push(t)
  }
  ;(getDropdownOptionsByCategory('participants') || []).forEach((opt) => add(opt?.value))
  ;(getDropdownOptionsByCategory('responsible_persons') || []).forEach((opt) => add(opt?.value))
  out.sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  return out
}

function LeaveApplication() {
  const location = useLocation()
  const calendarDate =
    typeof location.state?.date === 'string' && location.state.date ? location.state.date : ''
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser() || '')
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState(() => getCurrentUserRole())
  const [startDate, setStartDate] = useState(calendarDate)
  const [endDate, setEndDate] = useState(calendarDate)
  const [reason, setReason] = useState(DEFAULT_LEAVE_REASON)
  const [message, setMessage] = useState(null)
  const [applications, setApplications] = useState([])
  const [pendingList, setPendingList] = useState([])
  const [showApplyForm, setShowApplyForm] = useState(!!calendarDate)
  const [applyForName, setApplyForName] = useState('')
  const [memberNames, setMemberNames] = useState([])
  const [editingLeaveId, setEditingLeaveId] = useState(null) // 管理員編輯請假紀錄
  const [editForm, setEditForm] = useState({ startDate: '', endDate: '', reason: '', status: 'pending' })
  const [noLeaveRevision, setNoLeaveRevision] = useState(0)

  const blockedDatesPreview = useMemo(() => {
    if (!startDate || !endDate) return []
    return getNoLeaveDatesInRange(startDate, endDate)
  }, [startDate, endDate, noLeaveRevision])

  const selfDisplayName = useMemo(() => {
    if (!currentUser) return ''
    const u = getUsers().find((x) => x.account === currentUser)
    if (u?.name) return u.name
    return getDisplayNameForAccount(currentUser) || currentUser
  }, [currentUser, userName])

  const canApplyForOthers = useMemo(() => {
    if (!currentUser) return false
    if (userRole === 'admin') return true
    const filler = getLeaveFillerAccount()
    return filler && filler === currentUser
  }, [currentUser, userRole])

  const loadApplications = () => {
    setApplications(getLeaveApplications())
    setPendingList(getPendingLeaveApplications())
  }
  useRealtimeKeys(['jiameng_leave_applications', 'jiameng_leave_filler_account', 'jiameng_dropdown_options', NO_LEAVE_DATES_KEY], () => {
    loadApplications()
    setMemberNames(getSelectableMemberNames())
    setNoLeaveRevision((r) => r + 1)
  })

  useEffect(() => {
    const user = getCurrentUser()
    const role = getCurrentUserRole()
    setCurrentUser(user || '')
    setUserRole(role)
    if (user) {
      const u = getUsers().find((x) => x.account === user)
      const name = u ? u.name || user : user
      setUserName(name)
      setApplyForName(name)
    }
    setMemberNames(getSelectableMemberNames())
    loadApplications()
  }, [])

  useEffect(() => {
    if (selfDisplayName && !applyForName) setApplyForName(selfDisplayName)
  }, [selfDisplayName, applyForName])

  // 使用者端：進入請假申請頁就視為「已查看自己的審核更新」
  useEffect(() => {
    if (!currentUser) return
    if (userRole === 'admin') return
    touchLastSeen(currentUser, 'leave')
  }, [currentUser, userRole])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!currentUser) {
      setMessage({ type: 'error', text: '請先登入' })
      return
    }
    const targetUserName = (canApplyForOthers ? applyForName : selfDisplayName || userName || currentUser).trim()
    if (!targetUserName) {
      setMessage({ type: 'error', text: '請選擇異動人員' })
      return
    }
    const targetUserId = resolveDisplayNameToAccount(targetUserName) || targetUserName
    const isProxy = targetUserName !== (selfDisplayName || userName || currentUser)
    if (!startDate || !endDate) {
      setMessage({ type: 'error', text: '請填寫請假起始日與結束日' })
      return
    }
    const start = new Date(startDate)
    const end = new Date(endDate)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setMessage({ type: 'error', text: '日期格式錯誤' })
      return
    }
    if (start > end) {
      setMessage({ type: 'error', text: '結束日不得早於起始日' })
      return
    }
    if (hasNoLeaveDateInRange(startDate, endDate)) {
      setMessage({ type: 'error', text: formatNoLeaveBlockedMessage(startDate, endDate) })
      return
    }
    const reasonTrim = reason.trim() || DEFAULT_LEAVE_REASON
    const result = addLeaveApplication({
      userId: targetUserId,
      userName: targetUserName,
      startDate,
      endDate,
      reason: reasonTrim,
      submittedBy: isProxy ? currentUser : ''
    })
    if (!result.success) {
      setMessage({ type: 'error', text: result.message || '申請失敗' })
      return
    }
    loadApplications()
    setMessage({
      type: 'success',
      text: isProxy
        ? `已代「${targetUserName}」送出異動申請，待管理員審核通過後將顯示於行事曆。`
        : '異動申請已送出，待管理員審核通過後將顯示於行事曆。'
    })
    setStartDate('')
    setEndDate('')
    setReason(DEFAULT_LEAVE_REASON)
    setApplyForName(selfDisplayName || userName || currentUser)
    setShowApplyForm(false)
  }

  const writeLeaveToCalendar = (rec) => {
    const displayName = rec.userName || rec.userId || ''
    const siteName = `${displayName} - ${LEAVE_CALENDAR_STATUS}`
    const personKeys = [displayName, rec.userId, rec.userName].filter(Boolean)

    deleteSchedulesByLeaveApplicationId(rec.id)

    const start = new Date(rec.startDate)
    const end = new Date(rec.endDate)
    let count = 0
    const cur = new Date(start)
    while (cur <= end) {
      const dateStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
      deleteLeaveSchedulesForPersonOnDate(dateStr, personKeys)
      const saveResult = saveSchedule({
        siteName,
        date: dateStr,
        tag: 'leave',
        isAllDay: true,
        isLeave: true,
        leaveApplicationId: rec.id
      })
      if (saveResult.success) count++
      cur.setDate(cur.getDate() + 1)
    }
    return count
  }

  const handleApprove = (id) => {
    const rec = getLeaveApplicationById(id)
    if (!rec) {
      setMessage({ type: 'error', text: '找不到該申請' })
      return
    }
    const updateResult = updateLeaveApplicationStatus(id, 'approved', currentUser)
    if (!updateResult.success) {
      setMessage({ type: 'error', text: updateResult.message || '更新失敗' })
      return
    }
    deleteSchedulesByLeaveApplicationId(id)
    const count = writeLeaveToCalendar(rec)
    loadApplications()
    setMessage({ type: 'success', text: `已核准請假，已寫入行事曆 ${count} 天。` })
  }

  const handleReject = (id) => {
    const updateResult = updateLeaveApplicationStatus(id, 'rejected', currentUser)
    if (!updateResult.success) {
      setMessage({ type: 'error', text: updateResult.message || '更新失敗' })
      return
    }
    loadApplications()
    setMessage({ type: 'success', text: '已駁回該請假申請。' })
  }

  const openEditLeave = (rec) => {
    setEditingLeaveId(rec.id)
    setEditForm({
      startDate: rec.startDate || '',
      endDate: rec.endDate || '',
      reason: rec.reason || '',
      status: rec.status || 'pending'
    })
  }

  const handleSaveLeaveEdit = () => {
    if (!editingLeaveId) return
    const rec = getLeaveApplicationById(editingLeaveId)
    if (!rec) {
      setMessage({ type: 'error', text: '找不到該筆紀錄' })
      return
    }
    const { startDate, endDate, reason, status } = editForm
    if (!startDate || !endDate) {
      setMessage({ type: 'error', text: '請填寫起始日與結束日' })
      return
    }
    const start = new Date(startDate)
    const end = new Date(endDate)
    if (start > end) {
      setMessage({ type: 'error', text: '結束日不得早於起始日' })
      return
    }
    const updateResult = updateLeaveApplication(editingLeaveId, {
      startDate,
      endDate,
      reason,
      status,
      approvedBy: currentUser
    })
    if (!updateResult.success) {
      setMessage({ type: 'error', text: updateResult.message || '更新失敗' })
      return
    }
    const updatedRec = updateResult.record
    const wasApproved = (rec.status || '') === 'approved'
    const nowApproved = (status || '') === 'approved'
    if (wasApproved) deleteSchedulesByLeaveApplicationId(editingLeaveId)
    if (nowApproved) writeLeaveToCalendar(updatedRec)
    setEditingLeaveId(null)
    loadApplications()
    setMessage({ type: 'success', text: '已儲存請假紀錄。' })
  }

  const handleDeleteLeave = (id) => {
    if (!window.confirm('確定要刪除此請假紀錄嗎？將同時移除行事曆上對應的請假天數。')) return
    deleteSchedulesByLeaveApplicationId(id)
    const delResult = deleteLeaveApplication(id)
    if (!delResult.success) {
      setMessage({ type: 'error', text: delResult.message || '刪除失敗' })
      return
    }
    if (editingLeaveId === id) setEditingLeaveId(null)
    loadApplications()
    setMessage({ type: 'success', text: '已刪除請假紀錄。' })
  }

  return (
    <div
      className="min-h-screen bg-gray-900 text-white px-4 py-4 sm:p-6 w-full"
      style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="max-w-xl mx-auto w-full">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-yellow-400 mb-1">入廠人員異動申請</h1>
        </div>

        {message && (
          <div
            className={`mb-4 px-4 py-3 rounded-lg text-sm sm:text-base ${
              message.type === 'success'
                ? 'bg-green-900/50 text-green-300 border border-green-600'
                : 'bg-red-900/50 text-red-300 border border-red-600'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* 本人申請異動（填假單） */}
        {currentUser && (
          <div className="mb-6">
            {!showApplyForm ? (
              <button
                type="button"
                onClick={() => {
                  setReason(DEFAULT_LEAVE_REASON)
                  setApplyForName(selfDisplayName || userName || currentUser)
                  setMemberNames(getSelectableMemberNames())
                  setShowApplyForm(true)
                }}
                className="w-full min-h-[48px] py-3.5 rounded-xl font-semibold bg-yellow-500 text-gray-900 hover:bg-yellow-400 active:bg-yellow-400 transition-colors text-base touch-manipulation"
              >
                申請異動
              </button>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-gray-800 border border-gray-600 rounded-xl">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-bold text-yellow-400">填寫異動單</h2>
                  <button
                    type="button"
                    onClick={() => setShowApplyForm(false)}
                    className="text-gray-400 hover:text-white text-sm shrink-0"
                  >
                    取消
                  </button>
                </div>
                {canApplyForOthers ? (
                  <div>
                    <label className="block text-gray-300 text-sm mb-1.5 sm:mb-2">
                      異動人員 <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={applyForName}
                      onChange={(e) => setApplyForName(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-500 rounded-lg px-4 py-3 sm:py-2 text-white text-base focus:outline-none focus:border-yellow-400 touch-manipulation"
                      required
                    >
                      <option value="">— 請選擇 —</option>
                      {(() => {
                        const names = [...memberNames]
                        const self = selfDisplayName || userName || currentUser
                        if (self && !names.includes(self)) names.unshift(self)
                        return names.map((n) => (
                          <option key={n} value={n}>
                            {n}
                            {n === self ? '（本人）' : ''}
                          </option>
                        ))
                      })()}
                    </select>
                    <p className="text-gray-500 text-xs mt-1">
                      送件人：{selfDisplayName || userName || currentUser}
                      {applyForName && applyForName !== (selfDisplayName || userName) && (
                        <span className="text-amber-200/90"> · 代「{applyForName}」申請</span>
                      )}
                    </p>
                  </div>
                ) : (
                  <p className="text-gray-400 text-xs">異動人員：{selfDisplayName || userName || currentUser}</p>
                )}
                <div>
                  <label className="block text-gray-300 text-sm mb-1.5 sm:mb-2">起始日 <span className="text-red-400">*</span></label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-500 rounded-lg px-4 py-3 sm:py-2 text-white text-base focus:outline-none focus:border-yellow-400 touch-manipulation"
                    required
                  />
                </div>
                <div>
                  <label className="block text-gray-300 text-sm mb-1.5 sm:mb-2">結束日 <span className="text-red-400">*</span></label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-500 rounded-lg px-4 py-3 sm:py-2 text-white text-base focus:outline-none focus:border-yellow-400 touch-manipulation"
                    required
                  />
                </div>
                {blockedDatesPreview.length > 0 && (
                  <p className="text-rose-300 text-xs sm:text-sm bg-rose-950/40 border border-rose-700/50 rounded-lg px-3 py-2">
                    {formatNoLeaveBlockedMessage(startDate, endDate)}
                  </p>
                )}
                <div>
                  <label className="block text-gray-300 text-sm mb-1.5 sm:mb-2">備註</label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-500 rounded-lg px-4 py-3 sm:py-2 text-white text-base focus:outline-none focus:border-yellow-400 touch-manipulation"
                  />
                </div>
                <button
                  type="submit"
                  disabled={blockedDatesPreview.length > 0}
                  className="w-full min-h-[48px] py-3.5 rounded-xl font-semibold bg-yellow-500 text-gray-900 hover:bg-yellow-400 active:bg-yellow-400 transition-colors text-base touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  申報
                </button>
              </form>
            )}
          </div>
        )}

        {!currentUser && (
          <p className="mt-4 text-gray-500 text-sm">請先登入後再使用。</p>
        )}

        {/* 管理員：待審核異動 */}
        {userRole === 'admin' && pendingList.length > 0 && (
          <div className="mt-6 sm:mt-8">
            <h2 className="text-lg sm:text-xl font-bold text-yellow-400 mb-2 sm:mb-3">待審核異動</h2>
            <div className="space-y-3">
              {pendingList.map((r) => (
                <div
                  key={r.id}
                  className="bg-gray-800 border border-gray-600 rounded-lg p-3 sm:p-4 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3"
                >
                  <div className="text-xs sm:text-sm min-w-0 flex-1">
                    <span className="font-semibold text-white block sm:inline">{getDisplayNameForAccount(r.userId || r.userName || '')}</span>
                    <span className="text-gray-400 hidden sm:inline mx-2">｜</span>
                    <span className="text-gray-300 block sm:inline mt-0.5 sm:mt-0">{r.startDate} ~ {r.endDate}</span>
                    {r.reason && <span className="text-gray-500 block sm:inline sm:ml-2 mt-0.5 sm:mt-0">（{r.reason}）</span>}
                    {r.submittedBy && r.submittedBy !== r.userId && (
                      <span className="text-amber-200/80 block sm:inline sm:ml-2 mt-0.5 sm:mt-0 text-[11px]">
                        代填：{getDisplayNameForAccount(r.submittedBy)}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleApprove(r.id)}
                      className="flex-1 sm:flex-none min-h-[44px] min-w-[44px] px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 active:bg-green-500 text-white font-medium text-sm touch-manipulation"
                    >
                      核准
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReject(r.id)}
                      className="flex-1 sm:flex-none min-h-[44px] min-w-[44px] px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 active:bg-red-500 text-white font-medium text-sm touch-manipulation"
                    >
                      駁回
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 管理員：所有異動紀錄可查看與修改 */}
        {userRole === 'admin' && (
          <div className="mt-6 sm:mt-8">
            <h2 className="text-lg sm:text-xl font-bold text-yellow-400 mb-2 sm:mb-3">所有異動紀錄</h2>
            <p className="text-gray-400 text-xs sm:text-sm mb-3">可查看每位用戶的異動紀錄，並編輯日期、備註、狀態或刪除。</p>
            <div className="space-y-2 max-h-96 overflow-y-auto overflow-x-hidden -mr-1 pr-1">
              {[...applications]
                .sort((a, b) => (b.startDate || b.createdAt || '').localeCompare(a.startDate || a.createdAt || ''))
                .map((r) => (
                  <div
                    key={r.id}
                    className="bg-gray-800 border border-gray-600 rounded-lg p-3 sm:p-4 flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-2 min-h-[44px]"
                  >
                    <div className="text-xs sm:text-sm min-w-0 flex-1">
                      <span className="font-semibold text-white">{getDisplayNameForAccount(r.userId || r.userName || '')}</span>
                      <span className="text-gray-400 mx-2">｜</span>
                      <span className="text-gray-300">{r.startDate} ~ {r.endDate}</span>
                      {r.reason && <span className="text-gray-500 sm:ml-2">（{r.reason}）</span>}
                      {r.submittedBy && r.submittedBy !== r.userId && (
                        <span className="text-amber-200/70 block sm:inline sm:ml-2 text-[11px]">
                          代填：{getDisplayNameForAccount(r.submittedBy)}
                        </span>
                      )}
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded text-xs font-medium shrink-0 ${
                        (r.status || 'pending') === 'approved'
                          ? 'bg-green-900/50 text-green-300'
                          : (r.status || 'pending') === 'rejected'
                            ? 'bg-red-900/50 text-red-300'
                            : 'bg-yellow-900/50 text-yellow-300'
                      }`}
                    >
                      {(r.status || 'pending') === 'approved' ? '已核准' : (r.status || 'pending') === 'rejected' ? '已駁回' : '待審核'}
                    </span>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditLeave(r)}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-gray-600 hover:bg-gray-500 text-white text-sm touch-manipulation"
                      >
                        編輯
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteLeave(r.id)}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm touch-manipulation"
                      >
                        刪除
                      </button>
                    </div>
                  </div>
                ))}
              {applications.length === 0 && (
                <p className="text-gray-500 text-sm py-4">尚無請假紀錄。</p>
              )}
            </div>
          </div>
        )}

        {/* 編輯請假紀錄 Modal（管理員） */}
        {userRole === 'admin' && editingLeaveId && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-gray-800 border border-gray-600 rounded-xl p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-bold text-yellow-400 mb-4">編輯請假紀錄</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-gray-400 text-sm mb-1">起始日</label>
                  <input
                    type="date"
                    value={editForm.startDate}
                    onChange={(e) => setEditForm((f) => ({ ...f, startDate: e.target.value }))}
                    className="w-full bg-gray-700 border border-gray-500 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-1">結束日</label>
                  <input
                    type="date"
                    value={editForm.endDate}
                    onChange={(e) => setEditForm((f) => ({ ...f, endDate: e.target.value }))}
                    className="w-full bg-gray-700 border border-gray-500 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-1">備註</label>
                  <input
                    type="text"
                    value={editForm.reason}
                    onChange={(e) => setEditForm((f) => ({ ...f, reason: e.target.value }))}
                    className="w-full bg-gray-700 border border-gray-500 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-1">狀態</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full bg-gray-700 border border-gray-500 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                  >
                    <option value="pending">待審核</option>
                    <option value="approved">已核准</option>
                    <option value="rejected">已駁回</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  onClick={handleSaveLeaveEdit}
                  className="flex-1 min-h-[44px] py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-semibold text-sm touch-manipulation"
                >
                  儲存
                </button>
                <button
                  type="button"
                  onClick={() => setEditingLeaveId(null)}
                  className="flex-1 min-h-[44px] py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-white font-semibold text-sm touch-manipulation"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 今年請假紀錄（自己的） */}
        {currentUser && (() => {
          const currentYear = new Date().getFullYear()
          const selfKeys = new Set(
            [currentUser, selfDisplayName, userName, resolveDisplayNameToAccount(selfDisplayName || userName)]
              .map((v) => String(v || '').trim())
              .filter(Boolean)
          )
          const myRecords = applications
            .filter((a) => {
              const keys = [a.userId, a.userName, resolveDisplayNameToAccount(a.userName || a.userId)]
                .map((v) => String(v || '').trim())
                .filter(Boolean)
              return keys.some((k) => selfKeys.has(k))
            })
            .filter((a) => {
              const y = a.startDate ? new Date(a.startDate).getFullYear() : (a.createdAt ? new Date(a.createdAt).getFullYear() : 0)
              return y === currentYear
            })
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
          return myRecords.length > 0 ? (
          <div className="mt-6 sm:mt-8">
            <h2 className="text-lg sm:text-xl font-bold text-yellow-400 mb-2 sm:mb-3">今年異動紀錄</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto overflow-x-hidden -mr-1 pr-1">
              {myRecords.map((r) => (
                  <div
                    key={r.id}
                    className="bg-gray-800 border border-gray-600 rounded-lg p-3 text-xs sm:text-sm flex flex-wrap items-center justify-between gap-2 min-h-[44px]"
                  >
                    <span className="text-gray-300">{r.startDate} ~ {r.endDate}</span>
                    {r.reason && <span className="text-gray-500">（{r.reason}）</span>}
                    <span
                      className={`px-2.5 py-1 rounded text-xs font-medium shrink-0 ${
                        (r.status || 'pending') === 'approved'
                          ? 'bg-green-900/50 text-green-300'
                          : (r.status || 'pending') === 'rejected'
                            ? 'bg-red-900/50 text-red-300'
                            : 'bg-yellow-900/50 text-yellow-300'
                      }`}
                    >
                      {(r.status || 'pending') === 'approved' ? '已核准' : (r.status || 'pending') === 'rejected' ? '已駁回' : '待審核'}
                    </span>
                  </div>
                ))}
            </div>
          </div>
          ) : null
        })()}
      </div>
    </div>
  )
}

export default LeaveApplication
