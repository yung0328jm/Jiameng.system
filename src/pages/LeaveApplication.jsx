import { useState, useEffect } from 'react'
import { getCurrentUser, getCurrentUserRole } from '../utils/authStorage'
import { getUsers } from '../utils/storage'
import { isSupabaseEnabled as isAuthSupabase, getAllProfiles, getPublicProfiles } from '../utils/authSupabase'
import { getDisplayNameForAccount } from '../utils/displayName'
import {
  addLeaveApplication,
  getLeaveApplications,
  getPendingLeaveApplications,
  updateLeaveApplicationStatus,
  updateLeaveApplication,
  getLeaveApplicationById,
  getLeaveFillerAccount,
  setLeaveFillerAccount,
  deleteLeaveApplication
} from '../utils/leaveApplicationStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { saveSchedule, deleteSchedulesByLeaveApplicationId } from '../utils/scheduleStorage'
import { touchLastSeen } from '../utils/lastSeenStorage'
import {
  getSpecialLeaveQuota,
  getSpecialLeaveUsed,
  getSpecialLeaveRemaining,
  setSpecialLeaveQuota
} from '../utils/specialLeaveStorage'

function SpecialLeaveQuotaRow({ account, name, quota, used, onSave }) {
  const [val, setVal] = useState(String(quota))
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    setVal(String(quota))
  }, [quota])
  const handleSave = () => {
    const n = Math.max(0, Math.floor(Number(val) || 0))
    setVal(String(n))
    onSave(n)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 py-3 px-3 sm:py-2 bg-gray-800 border border-gray-600 rounded-lg">
      <span className="text-white flex-1 min-w-0 truncate text-sm sm:text-base">{name}</span>
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        <span className="text-gray-500 text-xs sm:text-sm shrink-0">已休 {used} 天</span>
        <input
          type="number"
          min={0}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={handleSave}
          className="w-14 sm:w-16 bg-gray-700 border border-gray-500 rounded px-2 py-2 sm:py-1.5 text-white text-base sm:text-sm text-right touch-manipulation"
        />
        <span className="text-gray-500 text-xs sm:text-sm shrink-0">可休天數</span>
        <button
          type="button"
          onClick={handleSave}
          className="min-h-[44px] min-w-[44px] px-4 py-2.5 sm:py-1.5 rounded bg-yellow-600 hover:bg-yellow-500 active:bg-yellow-500 text-gray-900 text-sm font-medium shrink-0 touch-manipulation"
        >
          {saved ? '已儲存' : '儲存'}
        </button>
      </div>
    </div>
  )
}

