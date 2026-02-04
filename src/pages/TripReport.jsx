import { useState, useEffect, useRef } from 'react'
import { getCurrentUser, getCurrentUserRole } from '../utils/authStorage'
import { getSchedules } from '../utils/scheduleStorage'
import { getTripReportsByProject, addTripReport, actionTypes } from '../utils/tripReportStorage'
import { getLeaderboardItems } from '../utils/leaderboardStorage'
import { getNameEffectStyle, getDecorationForNameEffect, getUserTitle, getTitleBadgeStyle } from '../utils/nameEffectUtils'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { getDisplayNameForAccount } from '../utils/displayName'
import { getDisplayNamesForAccount } from '../utils/dropdownStorage'

function TripReport() {
  const pad2 = (n) => String(n).padStart(2, '0')
  const getTodayStr = () => {
    const today = new Date()
    return `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`
  }

  const [currentUser, setCurrentUser] = useState('')
  const [userName, setUserName] = useState('')
  const [siteNames, setSiteNames] = useState([]) // 行事曆新建排程的案場名稱（siteName）不重複列表
  const [allowedSiteNames, setAllowedSiteNames] = useState([]) // 非管理員：可操作（參與）的案場
  const [selectedSiteName, setSelectedSiteName] = useState('')
  const [records, setRecords] = useState([])
  const [message, setMessage] = useState(null)
  const selectedSiteNameRef = useRef('')

  const isLeaveSchedule = (s) => {
    const tag = String(s?.tag || '').trim()
    const siteName = String(s?.siteName || '').trim()
    return tag === 'leave' || /^請假(\s|[-—])/u.test(siteName) || siteName === '請假'
  }

  const buildSiteLists = (allSchedules, todayStr, userAccount, role) => {
    const list = Array.isArray(allSchedules) ? allSchedules : []
    // 行程回報只顯示「案場排程」，請假僅供行事曆查看狀態，不需回報
    const todaySchedules = list.filter((s) => (s.date || '') === todayStr).filter((s) => !isLeaveSchedule(s))
    const all = [...new Set(todaySchedules.map((s) => (s.siteName || '').trim()).filter(Boolean))].sort()
    // 管理員：全部可操作
    if (role === 'admin') return { all, allowed: all }
    // 一般用戶：僅能看自己在 participants 裡的案場
    const nameAliases = new Set(getDisplayNamesForAccount(userAccount || '').map((x) => String(x || '').trim()).filter(Boolean))
    const ok = new Set()
    todaySchedules.forEach((s) => {
      const site = String(s?.siteName || '').trim()
      if (!site) return
      const parts = String(s?.participants || '')
        .split(',')
        .map((p) => String(p || '').trim())
        .filter(Boolean)
      const isParticipant = parts.some((p) => nameAliases.has(p))
      if (isParticipant) ok.add(site)
    })
    return { all, allowed: Array.from(ok).sort() }
  }

  const refetchTripReport = () => {
    const user = getCurrentUser()
    const role = getCurrentUserRole()
    setCurrentUser(user || '')
    if (user) {
      setUserName(getDisplayNameForAccount(user))
    }
    const list = getSchedules()
    const todayStr = getTodayStr()
    const { all, allowed } = buildSiteLists(list, todayStr, user || '', role)
    setSiteNames(all)
    setAllowedSiteNames(allowed)
    const site = selectedSiteNameRef.current
    // 允許查看所有案場紀錄；但只允許對「自己參與」案場回報狀態
    if (site && all.includes(site)) setRecords(getTripReportsByProject(site, todayStr))
    else if (all.length > 0) {
      // 若原本選到的案場已不在今日清單，切回第一個案場（可查看）
      setSelectedSiteName(all[0])
      setRecords(getTripReportsByProject(all[0], todayStr))
    } else {
      setSelectedSiteName('')
      setRecords([])
    }
  }
  useRealtimeKeys(['jiameng_users', 'jiameng_engineering_schedules', 'jiameng_trip_reports', 'jiameng_leaderboard_items', 'jiameng_dropdown_options'], refetchTripReport)

  useEffect(() => {
    selectedSiteNameRef.current = selectedSiteName
  }, [selectedSiteName])

  useEffect(() => {
    const user = getCurrentUser()
    const role = getCurrentUserRole()
    setCurrentUser(user || '')
    if (user) {
      setUserName(getDisplayNameForAccount(user))
    }
    const list = getSchedules()
    const todayStr = getTodayStr()
    const { all, allowed } = buildSiteLists(list, todayStr, user || '', role)
    setSiteNames(all)
    setAllowedSiteNames(allowed)
    setSelectedSiteName((prev) => {
      if (prev && all.includes(prev)) return prev
      return all[0] || ''
    })
  }, [])

  useEffect(() => {
    if (selectedSiteName) {
      setRecords(getTripReportsByProject(selectedSiteName, getTodayStr()))
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
    // 防呆：請假不需回報
    if (/^請假(\s|[-—])/u.test(String(selectedSiteName || '').trim()) || String(selectedSiteName || '').trim() === '請假') {
      setMessage({ type: 'error', text: '請假不需要行程回報，請選擇案場。' })
      return
    }
    // 權限：非管理員只能回報自己參與的案場
    const role = getCurrentUserRole()
    if (role !== 'admin') {
      if (!allowedSiteNames.includes(selectedSiteName)) {
        setMessage({ type: 'error', text: '您不是此案場參與人員，無法回報其他組別的狀態。' })
        return
      }
    }
    const result = addTripReport({
      projectId: selectedSiteName,
      projectName: selectedSiteName,
      actionType,
      userId: currentUser,
      // 優先使用你綁定的顯示名稱
      userName: getDisplayNameForAccount(currentUser),
      // 用明確日期欄位，避免跨日/時區造成「同日卻看不到」
      ymd: getTodayStr()
    })
    if (result.success) {
      setRecords(getTripReportsByProject(selectedSiteName, getTodayStr()))
      setMessage({ type: 'success', text: result.message || `已紀錄：${actionType}` })
    } else {
      setMessage({ type: 'error', text: result.message || '紀錄失敗' })
    }
  }

  // 判斷按鈕是否可點擊：必須按照順序 出發→抵達→休息→上工→收工→離場
  const isActionEnabled = (actionType) => {
    if (!currentUser || !selectedSiteName) return false
    if (/^請假(\s|[-—])/u.test(String(selectedSiteName || '').trim()) || String(selectedSiteName || '').trim() === '請假') return false
    // 非管理員：只能對自己參與的案場操作
    const role = getCurrentUserRole()
    if (role !== 'admin' && !allowedSiteNames.includes(selectedSiteName)) return false
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
              {siteNames.map((name) => {
                const isAllowed = getCurrentUserRole() === 'admin' || allowedSiteNames.includes(name)
                return (
                <button
                  key={name}
                  type="button"
                  onClick={() => { setSelectedSiteName(name) }}
                  className={`text-left rounded-lg p-6 transition-colors border-2 ${
                    selectedSiteName === name
                      ? 'bg-yellow-900/30 border-yellow-400'
                      : isAllowed
                        ? 'bg-gray-800 border-gray-700 hover:border-yellow-400'
                        : 'bg-gray-800/40 border-gray-700 opacity-60 hover:border-gray-600'
                  }`}
                  title={!isAllowed ? '可查看此案場狀態，但無法回報（不是參與人員）' : ''}
                >
                  <div className="text-center">
                    <h3 className="text-2xl sm:text-xl font-bold text-white mb-2 sm:mb-1">{name}</h3>
                    <p className="text-gray-400 text-base sm:text-sm">
                      {selectedSiteName === name ? (isAllowed ? '已選擇此案場（可回報）' : '已選擇此案場（僅可查看）') : (isAllowed ? '點擊選擇此案場' : '點擊查看狀態（不可回報）')}
                    </p>
                  </div>
                </button>
                )
              })}
            </div>
          )}
          {getCurrentUserRole() !== 'admin' && siteNames.length > 0 && allowedSiteNames.length === 0 && (
            <p className="text-yellow-300 text-sm mt-3">你今天可以查看所有案場狀態，但目前你不在任何案場的參與人員名單中（participants），因此無法回報狀態。請管理員到行事曆把你加入該案場參與人員。</p>
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
                          <span style={nameEffectStyle || { color: 'inherit' }}>{getDisplayNameForAccount(r.userId || r.userName || '')}</span>
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
