import { useState, useEffect } from 'react'
import { getUsers, updateUserRole, deleteUser } from '../utils/storage'
import { getCurrentUserRole, getCurrentUser, saveCurrentUser } from '../utils/authStorage'
import { getUserAttendanceRecords, getUserPerformanceRecords, getUserLateRecords } from '../utils/performanceStorage'
import { getSchedules } from '../utils/scheduleStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { getRegistrationPassword, setRegistrationPassword } from '../utils/registrationPasswordStorage'
import { isSupabaseEnabled as isAuthSupabase, getAllProfiles, setProfileAdmin } from '../utils/authSupabase'
import { getDisplayNamesForAccount } from '../utils/dropdownStorage'
import { calculateCompletionRateAdjustment } from '../utils/completionRateConfigStorage'
import { getLatePerformanceConfig, calculateLateCountAdjustment, calculateNoClockInAdjustment } from '../utils/latePerformanceConfigStorage'
import { normalizeWorkItem, getWorkItemCollaborators, getWorkItemTargetForName } from '../utils/workItemCollaboration'

function UserManagement() {
  const [users, setUsers] = useState([])
  const [currentUserRole, setCurrentUserRole] = useState(null)
  const [currentUserAccount, setCurrentUserAccount] = useState(null)
  const [userPerformanceData, setUserPerformanceData] = useState({}) // 存儲每個用戶的績效數據
  const [dateRange, setDateRange] = useState('all') // 時間範圍：week, month, year, all
  const [registrationPassword, setRegistrationPasswordInput] = useState('')
  const [registrationPasswordMessage, setRegistrationPasswordMessage] = useState('')
  const [perfRevision, setPerfRevision] = useState(0)

  useEffect(() => {
    const role = getCurrentUserRole()
    const account = getCurrentUser()
    setCurrentUserRole(role)
    setCurrentUserAccount(account)
    loadUsers()
    setRegistrationPasswordInput(getRegistrationPassword())
  }, [dateRange])

  useEffect(() => {
    if (users.length > 0) {
      calculateAllUsersPerformance()
    }
  }, [users, dateRange, perfRevision])

  const loadUsers = async () => {
    if (isAuthSupabase()) {
      const profiles = await getAllProfiles()
      setUsers(profiles.map((p) => ({
        id: p.id,
        account: p.account,
        name: p.display_name || p.account,
        role: p.is_admin ? 'admin' : 'user',
        createdAt: null
      })))
      return
    }
    setUsers(getUsers())
  }
  useRealtimeKeys(['jiameng_users'], () => { if (!isAuthSupabase()) loadUsers() })
  useRealtimeKeys(['jiameng_registration_password'], () => setRegistrationPasswordInput(getRegistrationPassword()))
  // 用戶管理的績效需要跟隨資料變動即時重算（否則可能顯示舊分數 100）
  useRealtimeKeys(
    ['jiameng_engineering_schedules', 'jiameng_personal_performance', 'jiameng_completion_rate_config', 'jiameng_late_performance_config', 'jiameng_dropdown_options'],
    () => setPerfRevision((v) => v + 1)
  )

  const getDateRange = () => {
    const today = new Date()
    const pad2 = (n) => String(n).padStart(2, '0')
    const formatLocalYMD = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    let endDate = formatLocalYMD(today)
    let startDate

    switch (dateRange) {
      case 'week':
        const weekAgo = new Date(today)
        weekAgo.setDate(weekAgo.getDate() - 7)
        startDate = formatLocalYMD(weekAgo)
        break
      case 'month':
        // 與「個人績效」一致：使用「當月」(月初～月底)，不是最近30天
        startDate = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-01`
        endDate = (() => {
          const y = today.getFullYear()
          const m = today.getMonth() + 1
          const lastDay = new Date(y, m, 0).getDate()
          return `${y}-${pad2(m)}-${pad2(lastDay)}`
        })()
        break
      case 'year':
        // 與「個人績效」一致：使用「當年」(1/1～12/31)，不是最近365天
        startDate = `${today.getFullYear()}-01-01`
        endDate = `${today.getFullYear()}-12-31`
        break
      default:
        // 全部：不限制起訖（避免「全部」其實只到今天，導致與個人績效不同步）
        startDate = null
        endDate = null
    }
    return { startDate, endDate }
  }

  const calculateAllUsersPerformance = () => {
    const { startDate, endDate } = getDateRange()
    const performanceData = {}
    const lateConfig = getLatePerformanceConfig()
    const normalizeYMD = (d) => String(d || '').slice(0, 10)
    const isWeekendYMD = (ymd) => {
      if (!ymd) return false
      const dd = new Date(`${ymd}T00:00:00`)
      if (Number.isNaN(dd.getTime())) return false
      const day = dd.getDay()
      return day === 0 || day === 6
    }

    users.forEach(user => {
      const userName = user.account
      const displayNames = getDisplayNamesForAccount(userName || '')
      
      // 計算績效評分
      const performanceRecords = getUserPerformanceRecords(userName, startDate, endDate)
      let totalAdjustment = 0
      performanceRecords.forEach(record => {
        if (record.adjustment !== undefined && record.adjustment !== null) {
          totalAdjustment += parseFloat(record.adjustment) || 0
        }
      })

      // 計算工作完成情況
      const schedules = getSchedules()
      let totalItems = 0
      let completedItems = 0
      let partialItems = 0
      let totalCompletionRate = 0
      let itemsWithRate = 0

      schedules.forEach(schedule => {
        if (startDate && schedule.date && schedule.date < startDate) return
        if (endDate && schedule.date && schedule.date > endDate) return

        if (!schedule.workItems || schedule.workItems.length === 0) return
        schedule.workItems.forEach(item => {
          const it = normalizeWorkItem(item)
          const collabs = it.isCollaborative
            ? getWorkItemCollaborators(it)
            : [{
              name: String(it.responsiblePerson || '').trim(),
              actualQuantity: it.actualQuantity ?? ''
            }].filter((c) => !!c.name)

          collabs.forEach((c) => {
            const resp = String(c?.name || '').trim()
            if (!resp) return
            if (!displayNames.includes(resp)) return

            const target = getWorkItemTargetForName(it, resp)
            const actual = parseFloat(c?.actualQuantity) || 0
            const completionRate = target > 0 ? (actual / target * 100) : 0
            totalItems++
            totalCompletionRate += completionRate
            itemsWithRate++

            if (completionRate >= 100) completedItems++
            else if (completionRate > 0) partialItems++
          })
        })
      })

      const averageCompletionRate = itemsWithRate > 0 ? (totalCompletionRate / itemsWithRate) : 0

      // 計算遲到次數
      const lateRecords = getUserLateRecords(userName, startDate, endDate)
      const lateCount = lateRecords.length

      // 計算未打卡次數（排除週末；同日若為請假則不算未打卡）
      const attendanceRecords = getUserAttendanceRecords(userName, startDate, endDate)
      const leaveDates = new Set()
      ;(attendanceRecords || []).forEach((r) => {
        const d = normalizeYMD(r?.date)
        const s = String(r?.details || '').trim()
        const isLeave = r?.type === 'leave' || s === '請假' || s === '特休' || s.includes('請假') || s.includes('特休')
        if (d && isLeave) leaveDates.add(d)
      })
      let noClockInCount = 0
      ;(attendanceRecords || []).forEach((r) => {
        const d = normalizeYMD(r?.date)
        if (!d) return
        if (isWeekendYMD(d)) return
        if (leaveDates.has(d)) return
        const isNoClockIn = r?.type === 'no-clockin' ||
          !r?.clockInTime ||
          r?.details === '缺少打卡時間' ||
          r?.details === '匯入檔案後無記錄' ||
          r?.details === '匯入檔案後無紀錄'
        if (isNoClockIn) noClockInCount++
      })

      // 將達成率/出勤扣分計入「實際績效」
      const completionRateAdjustment = averageCompletionRate > 0 ? calculateCompletionRateAdjustment(averageCompletionRate) : 0
      const lateAdjustment = lateConfig?.enabled ? calculateLateCountAdjustment(lateCount) : 0
      const noClockInAdjustment = lateConfig?.enabled ? calculateNoClockInAdjustment(noClockInCount) : 0
      const totalAdjustmentAll = totalAdjustment + completionRateAdjustment + lateAdjustment + noClockInAdjustment
      const performanceScore = 100 + totalAdjustmentAll
      const performanceScoreRounded = Math.round(performanceScore)

      performanceData[userName] = {
        performanceScore,
        performanceScoreRounded,
        totalAdjustment, // 管理者手動加減分
        totalAdjustmentAll, // 全部調整（含完成率/遲到/未打卡）
        averageCompletionRate,
        totalWorkItems: totalItems,
        completedItems,
        partialItems,
        lateCount,
        noClockInCount,
        completionRateAdjustment,
        lateAdjustment,
        noClockInAdjustment
      }
    })

    setUserPerformanceData(performanceData)
  }

  const handleRoleChange = (account, newRole) => {
    if (!window.confirm(`確定要將用戶 ${account} 的角色更改為 ${newRole === 'admin' ? '管理者' : '普通用戶'} 嗎？`)) {
      return
    }
    
    const result = updateUserRole(account, newRole)
    if (result.success) {
      loadUsers()
      alert('角色更新成功')
    } else {
      alert(result.message || '更新失敗')
    }
  }

  const handleDeleteUser = (account, name) => {
    if (account === currentUserAccount) {
      alert('無法刪除當前登錄的用戶')
      return
    }
    if (isAuthSupabase()) {
      alert('使用 Supabase 時請至 Supabase 後台：Authentication → Users 刪除該用戶。')
      return
    }
    if (!window.confirm(`確定要刪除用戶「${name || account}」(${account}) 嗎？\n此操作無法復原！`)) {
      return
    }
    const result = deleteUser(account)
    if (result.success) {
      loadUsers()
      alert('用戶刪除成功')
    } else {
      alert(result.message || '刪除失敗')
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return '未知'
    const date = new Date(dateString)
    return date.toLocaleString('zh-TW')
  }

  if (currentUserRole !== 'admin') {
    return (
      <div className="bg-charcoal rounded-lg p-6">
        <h2 className="text-2xl font-bold text-yellow-400 mb-4">用戶管理</h2>
        <div className="text-red-400 text-center py-12">
          <p className="text-lg mb-2">權限不足</p>
          <p className="text-sm">只有管理者可以查看此頁面</p>
        </div>
      </div>
    )
  }

  const getPerformanceScoreColor = (score) => {
    if (score >= 120) return 'text-green-400'
    if (score >= 100) return 'text-yellow-400'
    if (score >= 80) return 'text-orange-400'
    return 'text-red-400'
  }

  const getCompletionColor = (rate) => {
    if (rate >= 100) return 'text-green-400'
    if (rate >= 80) return 'text-yellow-400'
    if (rate >= 50) return 'text-orange-400'
    return 'text-red-400'
  }

  const handleSaveRegistrationPassword = () => {
    const result = setRegistrationPassword(registrationPassword)
    if (result.success) {
      setRegistrationPasswordMessage('註冊密碼已儲存。未設置時任何人可註冊；設置後註冊頁須輸入此密碼才能註冊。')
      setTimeout(() => setRegistrationPasswordMessage(''), 3000)
    } else {
      setRegistrationPasswordMessage(result.message || '儲存失敗')
    }
  }

  return (
    <div className="bg-charcoal rounded-lg p-4 sm:p-6 min-h-screen">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h2 className="text-2xl font-bold text-yellow-400">用戶管理</h2>
        <div className="flex flex-wrap items-end gap-4">
          {/* 註冊密碼設定（僅管理員） */}
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-gray-400 text-sm mb-1">註冊密碼</label>
              <input
                type="password"
                value={registrationPassword}
                onChange={(e) => { setRegistrationPasswordInput(e.target.value); setRegistrationPasswordMessage('') }}
                placeholder="留空＝不需密碼即可註冊"
                className="bg-gray-700 border border-gray-500 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400 w-48"
              />
            </div>
            <button
              type="button"
              onClick={handleSaveRegistrationPassword}
              className="bg-yellow-500 text-gray-900 font-semibold px-3 py-2 rounded text-sm hover:bg-yellow-400"
            >
              儲存
            </button>
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-2">時間範圍</label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white focus:outline-none focus:border-yellow-400"
            >
              <option value="week">本週</option>
              <option value="month">本月</option>
              <option value="year">本年</option>
              <option value="all">全部</option>
            </select>
          </div>
        </div>
      </div>
      {registrationPasswordMessage && (
        <div className={`mb-4 px-4 py-2 rounded text-sm ${registrationPasswordMessage.includes('已儲存') ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
          {registrationPasswordMessage}
        </div>
      )}
      
      {users.length === 0 ? (
        <div className="text-gray-400 text-center py-12">
          <p>目前尚無用戶</p>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    姓名
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    帳號
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    角色
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    績效評分
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    平均完成率
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    工作項目
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    遲到次數
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    註冊時間
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    角色管理
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-gray-800 divide-y divide-gray-700">
                {users.map((user) => {
                  const perfData = userPerformanceData[user.account] || {}
                  const scoreRounded = typeof perfData.performanceScoreRounded === 'number'
                    ? perfData.performanceScoreRounded
                    : (typeof perfData.performanceScore === 'number' ? Math.round(perfData.performanceScore) : 100)
                  const deltaRounded = scoreRounded - 100
                  return (
                    <tr key={user.id} className="hover:bg-gray-750">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {user.name || '未設定'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {user.account}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          user.role === 'admin'
                            ? 'bg-yellow-400 text-gray-800'
                            : 'bg-blue-500 text-white'
                        }`}>
                          {user.role === 'admin' ? '管理者' : '普通用戶'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-bold ${getPerformanceScoreColor(typeof scoreRounded === 'number' ? scoreRounded : 100)}`}
                            title={[
                              `管理者調整：${(perfData.totalAdjustment ?? 0).toFixed ? (perfData.totalAdjustment ?? 0).toFixed(1) : (perfData.totalAdjustment ?? 0)}`,
                              `達成率調整：${(perfData.completionRateAdjustment ?? 0).toFixed ? (perfData.completionRateAdjustment ?? 0).toFixed(1) : (perfData.completionRateAdjustment ?? 0)}`,
                              `遲到調整：${(perfData.lateAdjustment ?? 0).toFixed ? (perfData.lateAdjustment ?? 0).toFixed(1) : (perfData.lateAdjustment ?? 0)}`,
                              `未打卡調整：${(perfData.noClockInAdjustment ?? 0).toFixed ? (perfData.noClockInAdjustment ?? 0).toFixed(1) : (perfData.noClockInAdjustment ?? 0)}`,
                              `全部調整總和：${(perfData.totalAdjustmentAll ?? 0).toFixed ? (perfData.totalAdjustmentAll ?? 0).toFixed(1) : (perfData.totalAdjustmentAll ?? 0)}`,
                              `顯示用總分（四捨五入）：${scoreRounded}`
                            ].join('\n')}
                          >
                            {scoreRounded}
                          </span>
                          {deltaRounded !== 0 && (
                            <span className={`text-xs ${deltaRounded >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              ({deltaRounded >= 0 ? '+' : ''}{deltaRounded.toFixed(1)})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`font-semibold ${getCompletionColor(perfData.averageCompletionRate || 0)}`}>
                          {perfData.averageCompletionRate ? perfData.averageCompletionRate.toFixed(1) : 0}%
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        <div className="flex flex-col gap-1">
                          <span>總數: {perfData.totalWorkItems || 0}</span>
                          <div className="flex gap-2 text-xs">
                            <span className="text-green-400">完成: {perfData.completedItems || 0}</span>
                            <span className="text-yellow-400">部分: {perfData.partialItems || 0}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className="text-red-400 font-semibold">{perfData.lateCount || 0}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <select
                          value={user.role || 'user'}
                          onChange={(e) => handleRoleChange(user.account, e.target.value)}
                          className="bg-gray-700 border border-gray-500 rounded px-3 py-1 text-white text-sm focus:outline-none focus:border-yellow-400"
                        >
                          <option value="user">普通用戶</option>
                          <option value="admin">管理者</option>
                        </select>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => handleDeleteUser(user.account, user.name)}
                          disabled={user.account === currentUserAccount}
                          className={`px-4 py-2 rounded transition-colors text-sm ${
                            user.account === currentUserAccount
                              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                              : 'bg-red-500 hover:bg-red-600 text-white'
                          }`}
                          title={user.account === currentUserAccount ? '無法刪除當前登錄的用戶' : '刪除用戶'}
                        >
                          刪除
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default UserManagement
