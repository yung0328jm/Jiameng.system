import { useState, useEffect } from 'react'
import { getUsers, updateUserRole, deleteUser } from '../utils/storage'
import { getCurrentUserRole, getCurrentUser } from '../utils/authStorage'
import { getUserPerformanceRecords, getUserLateRecords } from '../utils/performanceStorage'
import { getSchedules } from '../utils/scheduleStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { getRegistrationPassword, setRegistrationPassword } from '../utils/registrationPasswordStorage'

function UserManagement() {
  const [users, setUsers] = useState([])
  const [currentUserRole, setCurrentUserRole] = useState(null)
  const [currentUserAccount, setCurrentUserAccount] = useState(null)
  const [userPerformanceData, setUserPerformanceData] = useState({}) // 存儲每個用戶的績效數據
  const [dateRange, setDateRange] = useState('all') // 時間範圍：week, month, year, all
  const [registrationPassword, setRegistrationPasswordInput] = useState('')
  const [registrationPasswordMessage, setRegistrationPasswordMessage] = useState('')

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
  }, [users, dateRange])

  const loadUsers = () => {
    const allUsers = getUsers()
    setUsers(allUsers)
  }
  useRealtimeKeys(['jiameng_users'], loadUsers)

  const getDateRange = () => {
    const today = new Date()
    const endDate = today.toISOString().split('T')[0]
    let startDate

    switch (dateRange) {
      case 'week':
        const weekAgo = new Date(today)
        weekAgo.setDate(weekAgo.getDate() - 7)
        startDate = weekAgo.toISOString().split('T')[0]
        break
      case 'month':
        const monthAgo = new Date(today)
        monthAgo.setMonth(monthAgo.getMonth() - 1)
        startDate = monthAgo.toISOString().split('T')[0]
        break
      case 'year':
        const yearAgo = new Date(today)
        yearAgo.setFullYear(yearAgo.getFullYear() - 1)
        startDate = yearAgo.toISOString().split('T')[0]
        break
      default:
        startDate = null
    }
    return { startDate, endDate }
  }

  const calculateAllUsersPerformance = () => {
    const { startDate, endDate } = getDateRange()
    const performanceData = {}

    users.forEach(user => {
      const userName = user.account
      
      // 計算績效評分
      const performanceRecords = getUserPerformanceRecords(userName, startDate, endDate)
      let totalAdjustment = 0
      performanceRecords.forEach(record => {
        if (record.adjustment !== undefined && record.adjustment !== null) {
          totalAdjustment += parseFloat(record.adjustment) || 0
        }
      })
      const performanceScore = 100 + totalAdjustment

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

        if (schedule.participants) {
          const participants = schedule.participants.split(',').map(p => p.trim())
          if (participants.includes(userName)) {
            if (schedule.workItems && schedule.workItems.length > 0) {
              schedule.workItems.forEach(item => {
                if (item.responsiblePerson === userName) {
                  const target = parseFloat(item.targetQuantity) || 0
                  const actual = parseFloat(item.actualQuantity) || 0
                  const completionRate = target > 0 ? (actual / target * 100) : 0
                  
                  totalItems++
                  totalCompletionRate += completionRate
                  itemsWithRate++

                  if (completionRate >= 100) {
                    completedItems++
                  } else if (completionRate > 0) {
                    partialItems++
                  }
                }
              })
            }
          }
        }
      })

      const averageCompletionRate = itemsWithRate > 0 ? (totalCompletionRate / itemsWithRate) : 0

      // 計算遲到次數
      const lateRecords = getUserLateRecords(userName, startDate, endDate)
      const lateCount = lateRecords.length

      performanceData[userName] = {
        performanceScore,
        totalAdjustment,
        averageCompletionRate,
        totalWorkItems: totalItems,
        completedItems,
        partialItems,
        lateCount
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
    // 防止删除当前登录的用户
    if (account === currentUserAccount) {
      alert('無法刪除當前登錄的用戶')
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
                          <span className={`font-bold ${getPerformanceScoreColor(perfData.performanceScore || 100)}`}>
                            {perfData.performanceScore ? perfData.performanceScore.toFixed(0) : 100}
                          </span>
                          {perfData.totalAdjustment !== undefined && perfData.totalAdjustment !== 0 && (
                            <span className={`text-xs ${perfData.totalAdjustment >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              ({perfData.totalAdjustment >= 0 ? '+' : ''}{perfData.totalAdjustment.toFixed(1)})
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
