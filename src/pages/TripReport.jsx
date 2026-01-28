import { useState, useEffect } from 'react'
import { getCurrentUser } from '../utils/authStorage'
import { getUsers } from '../utils/storage'
import { getSchedules } from '../utils/scheduleStorage'
import { getTripReportsByProject, addTripReport, actionTypes } from '../utils/tripReportStorage'
import { getLeaderboardItems } from '../utils/leaderboardStorage'
import { getNameEffectStyle, getDecorationForNameEffect, getUserTitle, getTitleBadgeStyle } from '../utils/nameEffectUtils'

function TripReport() {
  const [currentUser, setCurrentUser] = useState('')
  const [userName, setUserName] = useState('')
  const [siteNames, setSiteNames] = useState([]) // 行事曆新建排程的案場名稱（siteName）不重複列表
  const [selectedSiteName, setSelectedSiteName] = useState('')
  const [records, setRecords] = useState([])
  const [message, setMessage] = useState(null)

  useEffect(() => {
    const user = getCurrentUser()
    setCurrentUser(user || '')
    if (user) {
      const u = getUsers().find((x) => x.account === user)
      setUserName(u ? u.name || user : user)
    }
    const list = getSchedules()
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const todaySchedules = list.filter((s) => (s.date || '') === todayStr)
    const names = [...new Set(todaySchedules.map((s) => (s.siteName || '').trim()).filter(Boolean))].sort()
    setSiteNames(names)
    setSelectedSiteName((prev) => (names.length && !prev ? names[0] : names.includes(prev) ? prev : ''))
  }, [])

  useEffect(() => {
    if (selectedSiteName) {
      setRecords(getTripReportsByProject(selectedSiteName))
    } else {
      setRecords([])
    }
  }, [selectedSiteName])

  const handleAction = (actionType) => {
    if (!currentUser) {
      setMessage({ type: 'error', text: '請先登入' })
      return
    }
    if (!selectedSiteName) {
      setMessage({ type: 'error', text: '請先選擇案場' })
      return
    }
    const result = addTripReport({
      projectId: selectedSiteName,
      projectName: selectedSiteName,
      actionType,
      userId: currentUser,
      userName: userName || currentUser
    })
    if (result.success) {
      setRecords(getTripReportsByProject(selectedSiteName))
      setMessage({ type: 'success', text: `已紀錄：${actionType}` })
    } else {
      setMessage({ type: 'error', text: result.message || '紀錄失敗' })
    }
  }

  // 判斷按鈕是否可點擊：必須按照順序 出發→抵達→休息→上工→收工→離場
  const isActionEnabled = (actionType) => {
    if (!currentUser || !selectedSiteName) return false
    if (records.length === 0) {
      // 沒有紀錄時，只能點「出發」
      return actionType === '出發'
    }
    // 取得最新一筆紀錄的類型（records 已按時間新到舊排序）
    const latestAction = records[0]?.actionType
    const order = ['出發', '抵達', '休息', '上工', '收工', '離場']
    const latestIndex = order.indexOf(latestAction)
    const actionIndex = order.indexOf(actionType)
    // 如果最新紀錄不在順序中，或已經到最後一步（離場），則禁用所有按鈕
    if (latestIndex === -1 || latestIndex === order.length - 1) {
      return false
    }
    // 只能點擊下一個順序的按鈕
    return actionIndex === latestIndex + 1
  }

  const formatTime = (iso) => {
    try {
      const d = new Date(iso)
      return d.toLocaleString('zh-TW', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })
    } catch (_) {
      return iso
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 w-full" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-yellow-400 mb-1">行程回報</h1>
          <p className="text-gray-400">選擇案場後，點擊按鈕紀錄出發／抵達／休息／上工／收工／離場</p>
        </div>

        {message && (
          <div
            className={`mb-4 px-4 py-3 rounded-lg ${
              message.type === 'success'
                ? 'bg-green-900/50 text-green-300 border border-green-600'
                : 'bg-red-900/50 text-red-300 border border-red-600'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* 案場選擇：僅顯示當日排程的案場，兌換商城風格卡片網格 */}
        <div className="mb-6">
          <label className="block text-gray-300 text-sm mb-3">案場（僅顯示今日排程）－ 點擊卡片選擇</label>
          {siteNames.length === 0 ? (
            <p className="text-gray-500 text-sm">今日尚無排程案場，請至「行事曆」為今日新建排程（活動／案場名稱）。</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {siteNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setSelectedSiteName(name)}
                  className={`text-left rounded-lg p-6 transition-colors border-2 ${
                    selectedSiteName === name
                      ? 'bg-yellow-900/30 border-yellow-400'
                      : 'bg-gray-800 border-gray-700 hover:border-yellow-400'
                  }`}
                >
                  <div className="text-center">
                    <h3 className="text-2xl sm:text-xl font-bold text-white mb-2 sm:mb-1">{name}</h3>
                    <p className="text-gray-400 text-base sm:text-sm">
                      {selectedSiteName === name ? '已選擇此案場' : '點擊選擇此案場'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 按鈕：出發、抵達、休息、上工、收工、離場（必須按順序點擊） */}
        <div className="mb-8 grid grid-cols-2 sm:flex sm:flex-wrap gap-3 sm:gap-3">
          {actionTypes.map((action) => {
            const enabled = isActionEnabled(action)
            return (
              <button
                key={action}
                type="button"
                onClick={() => handleAction(action)}
                disabled={!enabled}
                className={`px-6 py-4 sm:py-3 rounded-xl font-semibold transition-colors text-base sm:text-sm min-h-[52px] sm:min-h-0 ${
                  enabled
                    ? 'bg-yellow-500 text-gray-900 hover:bg-yellow-400'
                    : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                }`}
                title={!enabled && selectedSiteName ? '請按照順序點擊：出發→抵達→休息→上工→收工→離場' : ''}
              >
                {action}
              </button>
            )
          })}
        </div>

        {/* 案場名稱＋紀錄列表 */}
        {selectedSiteName && (
          <>
            <h2 className="text-xl font-bold text-yellow-400 mb-3">
              {selectedSiteName} － 行程紀錄
            </h2>
            <div className="bg-gray-800 border border-gray-600 rounded-xl overflow-hidden">
              {records.length === 0 ? (
                <div className="p-8 text-center text-gray-400">尚無紀錄，請點擊上方按鈕回報</div>
              ) : (() => {
                const leaderboardItems = getLeaderboardItems()
                return (
                <ul className="divide-y divide-gray-600">
                  {records.map((r) => {
                    const userId = r.userId || ''
                    const nameEffectStyle = getNameEffectStyle(userId, leaderboardItems)
                    const nameDeco = getDecorationForNameEffect(userId, leaderboardItems)
                    const userTitle = getUserTitle(userId)
                    const titleBadgeStyle = getTitleBadgeStyle(userId, leaderboardItems)
                    return (
                      <li key={r.id} className="px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
                        <span className="font-medium text-yellow-400">{r.actionType}</span>
                        <span className="text-gray-300 flex items-center gap-1 flex-wrap">
                          <span style={nameEffectStyle || { color: 'inherit' }}>{r.userName || r.userId}</span>
                          {nameDeco && <span className={nameDeco.className}>{nameDeco.emoji}</span>}
                          {userTitle && (
                            <span className="text-xs font-bold rounded" style={titleBadgeStyle}>{userTitle}</span>
                          )}
                        </span>
                        <span className="text-gray-500 text-sm">{formatTime(r.createdAt)}</span>
                      </li>
                    )
                  })}
                </ul>
                )
              })()}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default TripReport
