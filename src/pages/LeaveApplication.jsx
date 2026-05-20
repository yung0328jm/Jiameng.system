import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { getCurrentUser, getCurrentUserRole } from '../utils/authStorage'
import { getUsers } from '../utils/storage'
import { getDisplayNameForAccount } from '../utils/displayName'
import {
  addLeaveApplication,
  getLeaveApplications,
  getPendingLeaveApplications,
  updateLeaveApplicationStatus,
  updateLeaveApplication,
  getLeaveApplicationById,
  deleteLeaveApplication
} from '../utils/leaveApplicationStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { saveSchedule, deleteSchedulesByLeaveApplicationId } from '../utils/scheduleStorage'
import { touchLastSeen } from '../utils/lastSeenStorage'

const DEFAULT_LEAVE_REASON = '當日不須申請入廠證及參加工具箱會議'
const LEAVE_CALENDAR_STATUS = '不需申請入廠證'

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
  const [editingLeaveId, setEditingLeaveId] = useState(null) // 管理員編輯請假紀錄
  const [editForm, setEditForm] = useState({ startDate: '', endDate: '', reason: '', status: 'pending' })

  const loadApplications = () => {
    setApplications(getLeaveApplications())
    setPendingList(getPendingLeaveApplications())
  }
  useRealtimeKeys(['jiameng_leave_applications'], () => {
    loadApplications()
  })

  useEffect(() => {
    const user = getCurrentUser()
    const role = getCurrentUserRole()
    setCurrentUser(user || '')
    setUserRole(role)
    if (user) {
      const u = getUsers().find((x) => x.account === user)
      setUserName(u ? u.name || user : user)
    }
    loadApplications()
  }, [])

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
    const targetUserId = currentUser
    const targetUserName = userName || currentUser
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
    const reasonTrim = reason.trim() || DEFAULT_LEAVE_REASON
    const result = addLeaveApplication({
      userId: targetUserId,
      userName: targetUserName,
      startDate,
      endDate,
      reason: reasonTrim
    })
    if (!result.success) {
      setMessage({ type: 'error', text: result.message || '申請失敗' })
      return
    }
    loadApplications()
    setMessage({ type: 'success', text: '異動申請已送出，待管理員審核通過後將顯示於行事曆。' })
    setStartDate('')
    setEndDate('')
    setReason(DEFAULT_LEAVE_REASON)
    setShowApplyForm(false)
  }

  const writeLeaveToCalendar = (rec) => {
    const displayName = rec.userName || rec.userId || ''
    const siteName = `${displayName} - ${LEAVE_CALENDAR_STATUS}`
    const start = new Date(rec.startDate)
    const end = new Date(rec.endDate)
    let count = 0
    const cur = new Date(start)
    while (cur <= end) {
      const dateStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
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
                <p className="text-gray-400 text-xs">申請人：{userName || currentUser}</p>
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
                  className="w-full min-h-[48px] py-3.5 rounded-xl font-semibold bg-yellow-500 text-gray-900 hover:bg-yellow-400 active:bg-yellow-400 transition-colors text-base touch-manipulation"
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
          const myRecords = applications
            .filter((a) => a.userId === currentUser)
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
