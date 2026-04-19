import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import Home from './Home'
import Calendar from './Calendar'
import VehicleInfo from './VehicleInfo'
import Memo from './Memo'
import CompanyActivities from './CompanyActivities'
import DropdownManagement from './DropdownManagement'
import UserManagement from './UserManagement'
import PersonalPerformance from './PersonalPerformance'
import MonthlyLocationReport from './MonthlyLocationReport'
import ExchangeShop from './ExchangeShop'
import Exchange from './Exchange'
import MyBackpack from './MyBackpack'
import CheckIn from './CheckIn'
import DailyTodo from './DailyTodo'
import LeaveApplication from './LeaveApplication'
import Advance from './Advance'
import Messages from './Messages'
import MiniGames from './MiniGames'
import CompensatoryLeave from './CompensatoryLeave'
import ErrorBoundary from '../components/ErrorBoundary'
import {
  HomeIcon,
  CalendarIcon,
  ChatIcon,
  MailIcon,
  DocumentIcon,
  PeopleIcon,
  GearIcon,
  AlertIcon,
  PerformanceIcon,
  ShopIcon,
  BackpackIcon,
  ExchangeIcon,
  CheckInIcon,
  LeaveIcon,
  AdvanceIcon,
  GameIcon,
  PersonalServiceIcon,
  CompensatoryLeaveIcon
} from '../components/ChineseIcons'

const ProjectDeficiencyTracking = lazy(() => import('./ProjectDeficiencyTracking'))
import { getCurrentUserRole, getCurrentUser } from '../utils/authStorage'
import { getWalletBalance, addWalletBalance, getAllWallets, getUserTransactions, addTransaction } from '../utils/walletStorage'
import { getUsers, getPendingAdvances, getAdvancesByAccount } from '../utils/storage'
import { useRealtimeKeys, useSync } from '../contexts/SyncContext'
import { getUserInventory, addItemToInventory } from '../utils/inventoryStorage'
import { getPendingExchangeRequests, approveExchangeRequest, rejectExchangeRequest, deleteExchangeRequest } from '../utils/exchangeRequestStorage'
import { refreshAppDataKeyFromSupabase } from '../utils/supabaseSync'
import { removeItemFromInventory } from '../utils/inventoryStorage'
import { getItems } from '../utils/itemStorage'
import { isSupabaseEnabled as isAuthSupabase, getPublicProfiles } from '../utils/authSupabase'
import { getAdminUnreadCount, getUserMessages } from '../utils/messageStorage'
import { getPendingLeaveApplications, getLeaveApplications } from '../utils/leaveApplicationStorage'
import { getPendingOvertimeApplications } from '../utils/overtimeApplicationStorage'
import { getAnnouncements } from '../utils/announcementStorage'
import { getGlobalMessages } from '../utils/memoStorage'
import { getLastSeen, touchLastSeen } from '../utils/lastSeenStorage'
import { maybeShowMessageNotification } from '../utils/browserNotification'
import { getCompanyActivities, getPendingActivitiesCount } from '../utils/companyActivityStorage'
import { getDailyTodoUnreadCount } from '../utils/todoStorage'