function LeaveApplication() {
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser() || '')
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState(() => getCurrentUserRole())
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState(null)
  const [applications, setApplications] = useState([])
  const [pendingList, setPendingList] = useState([])
  const [quotaUsers, setQuotaUsers] = useState([]) // 特休設定用／代填人可代填名單
  const [leaveFillerAccount, setLeaveFillerAccountState] = useState(() => getLeaveFillerAccount())
  const [applyForUserId, setApplyForUserId] = useState('') // 代填人：代誰請假
  const [editingLeaveId, setEditingLeaveId] = useState(null) // 管理員編輯請假紀錄
  const [editForm, setEditForm] = useState({ startDate: '', endDate: '', reason: '', status: 'pending' })

  const loadApplications = () => {
    setApplications(getLeaveApplications())
    setPendingList(getPendingLeaveApplications())
  }
  const loadFillerAccount = () => setLeaveFillerAccountState(getLeaveFillerAccount())

  useRealtimeKeys(['jiameng_leave_applications', 'jiameng_special_leave_quota', 'jiameng_leave_filler_account'], () => {
    loadApplications()
    loadFillerAccount()
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
    loadFillerAccount()
  }, [])

  // 代理人裝置可能晚於同步：每隔幾秒重讀代填人設定，讓表單在同步後能出現
  useEffect(() => {
    if (!currentUser || userRole === 'admin') return
    const t = setInterval(() => loadFillerAccount(), 3000)
    return () => clearInterval(t)
  }, [currentUser, userRole])

  // 使用者端：進入請假申請頁就視為「已查看自己的審核更新」
  useEffect(() => {
    if (!currentUser) return
    if (userRole === 'admin') return
    touchLastSeen(currentUser, 'leave')
  }, [currentUser, userRole])

  // 每次渲染都從 storage 讀取代填人，避免同步較晚時表單不顯示
  const fillerAccountFromStorage = getLeaveFillerAccount()
  const isFiller = !!(
    currentUser &&
    fillerAccountFromStorage &&
    String(currentUser).trim() === String(fillerAccountFromStorage).trim()
  )
  const needUserList = userRole === 'admin' || isFiller

  // 管理員：載入用戶（特休設定、指派代填人）；代填人：載入可代填的用戶列表
  // Supabase 時用 getPublicProfiles（所有已登入用戶可取得），代填人非管理員時 getAllProfiles 會回傳空
  useEffect(() => {
    if (!needUserList) {
      setQuotaUsers([])
      return
    }
    let cancelled = false
    if (isAuthSupabase()) {
      const fetchProfiles = userRole === 'admin' ? getAllProfiles() : getPublicProfiles()
      fetchProfiles.then((profiles) => {
        if (!cancelled && Array.isArray(profiles)) {
          const list = profiles
            .filter((p) => !p?.is_admin)
            .map((p) => ({
              account: p.account,
              name: p.display_name || p.account,
              role: 'user'
            }))
          setQuotaUsers(list)
        }
      }).catch(() => { if (!cancelled) setQuotaUsers([]) })
    } else {
      const users = (getUsers() || []).filter((u) => u?.role !== 'admin')
      setQuotaUsers(users.map((u) => ({ account: u.account, name: u.name || u.account, role: 'user' })))
    }
    return () => { cancelled = true }
  }, [userRole, needUserList])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!currentUser) {
      setMessage({ type: 'error', text: '請先登入' })
      return
    }
    const targetUserId = isFiller ? (applyForUserId || currentUser) : currentUser
    const targetUserName = isFiller
      ? (quotaUsers.find((u) => u.account === applyForUserId)?.name || applyForUserId || userName)
      : (userName || currentUser)
    if (isFiller && !applyForUserId) {
      setMessage({ type: 'error', text: '請選擇代誰請假' })
      return
    }
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
    const reasonTrim = reason.trim()
    const is特休Apply = (r) => (r || '').toString().includes('特休')
    if (is特休Apply(reasonTrim)) {
      let days = 0
      const cur = new Date(start)
      while (cur <= end) {
        days += 1
        cur.setDate(cur.getDate() + 1)
      }
      const remaining = getSpecialLeaveRemaining(targetUserId)
      if (days > remaining) {
        setMessage({
          type: 'error',
          text: `該員特休剩餘 ${remaining} 天，此區間為 ${days} 天，不足無法送出。請聯絡管理員調整可休天數。`
        })
        return
      }
    }
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
    setMessage({ type: 'success', text: '請假申請已送出，待管理員審核通過後將顯示於行事曆。' })
    setStartDate('')
    setEndDate('')
    setReason('')
    if (isFiller) setApplyForUserId('')
  }

  const writeLeaveToCalendar = (rec) => {
    const displayName = rec.userName || rec.userId || ''
    const siteNameSuffix = (rec.reason || '').trim() ? ` - ${(rec.reason || '').trim()}` : ''
    const siteName = `請假 - ${displayName}${siteNameSuffix}`
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

  const is特休 = (reason) => (reason || '').toString().trim().includes('特休')

  const countLeaveDays = (startDate, endDate) => {
    const start = new Date(startDate)
    const end = new Date(endDate)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0
    let n = 0
    const cur = new Date(start)
    while (cur <= end) {
      n += 1
      cur.setDate(cur.getDate() + 1)
    }
    return n
  }

  const handleApprove = (id) => {
    const rec = getLeaveApplicationById(id)
    if (!rec) {
      setMessage({ type: 'error', text: '找不到該申請' })
      return
    }
    if (is特休(rec.reason)) {
      const days = countLeaveDays(rec.startDate, rec.endDate)
      const remaining = getSpecialLeaveRemaining(rec.userId)
      if (days > remaining) {
        setMessage({
          type: 'error',
          text: `該員特休剩餘 ${remaining} 天，此申請為 ${days} 天，無法核准。請先為其調整可休天數。`
        })
        return
      }
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
    if (status === 'approved' && is特休(reason)) {
      const days = countLeaveDays(startDate, endDate)
      const remaining = getSpecialLeaveRemaining(rec.userId)
      if (days > remaining) {
        setMessage({ type: 'error', text: `該員特休剩餘 ${remaining} 天，此區間為 ${days} 天，無法核准。請先調整可休天數。` })
        return
      }
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
          <h1 className="text-2xl sm:text-3xl font-bold text-yellow-400 mb-1">請假申請</h1>
          <p className="text-gray-400 text-sm sm:text-base">
            {userRole === 'admin'
              ? '指派一位代填人代為填寫請假；審核通過後會顯示於行事曆。'
              : isFiller
                ? '您為代填人，可代他人送出請假申請，送出後由管理員審核。'
                : '您可在此查看自己的休假訊息、特休天數與今年請假紀錄。'}
          </p>
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

        {/* 管理員：指派代填人 */}
        {userRole === 'admin' && (
          <div className="mb-6 p-4 bg-gray-800 border border-gray-600 rounded-xl">
            <h2 className="text-lg font-bold text-yellow-400 mb-2">指派請假代填人</h2>
            <p className="text-gray-400 text-sm mb-3">僅被指派的帳號可代他人填寫請假申請；其他用戶僅能查看自己的休假與紀錄。</p>
            <select
              value={leaveFillerAccount}
              onChange={(e) => {
                const v = e.target.value
                setLeaveFillerAccount(v)
                setLeaveFillerAccountState(v)
              }}
              className="w-full bg-gray-700 border border-gray-500 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-yellow-400"
            >
              <option value="">（未指派）</option>
              {quotaUsers.map((u) => (
                <option key={u.account} value={u.account}>{u.name}（{u.account}）</option>
              ))}
            </select>
          </div>
        )}

        {/* 代填人：代他人請假表單 */}
        {isFiller && (
          <form onSubmit={handleSubmit} className="space-y-4 mb-6">
            <div>
              <label className="block text-gray-300 text-sm mb-1.5 sm:mb-2">代誰請假 <span className="text-red-400">*</span></label>
              <select
                value={applyForUserId}
                onChange={(e) => setApplyForUserId(e.target.value)}
                className="w-full bg-gray-700 border border-gray-500 rounded-lg px-4 py-3 sm:py-2 text-white text-base focus:outline-none focus:border-yellow-400 touch-manipulation"
                required
              >
                <option value="">請選擇人員</option>
                {quotaUsers.map((u) => (
                  <option key={u.account} value={u.account}>{u.name}（{u.account}）</option>
                ))}
              </select>
              {applyForUserId && (reason || '').toString().includes('特休') && (
                <p className="text-gray-400 text-xs mt-1">
                  該員特休剩餘 {getSpecialLeaveRemaining(applyForUserId)} 天
                </p>
              )}
            </div>
            <div>
              <label className="block text-gray-300 text-sm mb-1.5 sm:mb-2">請假起始日 <span className="text-red-400">*</span></label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-gray-700 border border-gray-500 rounded-lg px-4 py-3 sm:py-2 text-white text-base focus:outline-none focus:border-yellow-400 touch-manipulation"
                required
              />
            </div>
            <div>
              <label className="block text-gray-300 text-sm mb-1.5 sm:mb-2">請假結束日 <span className="text-red-400">*</span></label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-gray-700 border border-gray-500 rounded-lg px-4 py-3 sm:py-2 text-white text-base focus:outline-none focus:border-yellow-400 touch-manipulation"
                required
              />
            </div>
            <div>
              <label className="block text-gray-300 text-sm mb-1.5 sm:mb-2">事由（選填）</label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="例：事假、病假、特休"
                className="w-full bg-gray-700 border border-gray-500 rounded-lg px-4 py-3 sm:py-2 text-white text-base placeholder-gray-500 focus:outline-none focus:border-yellow-400 touch-manipulation"
              />
            </div>
            <button
              type="submit"
              disabled={!currentUser || !applyForUserId}
              className="w-full min-h-[48px] py-3.5 rounded-xl font-semibold bg-yellow-500 text-gray-900 hover:bg-yellow-400 active:bg-yellow-400 disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors text-base touch-manipulation"
            >
              送出請假申請（待管理員審核）
            </button>
          </form>
        )}

        {!currentUser && (
          <p className="mt-4 text-gray-500 text-sm">請先登入後再使用。</p>
        )}

        {/* 特休天數：可休 / 已休 / 剩餘（非管理員且非代理人時只看自己的） */}
        {currentUser && userRole !== 'admin' && !isFiller && (
          <div className="mt-4 sm:mt-6 p-4 bg-gray-800 border border-gray-600 rounded-xl">
            <h2 className="text-base sm:text-lg font-bold text-yellow-400 mb-3">特休</h2>
            <div className="grid grid-cols-3 gap-2 sm:gap-4 text-xs sm:text-sm">
              <div className="text-center sm:text-left">
                <span className="text-gray-500 block mb-0.5">可休天數</span>
                <span className="text-white font-medium">{getSpecialLeaveQuota(currentUser)} 天</span>
              </div>
              <div className="text-center sm:text-left">
                <span className="text-gray-500 block mb-0.5">已休天數</span>
                <span className="text-white font-medium">{getSpecialLeaveUsed(currentUser)} 天</span>
              </div>
              <div className="text-center sm:text-left">
                <span className="text-gray-500 block mb-0.5">剩餘天數</span>
                <span className="text-yellow-300 font-medium">{getSpecialLeaveRemaining(currentUser)} 天</span>
              </div>
            </div>
            <p className="text-gray-500 text-xs mt-2">事由填「特休」並經核准後，將自動計入已休天數。</p>
          </div>
        )}

        {/* 請假代理人：各用戶特休天數（僅供查看，無法變更） */}
        {isFiller && (
          <div className="mt-4 sm:mt-6">
            <h2 className="text-lg sm:text-xl font-bold text-yellow-400 mb-2 sm:mb-3">各用戶特休天數（僅供查看）</h2>
            <p className="text-gray-400 text-xs sm:text-sm mb-2 sm:mb-3">可查看代填名單內用戶的可休、已休、剩餘天數；僅管理員可修改。</p>
            <div className="space-y-2 max-h-48 overflow-y-auto overflow-x-hidden">
              {quotaUsers
                .filter((u) => u.role !== 'admin')
                .map((u) => (
                  <div
                    key={u.account}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-3 px-3 sm:py-2 bg-gray-800 border border-gray-600 rounded-lg"
                  >
                    <span className="text-white flex-1 min-w-0 truncate text-sm sm:text-base">{u.name || u.account}</span>
                    <div className="flex items-center gap-4 sm:gap-6 flex-wrap text-sm">
                      <span className="text-gray-400">可休 <span className="text-white font-medium">{getSpecialLeaveQuota(u.account)} 天</span></span>
                      <span className="text-gray-400">已休 <span className="text-white font-medium">{getSpecialLeaveUsed(u.account)} 天</span></span>
                      <span className="text-gray-400">剩餘 <span className="text-yellow-300 font-medium">{getSpecialLeaveRemaining(u.account)} 天</span></span>
                    </div>
                  </div>
                ))}
              {quotaUsers.filter((u) => u.role !== 'admin').length === 0 && (
                <p className="text-gray-500 text-sm">目前無可代填用戶。</p>
              )}
            </div>
          </div>
        )}

        {/* 管理員：特休天數設定 */}
        {userRole === 'admin' && (
          <div className="mt-4 sm:mt-6">
            <h2 className="text-lg sm:text-xl font-bold text-yellow-400 mb-2 sm:mb-3">特休天數設定</h2>
            <p className="text-gray-400 text-xs sm:text-sm mb-2 sm:mb-3">為各使用者設定特休可休天數；事由填「特休」之核准請假會自動從可休天數中扣除。</p>
            <div className="space-y-2 max-h-48 overflow-y-auto overflow-x-hidden">
              {quotaUsers
                .filter((u) => u.role !== 'admin')
                .map((u) => (
                  <SpecialLeaveQuotaRow
                    key={u.account}
                    account={u.account}
                    name={u.name || u.account}
                    quota={getSpecialLeaveQuota(u.account)}
                    used={getSpecialLeaveUsed(u.account)}
                    onSave={(v) => {
                      setSpecialLeaveQuota(u.account, v)
                      loadApplications()
                    }}
                  />
                ))}
              {quotaUsers.filter((u) => u.role !== 'admin').length === 0 && (
                <p className="text-gray-500 text-sm">目前無一般使用者。</p>
              )}
            </div>
          </div>
        )}

        {/* 管理員：待審核請假 */}
        {userRole === 'admin' && pendingList.length > 0 && (
          <div className="mt-6 sm:mt-8">
            <h2 className="text-lg sm:text-xl font-bold text-yellow-400 mb-2 sm:mb-3">待審核請假</h2>
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

        {/* 管理員：所有請假紀錄（含特休）可查看與修改 */}
        {userRole === 'admin' && (
          <div className="mt-6 sm:mt-8">
            <h2 className="text-lg sm:text-xl font-bold text-yellow-400 mb-2 sm:mb-3">所有請假紀錄</h2>
            <p className="text-gray-400 text-xs sm:text-sm mb-3">可查看每位用戶的請假與特休紀錄，並編輯日期、事由、狀態或刪除。</p>
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

        {/* 請假代理人：請假紀錄（僅供查看，無法編輯或刪除） */}
        {isFiller && (
          <div className="mt-6 sm:mt-8">
            <h2 className="text-lg sm:text-xl font-bold text-yellow-400 mb-2 sm:mb-3">請假紀錄（僅供查看）</h2>
            <p className="text-gray-400 text-xs sm:text-sm mb-3">可查看每位用戶的請假與特休紀錄；僅管理員可編輯或刪除。</p>
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
                  <label className="block text-gray-400 text-sm mb-1">事由</label>
                  <input
                    type="text"
                    value={editForm.reason}
                    onChange={(e) => setEditForm((f) => ({ ...f, reason: e.target.value }))}
                    placeholder="例：事假、病假、特休"
                    className="w-full bg-gray-700 border border-gray-500 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400"
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
            <h2 className="text-lg sm:text-xl font-bold text-yellow-400 mb-2 sm:mb-3">今年請假紀錄</h2>
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