function Dashboard({ onLogout, activeTab: initialTab }) {
  const { refreshFromCloud } = useSync()
  const [cloudSyncing, setCloudSyncing] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const [activeTab, setActiveTab] = useState(initialTab || getTabFromPath(location.pathname))
  const [userRole, setUserRole] = useState(() => getCurrentUserRole())
  const [currentUser, setCurrentUser] = useState('')
  const [walletBalance, setWalletBalance] = useState(0)
  const [showWalletModal, setShowWalletModal] = useState(false)
  const [showDistributionModal, setShowDistributionModal] = useState(false)
  const [distributionForm, setDistributionForm] = useState({
    username: '',
    amount: 0
  })
  const [allUsers, setAllUsers] = useState([])
  const [backpackItemCount, setBackpackItemCount] = useState(0)
  const [showExchangeRequestModal, setShowExchangeRequestModal] = useState(false)
  const [pendingExchangeRequests, setPendingExchangeRequests] = useState([])
  const [showItemDistributionModal, setShowItemDistributionModal] = useState(false)
  const [itemDistributionForm, setItemDistributionForm] = useState({
    username: '',
    itemId: '',
    quantity: 1
  })

  const ALL_USERS_VALUE = '__ALL_USERS__'
  const getAllRecipientAccounts = () => {
    const list = Array.isArray(allUsers) ? allUsers : []
    return list
      .filter((u) => {
        const acc = String(u?.account || '').trim()
        if (!acc) return false
        if (acc === 'admin' || acc === 'jiameng.system') return false
        if (u?.role === 'admin' || u?.is_admin) return false
        return true
      })
      .map((u) => String(u.account).trim())
  }
  const [availableItems, setAvailableItems] = useState([])
  const [showTopMenu, setShowTopMenu] = useState(false) // 手機版「更多」選單
  const topMenuButtonRef = useRef(null)
  const [topMenuPosition, setTopMenuPosition] = useState({ top: 0, right: 0 })
  const [showPersonalServiceMenu, setShowPersonalServiceMenu] = useState(false)
  const personalServiceButtonRef = useRef(null)
  const [personalServiceMenuPosition, setPersonalServiceMenuPosition] = useState({ top: 0, left: 0 })
  const [navBadges, setNavBadges] = useState({ memo: 0, messages: 0, leave: 0, advance: 0, activities: 0, overtime: 0, dailyTodo: 0 })
  const prevMessagesBadgeRef = useRef(0)

  const calcNavBadges = (me, role) => {
    const account = String(me || '').trim()
    const r = String(role || '').trim()

    // 站內信
    let messagesBadge = 0
    if (r === 'admin') {
      messagesBadge = getAdminUnreadCount()
    } else if (account) {
      const lastSeen = getLastSeen(account, 'messages')
      const lastTs = Date.parse(lastSeen || '') || 0
      const threads = getUserMessages(account)
      messagesBadge = threads.filter((m) => {
        // 管理員發給指定用戶或全體：以訊息建立時間為準
        if (m?.type === 'admin_to_user') {
          return (Date.parse(m?.createdAt || '') || 0) > lastTs
        }
        // 用戶發給我的：以訊息建立時間為準（我發給別人的不算未讀）
        if (m?.type === 'user_to_user') {
          if (String(m?.to || '').trim() !== account) return false
          return (Date.parse(m?.createdAt || '') || 0) > lastTs
        }
        // 我發給管理員的對話：看管理員回覆是否在 lastSeen 之後
        const replies = Array.isArray(m?.replies) ? m.replies : []
        const lastReplyTs = replies.reduce((mx, rep) => {
          const t = Date.parse(rep?.createdAt || '') || 0
          return t > mx ? t : mx
        }, 0)
        return lastReplyTs > lastTs
      }).length
    }

    // 請假申請
    let leaveBadge = 0
    let overtimePendingBadge = 0
    if (r === 'admin') {
      leaveBadge = getPendingLeaveApplications().length
      overtimePendingBadge = getPendingOvertimeApplications().length
    } else if (account) {
      const lastSeen = getLastSeen(account, 'leave')
      const lastTs = Date.parse(lastSeen || '') || 0
      const mine = (getLeaveApplications() || []).filter((x) => String(x?.userId || '').trim() === account)
      // 使用者端：看「審核結果更新」是否有新（approvedAt 最準；沒有則用 createdAt）
      leaveBadge = mine.filter((x) => {
        const status = String(x?.status || 'pending')
        if (status === 'pending') return false
        const t = Date.parse(x?.approvedAt || x?.createdAt || '') || 0
        return t > lastTs
      }).length
    }

    // 預支
    let advanceBadge = 0
    if (r === 'admin') {
      advanceBadge = (getPendingAdvances() || []).length
    } else if (account) {
      const lastSeen = getLastSeen(account, 'advance')
      const lastTs = Date.parse(lastSeen || '') || 0
      const mine = getAdvancesByAccount(account) || []
      // 使用者端：有「審核結果」且更新時間在 lastSeen 之後的筆數
      advanceBadge = mine.filter((x) => {
        const status = String(x?.status || 'pending')
        if (status === 'pending') return false
        const t = Date.parse(x?.transferredAt || x?.reviewedAt || x?.createdAt || '') || 0
        return t > lastTs
      }).length
    }

    // 交流區：公佈欄更新 + 對話框有人發話
    let memoBadge = 0
    if (account) {
      const lastSeenAnn = getLastSeen(account, 'memo_announcements')
      const lastTsAnn = Date.parse(lastSeenAnn || '') || 0
      const anns = getAnnouncements() || []
      const annUnread = anns.filter((a) => {
        const t = Date.parse(a?.createdAt || '') || 0
        if (!(t > lastTsAnn)) return false
        return String(a?.createdBy || '').trim() !== account
      }).length
      const lastSeenChat = getLastSeen(account, 'memo_chat')
      const lastTsChat = Date.parse(lastSeenChat || '') || 0
      let chatUnread = 0
      try {
        const chatMsgs = getGlobalMessages() || []
        chatUnread = chatMsgs.filter((m) => {
          const t = Date.parse(m?.createdAt || '') || 0
          if (!(t > lastTsChat)) return false
          return String(m?.author || '').trim() !== account
        }).length
      } catch (_) { /* getGlobalMessages 可能尚未有資料 */ }
      memoBadge = annUnread + chatUnread
    }

    // 公司活動：有新增或更新時顯示未讀；一般用戶只計已審核通過的
    let activitiesBadge = 0
    if (account) {
      const lastSeenActivities = getLastSeen(account, 'company_activities')
      const lastTsActivities = Date.parse(lastSeenActivities || '') || 0
      const list = r === 'admin' ? getCompanyActivities() : getCompanyActivities().filter((a) => (a.approvalStatus ?? 'approved') === 'approved')
      const newOrUpdated = list.filter((a) => {
        const created = Date.parse(a?.createdAt || '') || 0
        const updated = Date.parse(a?.updatedAt || '') || 0
        const t = Math.max(created, updated)
        return t > lastTsActivities
      })
      activitiesBadge = newOrUpdated.length
      // 管理員：未讀數至少為待審核數量（即使剛看過，待審核仍要提醒）
      if (r === 'admin') {
        const pending = getPendingActivitiesCount()
        if (pending > activitiesBadge) activitiesBadge = pending
      }
    }

    const dailyTodoBadge = account ? getDailyTodoUnreadCount(account) : 0
    return { memo: memoBadge, messages: messagesBadge, leave: leaveBadge, advance: advanceBadge, activities: activitiesBadge, overtime: overtimePendingBadge, dailyTodo: dailyTodoBadge }
  }

  const loadAllUsersForAdmin = async () => {
    const me = String(getCurrentUser() || '').trim()
    try {
      // Supabase 模式：用公開 profiles 清單（避免只剩舊 local users 的系統帳號）
      if (typeof isAuthSupabase === 'function' && isAuthSupabase()) {
        const profiles = await getPublicProfiles()
        const list = (Array.isArray(profiles) ? profiles : [])
          .filter((p) => {
            const acc = String(p?.account || '').trim()
            if (!acc) return false
            // 仍排除系統帳號；但允許「管理員自己」出現在下拉選單，方便發給自己
            if (acc === 'admin' && acc !== me) return false
            if (acc === 'jiameng.system') return false
            // 仍排除其他管理員，避免誤發；但允許自己
            if (p?.is_admin && acc !== me) return false
            return true
          })
          .map((p) => ({
            account: p.account,
            name: p.display_name || p.account,
            role: p.is_admin ? 'admin' : 'user'
          }))
        setAllUsers(list)
        return
      }
    } catch (e) {
      console.warn('loadAllUsersForAdmin: getPublicProfiles failed', e)
    }

    // 非 Supabase：沿用 local users，但排除系統帳號/管理者
    const users = (getUsers() || []).filter((u) => {
      const acc = String(u?.account || '').trim()
      if (!acc) return false
      if (acc === 'admin' && acc !== me) return false
      if (acc === 'jiameng.system') return false
      if (u?.role === 'admin' && acc !== me) return false
      return true
    })
    setAllUsers(users)
  }

  useEffect(() => {
    const role = getCurrentUserRole()
    const user = getCurrentUser()
    setUserRole(role)
    setCurrentUser(user || '')
    if (user) {
      const balance = getWalletBalance(user)
      setWalletBalance(balance)
    }
    if (role === 'admin') {
      loadAllUsersForAdmin()
      // 載入所有可用道具
      const items = getItems()
      setAvailableItems(items)
    }
    
    // 載入背包道具數量
    if (user) {
      updateBackpackCount(user)
    }
  }, [])
  
  // 更新背包道具數量
  const updateBackpackCount = (username) => {
    const inventory = getUserInventory(username)
    const totalCount = inventory.reduce((sum, item) => sum + (item.quantity || 0), 0)
    setBackpackItemCount(totalCount)
  }
  
  // 定期更新背包道具數量
  useEffect(() => {
    if (currentUser) {
      const interval = setInterval(() => {
        updateBackpackCount(currentUser)
      }, 2000)
      return () => clearInterval(interval)
    }
  }, [currentUser])

  // 定期更新錢包餘額
  useEffect(() => {
    if (currentUser) {
      const interval = setInterval(() => {
        const balance = getWalletBalance(currentUser)
        setWalletBalance(balance)
      }, 2000)
      return () => clearInterval(interval)
    }
  }, [currentUser])

  // 載入待處理的兌換請求（管理員）
  useEffect(() => {
    if (userRole === 'admin') {
      loadPendingExchangeRequests()
      const interval = setInterval(() => {
        loadPendingExchangeRequests()
      }, 3000)
      return () => clearInterval(interval)
    }
  }, [userRole])

  const loadPendingExchangeRequests = () => {
    const requests = getPendingExchangeRequests()
    setPendingExchangeRequests(requests)
  }

  // 管理員開啟兌換請求 Modal 時，先從雲端拉取最新列表再顯示（避免漏接 Realtime 時看不到部分用戶的請求）
  useEffect(() => {
    if (showExchangeRequestModal && userRole === 'admin') {
      refreshAppDataKeyFromSupabase('jiameng_exchange_requests').then(() => loadPendingExchangeRequests())
    }
  }, [showExchangeRequestModal, userRole])

  // 即時同步：錢包、用戶、道具、兌換請求變更時重讀，不需登出再登入
  const refetchDashboard = () => {
    const user = getCurrentUser()
    const role = getCurrentUserRole()
    if (user) {
      setWalletBalance(getWalletBalance(user))
      updateBackpackCount(user)
    }
    if (role === 'admin') {
      loadAllUsersForAdmin()
      setAvailableItems(getItems())
      loadPendingExchangeRequests()
    }
    const next = calcNavBadges(user, role)
    if (role !== 'admin') {
      maybeShowMessageNotification(prevMessagesBadgeRef.current, next.messages)
    }
    prevMessagesBadgeRef.current = next.messages
    setNavBadges(next)
  }
  useRealtimeKeys(
    [
      'jiameng_wallets', 'jiameng_transactions', 'jiameng_users', 'jiameng_inventories', 'jiameng_items', 'jiameng_exchange_requests',
      'jiameng_messages', 'jiameng_leave_applications', 'jiameng_overtime_applications', 'jiameng_advances', 'jiameng_announcements', 'jiameng_memos', 'jiameng_last_seen_v1', 'jiameng_todos',
      'jiameng_company_activities'
    ],
    refetchDashboard
  )

  const handleCloudSync = async () => {
    if (cloudSyncing) return
    setCloudSyncing(true)
    try {
      const r = await refreshFromCloud()
      if (!r?.ok) {
        window.alert('從雲端同步失敗，請稍後再試或檢查網路。')
        return
      }
      // 先寫入 localStorage 再整頁重新載入，等同 F5，確保所有元件與記憶體狀態皆重建
      window.location.reload()
    } finally {
      setCloudSyncing(false)
    }
  }

  // 初始計算一次徽章（避免等到 realtime 才出現）
  useEffect(() => {
    const user = getCurrentUser()
    const role = getCurrentUserRole()
    const next = calcNavBadges(user, role)
    prevMessagesBadgeRef.current = next.messages
    setNavBadges(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 定期＋回到頁面時重算徽章，讓管理員回覆後用戶端能在「個人服務」看到未讀
  useEffect(() => {
    const recalc = () => {
      const user = getCurrentUser()
      const role = getCurrentUserRole()
      const next = calcNavBadges(user, role)
      if (role !== 'admin') {
        maybeShowMessageNotification(prevMessagesBadgeRef.current, next.messages)
      }
      prevMessagesBadgeRef.current = next.messages
      setNavBadges(next)
    }
    const t = setInterval(recalc, 20000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') recalc()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])

  // 切換分頁時立即重算徽章（例如從交流區切到其他頁時，交流區未讀要即時顯示）
  const pathname = location?.pathname || ''
  useEffect(() => {
    const user = getCurrentUser()
    const role = getCurrentUserRole()
    const next = calcNavBadges(user, role)
    prevMessagesBadgeRef.current = next.messages
    setNavBadges(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  const handleApproveExchange = (requestId) => {
    if (!window.confirm('確定要確認此兌換請求嗎？確認後道具將從用戶背包中移除。')) {
      return
    }

    const request = pendingExchangeRequests.find(r => r.id === requestId)
    if (!request) {
      alert('請求不存在')
      return
    }

    // 從用戶背包移除道具
    const removeResult = removeItemFromInventory(request.username, request.itemId, request.quantity || 1)
    if (!removeResult.success) {
      alert('移除道具失敗：' + removeResult.message)
      return
    }

    // 確認請求
    const approveResult = approveExchangeRequest(requestId, currentUser)
    if (approveResult.success) {
      alert('已確認兌換請求，道具已從用戶背包中移除')
      loadPendingExchangeRequests()
      // 更新背包數量顯示
      if (request.username === currentUser) {
        updateBackpackCount(currentUser)
      }
    } else {
      alert(approveResult.message || '確認請求失敗')
      // 如果確認失敗，恢復道具
      removeItemFromInventory(request.username, request.itemId, -(request.quantity || 1))
    }
  }

  const handleRejectExchange = (requestId) => {
    const reason = window.prompt('請輸入拒絕原因（可選）：')
    const rejectResult = rejectExchangeRequest(requestId, currentUser, reason || '')
    if (rejectResult.success) {
      alert('已拒絕兌換請求')
      loadPendingExchangeRequests()
    } else {
      alert(rejectResult.message || '拒絕請求失敗')
    }
  }

  const handleDistributeCoins = () => {
    if (!distributionForm.username) {
      alert('請選擇用戶')
      return
    }
    if (distributionForm.amount <= 0) {
      alert('金額必須大於0')
      return
    }

    // 全體分發
    if (distributionForm.username === ALL_USERS_VALUE) {
      const recipients = getAllRecipientAccounts()
      if (recipients.length === 0) {
        alert('沒有可分發的用戶（已排除管理員/系統帳號）')
        return
      }
      if (!window.confirm(`確定要分發 ${distributionForm.amount} 佳盟幣給所有用戶嗎？\n共 ${recipients.length} 人。`)) return

      let ok = 0
      let fail = 0
      recipients.forEach((acc) => {
        const r = addWalletBalance(acc, distributionForm.amount)
        if (r?.success) {
          ok += 1
          addTransaction({
            type: 'distribution',
            from: 'admin',
            to: acc,
            amount: distributionForm.amount,
            description: `管理員全體分配佳盟幣`
          })
        } else {
          fail += 1
        }
      })
      alert(`全體分發完成：成功 ${ok} 人，失敗 ${fail} 人。`)
      setDistributionForm({ username: '', amount: 0 })
      setShowDistributionModal(false)
      setWalletBalance(getWalletBalance(currentUser))
      return
    }

    // 單一用戶分發
    const result = addWalletBalance(distributionForm.username, distributionForm.amount)
    if (result.success) {
      // 記錄轉賬
      addTransaction({
        type: 'distribution',
        from: 'admin',
        to: distributionForm.username,
        amount: distributionForm.amount,
        description: `管理員分配佳盟幣`
      })
      alert(`已成功分配 ${distributionForm.amount} 佳盟幣給 ${distributionForm.username}`)
      setDistributionForm({ username: '', amount: 0 })
      setShowDistributionModal(false)
      // 如果是當前用戶，更新餘額顯示
      if (distributionForm.username === currentUser) {
        setWalletBalance(getWalletBalance(currentUser))
      }
    } else {
      alert(result.message || '分配失敗')
    }
  }

  const handleDistributeItem = () => {
    if (!itemDistributionForm.username) {
      alert('請選擇用戶')
      return
    }
    if (!itemDistributionForm.itemId) {
      alert('請選擇道具')
      return
    }
    if (itemDistributionForm.quantity <= 0) {
      alert('數量必須大於0')
      return
    }

    // 全體分發
    if (itemDistributionForm.username === ALL_USERS_VALUE) {
      const recipients = getAllRecipientAccounts()
      if (recipients.length === 0) {
        alert('沒有可分發的用戶（已排除管理員/系統帳號）')
        return
      }
      const selectedItem = availableItems.find(item => item.id === itemDistributionForm.itemId)
      const itemName = selectedItem ? selectedItem.name : '道具'
      if (!window.confirm(`確定要分發 ${itemDistributionForm.quantity} 個「${itemName}」給所有用戶嗎？\n共 ${recipients.length} 人。`)) return

      let ok = 0
      let fail = 0
      recipients.forEach((acc) => {
        const r = addItemToInventory(acc, itemDistributionForm.itemId, itemDistributionForm.quantity)
        if (r?.success) ok += 1
        else fail += 1
      })
      alert(`全體分發完成：成功 ${ok} 人，失敗 ${fail} 人。`)
      setItemDistributionForm({ username: '', itemId: '', quantity: 1 })
      setShowItemDistributionModal(false)
      updateBackpackCount(currentUser)
      return
    }

    const result = addItemToInventory(
      itemDistributionForm.username,
      itemDistributionForm.itemId,
      itemDistributionForm.quantity
    )

    if (result.success) {
      const selectedItem = availableItems.find(item => item.id === itemDistributionForm.itemId)
      const itemName = selectedItem ? selectedItem.name : '道具'
      alert(`已成功分配 ${itemDistributionForm.quantity} 個${itemName}給 ${itemDistributionForm.username}`)
      setItemDistributionForm({ username: '', itemId: '', quantity: 1 })
      setShowItemDistributionModal(false)
      // 如果是當前用戶，更新背包數量顯示
      if (itemDistributionForm.username === currentUser) {
        updateBackpackCount(currentUser)
      }
    } else {
      alert(result.message || '分配道具失敗')
    }
  }

  function getTabFromPath(path) {
    if (path.includes('calendar')) return 'calendar'
    if (path.includes('vehicle-info')) return 'vehicle'
    if (path.includes('memo')) return 'memo'
    if (path.includes('company-activities')) return 'activities'
    if (path.includes('dropdown-management')) return 'management'
    if (path.includes('user-management')) return 'user-management'
    if (path.includes('project-deficiency')) return 'deficiency'
    if (path.includes('personal-performance')) return 'performance'
    if (path.includes('monthly-location-report')) return 'monthly-report'
    if (path.includes('exchange-shop')) return 'exchange-shop'
    if (path.includes('exchange')) return 'exchange'
    if (path.includes('my-backpack')) return 'my-backpack'
    if (path.includes('check-in')) return 'check-in'
    if (path.includes('daily-todo')) return 'daily-todo'
    if (path.includes('leave-application')) return 'leave-application'
    if (path.includes('advance')) return 'advance'
    if (path.includes('compensatory-leave')) return 'compensatory-leave'
    if (path.includes('messages')) return 'messages'
    if (path.includes('developing') || path.includes('mini-games')) return 'developing'
    return 'home'
  }

  const handleTabClick = (tab, path) => {
    setActiveTab(tab)
    navigate(path)
    // 點進頁面時：立即標記已讀（僅影響「使用者端 lastSeen」，管理員待審/未讀是狀態制）
    const me = String(getCurrentUser() || '').trim()
    const role = getCurrentUserRole()
    if (me) {
      if (role !== 'admin') {
        if (tab === 'messages') touchLastSeen(me, 'messages')
        if (tab === 'leave-application') touchLastSeen(me, 'leave')
        if (tab === 'advance') touchLastSeen(me, 'advance')
        if (tab === 'daily-todo') touchLastSeen(me, 'daily_todo')
        if (tab === 'memo') {
          touchLastSeen(me, 'memo_announcements')
          touchLastSeen(me, 'memo_chat')
        }
      }
      if (tab === 'activities') touchLastSeen(me, 'company_activities')
      const next = calcNavBadges(me, role)
      prevMessagesBadgeRef.current = next.messages
      setNavBadges(next)
    }
  }

  // 依目前分頁回傳標題（上方導覽列中央顯示用）
  const getTabTitle = (tab) => {
    const titles = {
      home: '首頁',
      calendar: '行事曆',
      messages: '站內信',
      deficiency: '專案管理',
      vehicle: '車輛資訊',
      memo: '交流區',
      activities: '公司活動',
      management: '下拉選單管理',
      performance: '個人績效',
      'monthly-report': '整月去處報表',
      'exchange-shop': '兌換商城',
      exchange: '交易所',
      'my-backpack': '我的背包',
      'check-in': '每日簽到',
      'daily-todo': '溫馨提醒',
      'leave-application': '請假申請',
      'advance': '預支',
      'user-management': '用戶管理',
      'developing': '開發中',
      'compensatory-leave': '補休系統'
    }
    return titles[tab] || '佳盟事業群'
  }

  // 目前日期時間字串（參考圖格式：2026.1.28 下午 3:10），切換分頁時會更新
  const [dateTimeStr, setDateTimeStr] = useState(() => {
    const n = new Date()
    return `${n.getFullYear()}.${n.getMonth() + 1}.${n.getDate()} ${n.getHours() >= 12 ? '下午' : '上午'} ${n.getHours() % 12 || 12}:${String(n.getMinutes()).padStart(2, '0')}`
  })
  useEffect(() => {
    const tick = () => {
      const n = new Date()
      setDateTimeStr(`${n.getFullYear()}.${n.getMonth() + 1}.${n.getDate()} ${n.getHours() >= 12 ? '下午' : '上午'} ${n.getHours() % 12 || 12}:${String(n.getMinutes()).padStart(2, '0')}`)
    }
    tick()
    const id = setInterval(tick, 60000)
    return () => clearInterval(id)
  }, [activeTab])

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return <Home />
      case 'calendar':
        return <Calendar />
      case 'messages':
        return (
          <ErrorBoundary>
            <Messages />
          </ErrorBoundary>
        )
      case 'vehicle':
        return <VehicleInfo />
      case 'memo':
        return <Memo />
      case 'activities':
        return <CompanyActivities />
      case 'management':
        if (userRole != null && userRole !== 'admin') return <Navigate to="/home" replace />
        return <DropdownManagement userRole={userRole} />
      case 'user-management':
        return <UserManagement />
      case 'deficiency':
        return (
          <div style={{ minHeight: '70vh', background: '#1a1512', padding: '1rem', color: '#f5ede0' }}>
            <Suspense
              fallback={
                <p style={{ color: '#d4af37', fontSize: '1.25rem', margin: 0, fontFamily: 'Noto Serif TC, serif' }}>專案管理載入中…</p>
              }
            >
              <ErrorBoundary>
                <ProjectDeficiencyTracking />
              </ErrorBoundary>
            </Suspense>
          </div>
        )
      case 'performance':
        return <PersonalPerformance />
      case 'monthly-report':
        return <MonthlyLocationReport />
      case 'exchange-shop':
        return <ExchangeShop />
      case 'exchange':
        return <Exchange />
      case 'my-backpack':
        return <MyBackpack />
      case 'check-in':
        return <CheckIn />
      case 'daily-todo':
        return <DailyTodo />
      case 'leave-application':
        return <LeaveApplication />
      case 'advance':
        return <Advance />
      case 'compensatory-leave':
        return <CompensatoryLeave />
      case 'developing':
        return <MiniGames />
      default:
        return <Home />
    }
  }

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col bg-gradient-to-b from-cn-ink via-cn-lacquer/95 to-cn-ink">
      {/* 上方導覽列：手機版精簡；選單開啟時 overflow-visible + z-[100] 讓「更多」選單不被裁切且浮在主題／內容之上可點 */}
      <div className={`bg-gradient-to-b from-[#2e241c] to-cn-lacquer border-b border-cn-gold/35 px-3 py-2.5 sm:px-4 sm:py-2 flex flex-row items-center justify-between gap-2 sm:gap-2 shrink-0 min-h-[48px] sm:min-h-[44px] relative shadow-[inset_0_1px_0_rgba(255,230,200,0.05)] ${showTopMenu ? 'z-[100] overflow-visible' : 'overflow-hidden'}`}>
        {/* 左：僅圖示（手機隱藏「主題篩選」文字以留空間） */}
        <div className="flex items-center shrink-0 min-w-0 w-8 sm:w-auto sm:max-w-none">
          <svg className="w-5 h-5 sm:w-5 sm:h-5 text-cn-gold/70 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 5h6v6H4V5zm10 0h6v6h-6V5zM4 15h6v6H4v-6zm10 0h6v6h-6v-6z" />
          </svg>
          <span className="text-cn-mist text-xs whitespace-nowrap truncate hidden sm:inline ml-1 font-serif">窗花</span>
        </div>
        {/* 中：目前分頁標題＋日期時間 */}
        <div className="flex flex-col items-center justify-center min-w-0 flex-1 px-1 sm:px-2 overflow-hidden">
          <h1 className="text-sm sm:text-lg font-bold text-cn-gold truncate w-full text-center font-serif tracking-wide drop-shadow-sm">
            {getTabTitle(activeTab)}
          </h1>
          <div className="flex items-center gap-0.5 text-cn-mist text-[10px] sm:text-xs mt-0.5 truncate" suppressHydrationWarning>
            <span className="truncate">{dateTimeStr}</span>
          </div>
        </div>
        {/* 右：佳盟幣、手機版「更多」選單＋登出；桌面版全部按鈕並排 */}
        <div className="flex items-center justify-end gap-2 sm:gap-1.5 shrink-0 min-w-0">
          {/* 佳盟幣：手機只顯示圖示＋數字，桌面顯示「佳盟幣: 數字」 */}
          <button
            onClick={() => { setShowWalletModal(!showWalletModal); setShowTopMenu(false) }}
            className="bg-gradient-to-b from-amber-200 to-amber-400 hover:from-amber-100 hover:to-amber-300 active:brightness-95 text-cn-ink font-semibold px-2.5 py-2 sm:px-3 sm:py-1.5 rounded-md border border-amber-900/35 shadow transition-colors flex items-center justify-center gap-1 min-h-[40px] min-w-[40px] sm:min-h-[36px] sm:min-w-0 touch-manipulation text-xs sm:text-sm flex-shrink-0"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="hidden sm:inline whitespace-nowrap">佳盟幣: </span>
            <span className="whitespace-nowrap">{walletBalance.toLocaleString()}</span>
          </button>

          {/* 手機版：管理員功能收合到「更多」選單（用 Portal 渲染到 body，避免被主題／頂列裁切或擋住） */}
          {userRole === 'admin' && (
            <div className="relative sm:hidden flex-shrink-0">
              <button
                ref={topMenuButtonRef}
                type="button"
                onClick={() => {
                  const open = !showTopMenu
                  if (open && topMenuButtonRef.current) {
                    const rect = topMenuButtonRef.current.getBoundingClientRect()
                    setTopMenuPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
                  }
                  setShowTopMenu(open)
                }}
                className="bg-cn-panel hover:bg-black/30 text-cn-parchment border border-cn-gold/25 font-semibold px-2.5 py-2 rounded-md transition-colors flex items-center justify-center min-h-[40px] min-w-[40px] touch-manipulation"
                aria-expanded={showTopMenu}
                aria-haspopup="true"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              {showTopMenu && typeof document !== 'undefined' && createPortal(
                <>
                  <div className="fixed inset-0 z-[9998]" onClick={() => setShowTopMenu(false)} aria-hidden style={{ touchAction: 'none' }} />
                  <div
                    className="fixed z-[9999] py-1 min-w-[180px] bg-cn-panel border border-cn-gold/40 rounded-md shadow-2xl"
                    style={{ top: topMenuPosition.top, right: topMenuPosition.right, touchAction: 'manipulation' }}
                  >
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowDistributionModal(true); setShowTopMenu(false); }}
                      className="w-full text-left px-4 py-3 min-h-[44px] text-sm text-cn-parchment hover:bg-black/25 active:bg-black/35 flex items-center gap-2 rounded-t-lg cursor-pointer touch-manipulation"
                    >
                      <span className="bg-cn-jade w-7 h-7 rounded-sm border border-emerald-950/30 flex items-center justify-center text-white text-xs flex-shrink-0">+</span>
                      分配佳盟幣
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowItemDistributionModal(true); setShowTopMenu(false); }}
                      className="w-full text-left px-4 py-3 min-h-[44px] text-sm text-cn-parchment hover:bg-black/25 active:bg-black/35 flex items-center gap-2 cursor-pointer touch-manipulation"
                    >
                      <span className="bg-teal-800 w-7 h-7 rounded-sm border border-teal-950/40 flex items-center justify-center text-white text-xs flex-shrink-0">盒</span>
                      分配道具
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowExchangeRequestModal(true); setShowTopMenu(false); }}
                      className="w-full text-left px-4 py-3 min-h-[44px] text-sm text-cn-parchment hover:bg-black/25 active:bg-black/35 flex items-center gap-2 rounded-b-lg relative cursor-pointer touch-manipulation"
                    >
                      <span className="bg-violet-900 w-7 h-7 rounded-sm border border-violet-950/40 flex items-center justify-center text-white text-xs flex-shrink-0">檔</span>
                      兌換請求
                      {pendingExchangeRequests.length > 0 && (
                        <span className="ml-auto bg-cn-gold text-cn-ink rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold">
                          {pendingExchangeRequests.length}
                        </span>
                      )}
                    </button>
                  </div>
                </>,
                document.body
              )}
            </div>
          )}

          {/* 桌面版：管理員按鈕並排顯示 */}
          {userRole === 'admin' && (
            <div className="hidden sm:flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setShowDistributionModal(!showDistributionModal)}
                className="bg-cn-jade hover:brightness-110 active:brightness-95 text-white font-semibold px-3 py-1.5 rounded-md border border-emerald-950/40 transition-colors flex items-center justify-center gap-1 min-h-[36px] touch-manipulation text-sm"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>分配佳盟幣</span>
              </button>
              <button
                onClick={() => setShowItemDistributionModal(!showItemDistributionModal)}
                className="bg-teal-800 hover:bg-teal-700 active:bg-teal-700 text-white font-semibold px-3 py-1.5 rounded-md border border-teal-950/40 transition-colors flex items-center justify-center gap-1 min-h-[36px] touch-manipulation text-sm"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <span>分配道具</span>
              </button>
              <button
                onClick={() => setShowExchangeRequestModal(!showExchangeRequestModal)}
                className="bg-violet-900 hover:bg-violet-800 active:bg-violet-800 text-white font-semibold px-3 py-1.5 rounded-md border border-violet-950/40 transition-colors flex items-center justify-center gap-1 relative min-h-[36px] touch-manipulation text-sm"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>兌換請求</span>
                {pendingExchangeRequests.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-cn-gold text-cn-ink rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-bold">
                    {pendingExchangeRequests.length}
                  </span>
                )}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleCloudSync}
            disabled={cloudSyncing}
            title="先從雲端同步，再完整重新載入頁面（等同按 F5），確保所有資料與畫面皆為最新"
            className="bg-cyan-950 hover:bg-cyan-900 active:bg-cyan-900 border border-cyan-800/50 disabled:opacity-50 disabled:pointer-events-none text-cn-parchment font-semibold px-2.5 py-2 sm:px-3 sm:py-1.5 rounded-md transition-colors flex items-center justify-center gap-1 min-h-[40px] min-w-[40px] sm:min-h-[36px] sm:min-w-0 touch-manipulation text-xs sm:text-sm flex-shrink-0"
          >
            <svg className={`w-4 h-4 shrink-0 ${cloudSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="hidden sm:inline">{cloudSyncing ? '同步中…' : '同步並重整'}</span>
          </button>

          <button
            onClick={onLogout}
            className="bg-cn-vermilion hover:brightness-110 active:brightness-95 text-cn-parchment font-semibold px-2.5 py-2 sm:px-3 sm:py-1.5 rounded-md border border-red-950/40 transition-colors flex items-center justify-center gap-1 min-h-[40px] min-w-[40px] sm:min-h-[36px] sm:min-w-0 touch-manipulation text-xs sm:text-sm flex-shrink-0"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="hidden sm:inline">登出</span>
          </button>
        </div>
      </div>

      {/* 錢包詳情模態框 */}
      {showWalletModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gradient-to-b from-cn-panel to-cn-lacquer rounded-xl p-6 max-w-md w-full mx-4 border-2 border-cn-gold/45 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-cn-gold font-serif tracking-wide">餘額錢包</h2>
              <button
                onClick={() => setShowWalletModal(false)}
                className="text-cn-mist hover:text-cn-parchment"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div className="bg-black/25 rounded-lg p-4 border border-cn-gold/25">
                <div className="text-cn-mist text-sm mb-1">當前餘額</div>
                <div className="text-3xl font-bold text-cn-gold font-serif">
                  {walletBalance.toLocaleString()} 佳盟幣
                </div>
              </div>
              <div>
                <h3 className="text-cn-parchment font-semibold mb-2 font-serif">交易記錄</h3>
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {getUserTransactions(currentUser).length === 0 ? (
                    <div className="text-cn-mist text-center py-4">尚無交易記錄</div>
                  ) : (
                    getUserTransactions(currentUser).slice(0, 20).map((tx) => (
                      <div
                        key={tx.id}
                        className={`p-3 rounded-lg border ${
                          tx.type === 'distribution' || tx.to === currentUser
                            ? 'border-cn-jade/50 bg-emerald-950/25'
                            : 'border-cn-vermilion/45 bg-red-950/20'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-cn-parchment font-semibold">
                              {tx.type === 'distribution' ? '管理員分配' :
                               tx.to === currentUser ? '收到' : '支出'}
                            </div>
                            <div className="text-cn-mist text-sm">
                              {tx.description || `${tx.from} → ${tx.to}`}
                            </div>
                            <div className="text-cn-mist/80 text-xs mt-1">
                              {new Date(tx.createdAt).toLocaleString('zh-TW')}
                            </div>
                          </div>
                          <div className={`font-bold ${
                            tx.type === 'distribution' || tx.to === currentUser
                              ? 'text-emerald-400'
                              : 'text-red-300'
                          }`}>
                            {tx.type === 'distribution' || tx.to === currentUser ? '+' : '-'}
                            {tx.amount.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 分配佳盟幣模態框（管理員） */}
      {showDistributionModal && userRole === 'admin' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-b from-cn-panel to-cn-lacquer rounded-xl p-5 sm:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto border-2 border-cn-jade/50 shadow-2xl">
            <div className="flex items-center justify-between mb-4 gap-2">
              <h2 className="text-xl font-bold text-emerald-400 font-serif tracking-wide">分配佳盟幣</h2>
              <button
                type="button"
                onClick={() => {
                  setShowDistributionModal(false)
                  setDistributionForm({ username: '', amount: 0 })
                }}
                className="flex items-center justify-center min-h-[48px] min-w-[48px] rounded-lg text-cn-mist hover:text-cn-parchment hover:bg-black/25 active:bg-black/35 touch-manipulation text-xl"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-cn-mist text-sm mb-1">選擇用戶</label>
                <select
                  value={distributionForm.username}
                  onChange={(e) => setDistributionForm({ ...distributionForm, username: e.target.value })}
                  className="w-full bg-black/30 border border-cn-gold/30 rounded-lg px-4 py-3 sm:py-2 text-cn-parchment focus:outline-none focus:ring-2 focus:ring-cn-jade/50 touch-manipulation text-base"
                >
                  <option value="">請選擇用戶</option>
                  <option value={ALL_USERS_VALUE}>所有用戶（全體分發）</option>
                  {allUsers.map((user) => (
                    <option key={user.account} value={user.account}>
                      {user.name} ({user.account}) - 當前餘額: {getWalletBalance(user.account).toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-cn-mist text-sm mb-1">分配金額</label>
                <input
                  type="number"
                  min="1"
                  value={distributionForm.amount}
                  onChange={(e) => setDistributionForm({ ...distributionForm, amount: parseInt(e.target.value) || 0 })}
                  placeholder="輸入佳盟幣數量"
                  className="w-full bg-black/30 border border-cn-gold/30 rounded-lg px-4 py-3 sm:py-2 text-cn-parchment placeholder:text-cn-mist/60 focus:outline-none focus:ring-2 focus:ring-cn-jade/50 touch-manipulation text-base"
                />
              </div>
              <button
                type="button"
                onClick={handleDistributeCoins}
                disabled={!distributionForm.username || distributionForm.amount <= 0}
                className="w-full min-h-[48px] bg-cn-jade hover:brightness-110 disabled:bg-black/40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg border border-emerald-950/40 transition-colors touch-manipulation"
              >
                {distributionForm.username === ALL_USERS_VALUE ? '全體分發' : '分配'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 分配道具模態框（管理員） */}
      {showItemDistributionModal && userRole === 'admin' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-b from-cn-panel to-cn-lacquer rounded-xl p-5 sm:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto border-2 border-teal-700/55 shadow-2xl">
            <div className="flex items-center justify-between mb-4 gap-2">
              <h2 className="text-xl font-bold text-teal-300 font-serif tracking-wide">分配道具</h2>
              <button
                type="button"
                onClick={() => {
                  setShowItemDistributionModal(false)
                  setItemDistributionForm({ username: '', itemId: '', quantity: 1 })
                }}
                className="flex items-center justify-center min-h-[48px] min-w-[48px] rounded-lg text-cn-mist hover:text-cn-parchment hover:bg-black/25 active:bg-black/35 touch-manipulation text-xl"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-cn-mist text-sm mb-2">選擇用戶</label>
                <select
                  value={itemDistributionForm.username}
                  onChange={(e) => setItemDistributionForm({ ...itemDistributionForm, username: e.target.value })}
                  className="w-full bg-black/30 border border-cn-gold/30 rounded-lg px-4 py-3 sm:py-2 text-cn-parchment focus:outline-none focus:ring-2 focus:ring-teal-600/45 touch-manipulation text-base"
                >
                  <option value="">請選擇用戶</option>
                  <option value={ALL_USERS_VALUE}>所有用戶（全體分發）</option>
                  {allUsers.map((user) => (
                    <option key={user.account} value={user.account}>
                      {user.name} ({user.account})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-cn-mist text-sm mb-2">選擇道具</label>
                <select
                  value={itemDistributionForm.itemId}
                  onChange={(e) => setItemDistributionForm({ ...itemDistributionForm, itemId: e.target.value })}
                  className="w-full bg-black/30 border border-cn-gold/30 rounded-lg px-4 py-3 sm:py-2 text-cn-parchment focus:outline-none focus:ring-2 focus:ring-teal-600/45 touch-manipulation text-base"
                >
                  <option value="">請選擇道具</option>
                  {availableItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.icon} {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-cn-mist text-sm mb-2">數量</label>
                <input
                  type="number"
                  min="1"
                  value={itemDistributionForm.quantity}
                  onChange={(e) => setItemDistributionForm({ ...itemDistributionForm, quantity: parseInt(e.target.value) || 1 })}
                  className="w-full bg-black/30 border border-cn-gold/30 rounded-lg px-4 py-3 sm:py-2 text-cn-parchment focus:outline-none focus:ring-2 focus:ring-teal-600/45 touch-manipulation text-base"
                />
              </div>
              <button
                type="button"
                onClick={handleDistributeItem}
                disabled={!itemDistributionForm.username || !itemDistributionForm.itemId || itemDistributionForm.quantity <= 0}
                className="w-full min-h-[48px] bg-teal-800 hover:bg-teal-700 disabled:bg-black/40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg border border-teal-950/40 transition-colors touch-manipulation"
              >
                {itemDistributionForm.username === ALL_USERS_VALUE ? '全體分發道具' : '分配道具'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 兌換請求模態框（管理員） */}
      {showExchangeRequestModal && userRole === 'admin' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-b from-cn-panel to-cn-lacquer rounded-xl p-5 sm:p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto border-2 border-violet-800/55 shadow-2xl">
            <div className="flex items-center justify-between mb-4 gap-2">
              <h2 className="text-xl font-bold text-violet-300 font-serif tracking-wide">兌換請求管理</h2>
              <button
                type="button"
                onClick={() => setShowExchangeRequestModal(false)}
                className="flex items-center justify-center min-h-[48px] min-w-[48px] rounded-lg text-cn-mist hover:text-cn-parchment hover:bg-black/25 active:bg-black/35 touch-manipulation text-xl"
              >
                ✕
              </button>
            </div>
            
            {pendingExchangeRequests.length === 0 ? (
              <div className="text-center py-8 text-cn-mist">
                <p>目前沒有待處理的兌換請求</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingExchangeRequests.map((request) => {
                  const user = allUsers.find(u => u.account === request.username)
                  return (
                    <div
                      key={request.id}
                      className="bg-black/25 rounded-lg p-4 border border-cn-gold/25"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="text-4xl">{request.itemIcon || '🎁'}</div>
                          <div>
                            <div className="text-cn-parchment font-semibold">{request.itemName}</div>
                            <div className="text-cn-mist text-sm">
                              用戶：{user ? user.name : request.username} ({request.username})
                            </div>
                            <div className="text-cn-mist/80 text-xs mt-1">
                              請求時間：{new Date(request.createdAt).toLocaleString('zh-TW')}
                            </div>
                          </div>
                        </div>
                        <div className="text-cn-gold font-bold">數量：{request.quantity || 1}</div>
                      </div>
                      
                      {request.description && (
                        <div className="mb-3 text-cn-parchment/90 text-sm">
                          {request.description}
                        </div>
                      )}
                      
                      <div className="flex gap-3 mt-3">
                        <button
                          type="button"
                          onClick={() => handleApproveExchange(request.id)}
                          className="flex-1 min-h-[48px] bg-cn-jade hover:brightness-110 active:brightness-95 text-white font-semibold py-3 rounded-lg border border-emerald-950/40 transition-colors touch-manipulation"
                        >
                          確認兌換
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRejectExchange(request.id)}
                          className="flex-1 min-h-[48px] bg-cn-vermilion hover:brightness-110 active:brightness-95 text-cn-parchment font-semibold py-3 rounded-lg border border-red-950/40 transition-colors touch-manipulation"
                        >
                          拒絕
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 導航列：手機橫向捲動、每顆至少 44px 觸控區 */}
      <div className="bg-gradient-to-b from-[#2e231c] via-[#221a15] to-cn-lacquer border-b-2 border-cn-gold/40 shrink-0 shadow-[0_4px_20px_rgba(0,0,0,0.35)]">
        <nav className="flex items-stretch flex-nowrap overflow-x-auto scroll-touch px-2 py-2 sm:px-6 sm:py-3 gap-2 sm:gap-1">
          <NavItem
            icon={<HomeIcon />}
            label="首頁"
            isActive={activeTab === 'home'}
            onClick={() => handleTabClick('home', '/home')}
          />
          <NavItem
            icon={<CalendarIcon />}
            label="行事曆"
            isActive={activeTab === 'calendar'}
            onClick={() => handleTabClick('calendar', '/calendar')}
            badge={userRole === 'admin' && activeTab !== 'calendar' && navBadges.overtime > 0 ? navBadges.overtime : null}
          />
          <NavItem
            icon={<AlertIcon />}
            label="專案管理"
            isActive={activeTab === 'deficiency'}
            onClick={() => handleTabClick('deficiency', '/project-deficiency')}
          />
          <NavItem
            icon={<ChatIcon />}
            label="車輛資訊"
            isActive={activeTab === 'vehicle'}
            onClick={() => handleTabClick('vehicle', '/vehicle-info')}
          />
          <NavItem
            icon={<DocumentIcon />}
            label="交流區"
            isActive={activeTab === 'memo'}
            onClick={() => handleTabClick('memo', '/memo')}
            badge={activeTab === 'memo' ? null : (navBadges.memo > 0 ? navBadges.memo : null)}
          />
          <NavItem
            icon={<DocumentIcon />}
            label="溫馨提醒"
            isActive={activeTab === 'daily-todo'}
            onClick={() => handleTabClick('daily-todo', '/daily-todo')}
            badge={activeTab === 'daily-todo' ? null : (navBadges.dailyTodo > 0 ? navBadges.dailyTodo : null)}
          />
          <NavItem
            icon={<PeopleIcon />}
            label="公司活動"
            isActive={activeTab === 'activities'}
            onClick={() => handleTabClick('activities', '/company-activities')}
            badge={activeTab === 'activities' ? null : (navBadges.activities > 0 ? navBadges.activities : null)}
          />
          <NavItem
            icon={<GameIcon />}
            label="開發中"
            isActive={activeTab === 'developing'}
            onClick={() => handleTabClick('developing', '/developing')}
          />
          <NavItem
            icon={<CalendarIcon />}
            label="整月報表"
            isActive={activeTab === 'monthly-report'}
            onClick={() => handleTabClick('monthly-report', '/monthly-location-report')}
          />
          {userRole === 'admin' && (
            <NavItem
              icon={<GearIcon />}
              label="下拉選單管理"
              isActive={activeTab === 'management'}
              onClick={() => handleTabClick('management', '/dropdown-management')}
            />
          )}
          <div className="relative shrink-0">
            <button
              ref={personalServiceButtonRef}
              type="button"
              onClick={() => {
                const open = !showPersonalServiceMenu
                if (open && personalServiceButtonRef.current) {
                  const rect = personalServiceButtonRef.current.getBoundingClientRect()
                  setPersonalServiceMenuPosition({ top: rect.bottom + 4, left: rect.left })
                }
                setShowPersonalServiceMenu(open)
              }}
              className={`
                flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-3 sm:px-4 sm:py-2 rounded-md transition-all whitespace-nowrap min-h-[48px] min-w-[48px] sm:min-w-0 touch-manipulation cursor-pointer text-sm sm:text-base relative font-serif border
                ${['performance', 'exchange-shop', 'exchange', 'my-backpack', 'leave-application', 'advance', 'messages'].includes(activeTab)
                  ? 'bg-gradient-to-b from-amber-100 to-amber-300 text-cn-ink font-semibold border-amber-800/40 shadow-inner'
                  : 'text-cn-parchment border-transparent hover:bg-black/25 hover:border-cn-gold/25 active:bg-black/35'
                }
              `}
            >
              <PersonalServiceIcon />
              <span>個人服務</span>
              {(navBadges.messages + navBadges.leave + navBadges.advance + navBadges.dailyTodo) > 0 && (
                <span className={`absolute top-0.5 right-0.5 sm:top-1 sm:right-1 rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold ${['performance', 'exchange-shop', 'exchange', 'my-backpack', 'leave-application', 'advance', 'messages'].includes(activeTab) ? 'bg-cn-ink text-cn-gold' : 'bg-cn-vermilion text-cn-parchment'}`}>
                  {navBadges.messages + navBadges.leave + navBadges.advance + navBadges.dailyTodo > 99 ? '99+' : navBadges.messages + navBadges.leave + navBadges.advance + navBadges.dailyTodo}
                </span>
              )}
              <svg className="w-4 h-4 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showPersonalServiceMenu && typeof document !== 'undefined' && createPortal(
              <>
                <div className="fixed inset-0 z-[9998]" onClick={() => setShowPersonalServiceMenu(false)} aria-hidden style={{ touchAction: 'none' }} />
                <div
                  className="fixed z-[9999] py-1 min-w-[160px] bg-cn-panel border border-cn-gold/40 rounded-md shadow-2xl"
                  style={{ top: personalServiceMenuPosition.top, left: personalServiceMenuPosition.left, touchAction: 'manipulation' }}
                >
                  <button type="button" onClick={() => { handleTabClick('performance', '/personal-performance'); setShowPersonalServiceMenu(false) }} className="w-full text-left px-4 py-3 min-h-[44px] text-sm text-cn-parchment hover:bg-black/25 flex items-center gap-2 rounded-t-lg cursor-pointer touch-manipulation">
                    <PerformanceIcon /> 個人績效
                  </button>
                  <button type="button" onClick={() => { handleTabClick('my-backpack', '/my-backpack'); setShowPersonalServiceMenu(false) }} className="w-full text-left px-4 py-3 min-h-[44px] text-sm text-cn-parchment hover:bg-black/25 flex items-center gap-2 cursor-pointer touch-manipulation">
                    <BackpackIcon /> 我的背包
                    {backpackItemCount > 0 && <span className="ml-auto bg-cn-gold text-cn-ink rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold">{backpackItemCount}</span>}
                  </button>
                  <button type="button" onClick={() => { handleTabClick('exchange-shop', '/exchange-shop'); setShowPersonalServiceMenu(false) }} className="w-full text-left px-4 py-3 min-h-[44px] text-sm text-cn-parchment hover:bg-black/25 flex items-center gap-2 cursor-pointer touch-manipulation">
                    <ShopIcon /> 兌換商城
                  </button>
                  <button type="button" onClick={() => { handleTabClick('exchange', '/exchange'); setShowPersonalServiceMenu(false) }} className="w-full text-left px-4 py-3 min-h-[44px] text-sm text-cn-parchment hover:bg-black/25 flex items-center gap-2 cursor-pointer touch-manipulation">
                    <ExchangeIcon /> 交易所
                  </button>
                  <button type="button" onClick={() => { handleTabClick('leave-application', '/leave-application'); setShowPersonalServiceMenu(false) }} className="w-full text-left px-4 py-3 min-h-[44px] text-sm text-cn-parchment hover:bg-black/25 flex items-center gap-2 cursor-pointer touch-manipulation">
                    <LeaveIcon /> 請假申請
                    {navBadges.leave > 0 && <span className="ml-auto bg-cn-gold text-cn-ink rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold">{navBadges.leave}</span>}
                  </button>
                  <button type="button" onClick={() => { handleTabClick('advance', '/advance'); setShowPersonalServiceMenu(false) }} className="w-full text-left px-4 py-3 min-h-[44px] text-sm text-cn-parchment hover:bg-black/25 flex items-center gap-2 cursor-pointer touch-manipulation">
                    <AdvanceIcon /> 預支
                    {navBadges.advance > 0 && <span className="ml-auto bg-cn-gold text-cn-ink rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold">{navBadges.advance}</span>}
                  </button>
                  <button type="button" onClick={() => { handleTabClick('messages', '/messages'); setShowPersonalServiceMenu(false) }} className="w-full text-left px-4 py-3 min-h-[44px] text-sm text-cn-parchment hover:bg-black/25 flex items-center gap-2 rounded-b-lg cursor-pointer touch-manipulation">
                    <MailIcon /> 站內信
                    {navBadges.messages > 0 && <span className="ml-auto bg-cn-gold text-cn-ink rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold">{navBadges.messages}</span>}
                  </button>
                </div>
              </>,
              document.body
            )}
          </div>
          <NavItem
            icon={<CompensatoryLeaveIcon />}
            label="補休系統"
            isActive={activeTab === 'compensatory-leave'}
            onClick={() => handleTabClick('compensatory-leave', '/compensatory-leave')}
          />
          <NavItem
            icon={<CheckInIcon />}
            label="每日簽到"
            isActive={activeTab === 'check-in'}
            onClick={() => handleTabClick('check-in', '/check-in')}
          />
          {userRole === 'admin' && (
            <NavItem
              icon={<PeopleIcon />}
              label="用戶管理"
              isActive={activeTab === 'user-management'}
              onClick={() => handleTabClick('user-management', '/user-management')}
            />
          )}
        </nav>
      </div>

      {/* 內容區：行事曆滿版時減少左右留白，其餘頁面維持間距；底部留安全區域 */}
      <div
        className={`flex-1 min-h-0 overflow-auto py-4 sm:py-6 ${activeTab === 'calendar' ? 'px-0 sm:px-4 md:px-6' : 'px-4 sm:px-6'}`}
        style={{
          paddingBottom: 'max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 0.5rem))',
          minHeight: activeTab === 'deficiency' ? '60vh' : undefined,
          backgroundColor: activeTab === 'deficiency' ? '#1a1512' : undefined
        }}
      >
        {renderContent()}
      </div>
    </div>
  )
}

function NavItem({ icon, label, isActive, onClick, badge }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick?.() }}
      className={`
        flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-3 sm:px-4 sm:py-2 rounded-md transition-all whitespace-nowrap relative min-h-[48px] min-w-[48px] sm:min-w-0 touch-manipulation cursor-pointer text-sm sm:text-base shrink-0 overflow-visible font-serif border
        ${isActive
          ? 'bg-gradient-to-b from-amber-100 to-amber-300 text-cn-ink font-semibold border-amber-800/35 shadow-inner'
          : 'text-cn-parchment border-transparent hover:bg-black/22 hover:border-cn-gold/20 active:bg-black/30'
        }
      `}
    >
      {icon}
      <span>{label}</span>
      {badge != null && badge > 0 && (
        <span className={`absolute top-0.5 right-0.5 sm:top-1 sm:right-1 rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold ${
          isActive ? 'bg-cn-ink text-cn-gold' : 'bg-cn-vermilion text-cn-parchment'
        }`}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}

export default Dashboard
