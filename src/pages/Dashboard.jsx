import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import Home from './Home'
import Calendar from './Calendar'
import VehicleInfo from './VehicleInfo'
import Memo from './Memo'
import CompanyActivities from './CompanyActivities'
import DropdownManagement from './DropdownManagement'
import UserManagement from './UserManagement'
import ProjectDeficiencyTracking from './ProjectDeficiencyTracking'
import PersonalPerformance from './PersonalPerformance'
import ExchangeShop from './ExchangeShop'
import Exchange from './Exchange'
import MyBackpack from './MyBackpack'
import CheckIn from './CheckIn'
import TripReport from './TripReport'
import LeaveApplication from './LeaveApplication'
import { getCurrentUserRole, getCurrentUser } from '../utils/authStorage'
import { getWalletBalance, addWalletBalance, getAllWallets, getUserTransactions, addTransaction } from '../utils/walletStorage'
import { getUsers } from '../utils/storage'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { getUserInventory, addItemToInventory } from '../utils/inventoryStorage'
import { getPendingExchangeRequests, approveExchangeRequest, rejectExchangeRequest, deleteExchangeRequest } from '../utils/exchangeRequestStorage'
import { removeItemFromInventory } from '../utils/inventoryStorage'
import { getItems } from '../utils/itemStorage'

// 图标组件
function HomeIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  )
}

function DocumentIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

function PeopleIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  )
}

function PerformanceIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )
}

function ShopIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  )
}

function BackpackIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  )
}

function ExchangeIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  )
}

function CheckInIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  )
}

function LeaveIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

function TripReportIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7M3 12h18M12 3v18" />
    </svg>
  )
}

function Dashboard({ onLogout, activeTab: initialTab }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [activeTab, setActiveTab] = useState(initialTab || getTabFromPath(location.pathname))
  const [userRole, setUserRole] = useState(null)
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
  const [availableItems, setAvailableItems] = useState([])

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
      const users = getUsers()
      setAllUsers(users)
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

  // 即時同步：錢包、用戶、道具、兌換請求變更時重讀，不需登出再登入
  const refetchDashboard = () => {
    const user = getCurrentUser()
    const role = getCurrentUserRole()
    if (user) {
      setWalletBalance(getWalletBalance(user))
      updateBackpackCount(user)
    }
    if (role === 'admin') {
      setAllUsers(getUsers())
      setAvailableItems(getItems())
      loadPendingExchangeRequests()
    }
  }
  useRealtimeKeys(
    ['jiameng_wallets', 'jiameng_transactions', 'jiameng_users', 'jiameng_inventories', 'jiameng_items', 'jiameng_exchange_requests'],
    refetchDashboard
  )

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
    if (path.includes('exchange-shop')) return 'exchange-shop'
    if (path.includes('exchange')) return 'exchange'
    if (path.includes('my-backpack')) return 'my-backpack'
    if (path.includes('check-in')) return 'check-in'
    if (path.includes('trip-report')) return 'trip-report'
    if (path.includes('leave-application')) return 'leave-application'
    return 'home'
  }

  const handleTabClick = (tab, path) => {
    setActiveTab(tab)
    navigate(path)
  }

  // 依目前分頁回傳標題（上方導覽列中央顯示用）
  const getTabTitle = (tab) => {
    const titles = {
      home: '首頁',
      calendar: '行事曆',
      'trip-report': '行程回報',
      deficiency: '專案管理',
      vehicle: '車輛資訊',
      memo: '交流區',
      activities: '公司活動',
      management: '下拉選單管理',
      performance: '個人績效',
      'exchange-shop': '兌換商城',
      exchange: '交易所',
      'my-backpack': '我的背包',
      'check-in': '每日簽到',
      'leave-application': '請假申請',
      'user-management': '用戶管理'
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
      case 'vehicle':
        return <VehicleInfo />
      case 'memo':
        return <Memo />
      case 'activities':
        return <CompanyActivities />
      case 'management':
        if (userRole !== 'admin') return <Navigate to="/home" replace />
        return <DropdownManagement userRole={userRole} />
      case 'user-management':
        return <UserManagement />
      case 'deficiency':
        return <ProjectDeficiencyTracking />
      case 'performance':
        return <PersonalPerformance />
      case 'exchange-shop':
        return <ExchangeShop />
      case 'exchange':
        return <Exchange />
      case 'my-backpack':
        return <MyBackpack />
      case 'check-in':
        return <CheckIn />
      case 'trip-report':
        return <TripReport />
      case 'leave-application':
        return <LeaveApplication />
      default:
        return <Home />
    }
  }

  return (
    <div className="min-h-screen bg-gray-800 flex flex-col">
      {/* 上方導覽列：左＝主題篩選、中＝標題＋日期時間、右＝按鈕（網格縮小以一次顯示全部） */}
      <div className="bg-dark-gray px-2 py-2 sm:px-4 sm:py-2 flex flex-row items-center justify-between gap-1 sm:gap-2 shrink-0 overflow-hidden min-h-[44px] sm:min-h-0">
        {/* 左：圖示＋主題篩選 */}
        <div className="flex items-center gap-1 shrink-0 min-w-0 max-w-[24%] sm:max-w-none">
          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          <span className="text-gray-400 text-xs whitespace-nowrap truncate">主題篩選:</span>
        </div>
        {/* 中：目前分頁標題＋日期時間與箭頭 */}
        <div className="flex flex-col items-center justify-center min-w-0 flex-1 px-0.5 sm:px-1 overflow-hidden">
          <h1 className="text-xs sm:text-lg font-bold text-yellow-400 truncate w-full text-center">
            {getTabTitle(activeTab)}
          </h1>
          <div className="flex items-center gap-0.5 text-gray-400 text-xs mt-0 truncate">
            <span className="truncate">{dateTimeStr}</span>
            <span className="text-gray-500 shrink-0">›</span>
          </div>
        </div>
        {/* 右：佳盟幣、管理員按鈕、登出 */}
        <div className="flex flex-wrap items-center justify-end gap-1 sm:gap-1.5 shrink-0 min-w-0">
          {/* 餘額錢包顯示 */}
          <div className="flex flex-wrap items-center gap-1 sm:gap-2">
            <button
              onClick={() => setShowWalletModal(!showWalletModal)}
              className="bg-yellow-400 hover:bg-yellow-500 active:bg-yellow-500 text-gray-800 font-semibold px-2 py-1.5 sm:px-3 sm:py-1.5 rounded-md transition-colors flex items-center justify-center gap-1 min-h-[36px] min-w-0 sm:min-w-0 touch-manipulation text-xs sm:text-sm"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="whitespace-nowrap">佳盟幣: {walletBalance.toLocaleString()}</span>
            </button>
            {userRole === 'admin' && (
              <>
                <button
                  onClick={() => setShowDistributionModal(!showDistributionModal)}
                  className="bg-green-500 hover:bg-green-600 active:bg-green-600 text-white font-semibold px-2 py-1.5 sm:px-3 sm:py-1.5 rounded-md transition-colors flex items-center justify-center gap-1 min-h-[36px] min-w-[36px] sm:min-w-0 touch-manipulation text-xs sm:text-sm"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="hidden sm:inline">分配佳盟幣</span>
                </button>
                <button
                  onClick={() => setShowItemDistributionModal(!showItemDistributionModal)}
                  className="bg-blue-500 hover:bg-blue-600 active:bg-blue-600 text-white font-semibold px-2 py-1.5 sm:px-3 sm:py-1.5 rounded-md transition-colors flex items-center justify-center gap-1 min-h-[36px] min-w-[36px] sm:min-w-0 touch-manipulation text-xs sm:text-sm"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  <span className="hidden sm:inline">分配道具</span>
                </button>
                <button
                  onClick={() => setShowExchangeRequestModal(!showExchangeRequestModal)}
                  className="bg-purple-500 hover:bg-purple-600 active:bg-purple-600 text-white font-semibold px-2 py-1.5 sm:px-3 sm:py-1.5 rounded-md transition-colors flex items-center justify-center gap-1 relative min-h-[36px] min-w-[36px] sm:min-w-0 touch-manipulation text-xs sm:text-sm"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="hidden sm:inline">兌換請求</span>
                  {pendingExchangeRequests.length > 0 && (
                    <span className="absolute top-0 right-0 sm:-top-0.5 sm:-right-0.5 bg-yellow-400 text-gray-800 rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-bold">
                      {pendingExchangeRequests.length}
                    </span>
                  )}
                </button>
              </>
            )}
          </div>
          <button
            onClick={onLogout}
            className="bg-red-500 hover:bg-red-600 active:bg-red-600 text-white font-semibold px-2 py-1.5 sm:px-3 sm:py-1.5 rounded-md transition-colors flex items-center justify-center gap-1 min-h-[36px] min-w-[36px] sm:min-w-0 touch-manipulation text-xs sm:text-sm"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>登出</span>
          </button>
        </div>
      </div>

      {/* 錢包詳情模態框 */}
      {showWalletModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 border border-yellow-400">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-yellow-400">餘額錢包</h2>
              <button
                onClick={() => setShowWalletModal(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div className="bg-gray-700 rounded-lg p-4">
                <div className="text-gray-400 text-sm mb-1">當前餘額</div>
                <div className="text-3xl font-bold text-yellow-400">
                  {walletBalance.toLocaleString()} 佳盟幣
                </div>
              </div>
              <div>
                <h3 className="text-white font-semibold mb-2">交易記錄</h3>
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {getUserTransactions(currentUser).length === 0 ? (
                    <div className="text-gray-400 text-center py-4">尚無交易記錄</div>
                  ) : (
                    getUserTransactions(currentUser).slice(0, 20).map((tx) => (
                      <div
                        key={tx.id}
                        className={`p-3 rounded-lg border ${
                          tx.type === 'distribution' || tx.to === currentUser
                            ? 'border-green-500 bg-green-900/20'
                            : 'border-red-500 bg-red-900/20'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-white font-semibold">
                              {tx.type === 'distribution' ? '管理員分配' :
                               tx.to === currentUser ? '收到' : '支出'}
                            </div>
                            <div className="text-gray-400 text-sm">
                              {tx.description || `${tx.from} → ${tx.to}`}
                            </div>
                            <div className="text-gray-500 text-xs mt-1">
                              {new Date(tx.createdAt).toLocaleString('zh-TW')}
                            </div>
                          </div>
                          <div className={`font-bold ${
                            tx.type === 'distribution' || tx.to === currentUser
                              ? 'text-green-400'
                              : 'text-red-400'
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
          <div className="bg-gray-800 rounded-xl p-5 sm:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto border border-green-400">
            <div className="flex items-center justify-between mb-4 gap-2">
              <h2 className="text-xl font-bold text-green-400">分配佳盟幣</h2>
              <button
                type="button"
                onClick={() => {
                  setShowDistributionModal(false)
                  setDistributionForm({ username: '', amount: 0 })
                }}
                className="flex items-center justify-center min-h-[48px] min-w-[48px] rounded-lg text-gray-400 hover:text-white hover:bg-gray-600 active:bg-gray-600 touch-manipulation text-xl"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-gray-400 text-sm mb-1">選擇用戶</label>
                <select
                  value={distributionForm.username}
                  onChange={(e) => setDistributionForm({ ...distributionForm, username: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 sm:py-2 text-white focus:outline-none focus:border-green-400 touch-manipulation text-base"
                >
                  <option value="">請選擇用戶</option>
                  {allUsers.map((user) => (
                    <option key={user.account} value={user.account}>
                      {user.name} ({user.account}) - 當前餘額: {getWalletBalance(user.account).toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-1">分配金額</label>
                <input
                  type="number"
                  min="1"
                  value={distributionForm.amount}
                  onChange={(e) => setDistributionForm({ ...distributionForm, amount: parseInt(e.target.value) || 0 })}
                  placeholder="輸入佳盟幣數量"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 sm:py-2 text-white focus:outline-none focus:border-green-400 touch-manipulation text-base"
                />
              </div>
              <button
                type="button"
                onClick={handleDistributeCoins}
                disabled={!distributionForm.username || distributionForm.amount <= 0}
                className="w-full min-h-[48px] bg-green-500 hover:bg-green-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors touch-manipulation"
              >
                分配
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 分配道具模態框（管理員） */}
      {showItemDistributionModal && userRole === 'admin' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl p-5 sm:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto border border-blue-400">
            <div className="flex items-center justify-between mb-4 gap-2">
              <h2 className="text-xl font-bold text-blue-400">分配道具</h2>
              <button
                type="button"
                onClick={() => {
                  setShowItemDistributionModal(false)
                  setItemDistributionForm({ username: '', itemId: '', quantity: 1 })
                }}
                className="flex items-center justify-center min-h-[48px] min-w-[48px] rounded-lg text-gray-400 hover:text-white hover:bg-gray-600 active:bg-gray-600 touch-manipulation text-xl"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-gray-300 text-sm mb-2">選擇用戶</label>
                <select
                  value={itemDistributionForm.username}
                  onChange={(e) => setItemDistributionForm({ ...itemDistributionForm, username: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 sm:py-2 text-white focus:outline-none focus:border-blue-400 touch-manipulation text-base"
                >
                  <option value="">請選擇用戶</option>
                  {allUsers.map((user) => (
                    <option key={user.account} value={user.account}>
                      {user.name} ({user.account})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-gray-300 text-sm mb-2">選擇道具</label>
                <select
                  value={itemDistributionForm.itemId}
                  onChange={(e) => setItemDistributionForm({ ...itemDistributionForm, itemId: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 sm:py-2 text-white focus:outline-none focus:border-blue-400 touch-manipulation text-base"
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
                <label className="block text-gray-300 text-sm mb-2">數量</label>
                <input
                  type="number"
                  min="1"
                  value={itemDistributionForm.quantity}
                  onChange={(e) => setItemDistributionForm({ ...itemDistributionForm, quantity: parseInt(e.target.value) || 1 })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 sm:py-2 text-white focus:outline-none focus:border-blue-400 touch-manipulation text-base"
                />
              </div>
              <button
                type="button"
                onClick={handleDistributeItem}
                disabled={!itemDistributionForm.username || !itemDistributionForm.itemId || itemDistributionForm.quantity <= 0}
                className="w-full min-h-[48px] bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors touch-manipulation"
              >
                分配道具
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 兌換請求模態框（管理員） */}
      {showExchangeRequestModal && userRole === 'admin' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl p-5 sm:p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-purple-400">
            <div className="flex items-center justify-between mb-4 gap-2">
              <h2 className="text-xl font-bold text-purple-400">兌換請求管理</h2>
              <button
                type="button"
                onClick={() => setShowExchangeRequestModal(false)}
                className="flex items-center justify-center min-h-[48px] min-w-[48px] rounded-lg text-gray-400 hover:text-white hover:bg-gray-600 active:bg-gray-600 touch-manipulation text-xl"
              >
                ✕
              </button>
            </div>
            
            {pendingExchangeRequests.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p>目前沒有待處理的兌換請求</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingExchangeRequests.map((request) => {
                  const user = allUsers.find(u => u.account === request.username)
                  return (
                    <div
                      key={request.id}
                      className="bg-gray-700 rounded-lg p-4 border border-gray-600"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="text-4xl">{request.itemIcon || '🎁'}</div>
                          <div>
                            <div className="text-white font-semibold">{request.itemName}</div>
                            <div className="text-gray-400 text-sm">
                              用戶：{user ? user.name : request.username} ({request.username})
                            </div>
                            <div className="text-gray-500 text-xs mt-1">
                              請求時間：{new Date(request.createdAt).toLocaleString('zh-TW')}
                            </div>
                          </div>
                        </div>
                        <div className="text-yellow-400 font-bold">數量：{request.quantity || 1}</div>
                      </div>
                      
                      {request.description && (
                        <div className="mb-3 text-gray-300 text-sm">
                          {request.description}
                        </div>
                      )}
                      
                      <div className="flex gap-3 mt-3">
                        <button
                          type="button"
                          onClick={() => handleApproveExchange(request.id)}
                          className="flex-1 min-h-[48px] bg-green-500 hover:bg-green-600 active:bg-green-600 text-white font-semibold py-3 rounded-lg transition-colors touch-manipulation"
                        >
                          確認兌換
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRejectExchange(request.id)}
                          className="flex-1 min-h-[48px] bg-red-500 hover:bg-red-600 active:bg-red-600 text-white font-semibold py-3 rounded-lg transition-colors touch-manipulation"
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
      <div className="bg-gray-700 border-b border-yellow-400 shrink-0">
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
          />
          <NavItem
            icon={<TripReportIcon />}
            label="行程回報"
            isActive={activeTab === 'trip-report'}
            onClick={() => handleTabClick('trip-report', '/trip-report')}
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
          />
          <NavItem
            icon={<PeopleIcon />}
            label="公司活動"
            isActive={activeTab === 'activities'}
            onClick={() => handleTabClick('activities', '/company-activities')}
          />
          {userRole === 'admin' && (
            <NavItem
              icon={<GearIcon />}
              label="下拉選單管理"
              isActive={activeTab === 'management'}
              onClick={() => handleTabClick('management', '/dropdown-management')}
            />
          )}
          <NavItem
            icon={<PerformanceIcon />}
            label="個人績效"
            isActive={activeTab === 'performance'}
            onClick={() => handleTabClick('performance', '/personal-performance')}
          />
          <NavItem
            icon={<ShopIcon />}
            label="兌換商城"
            isActive={activeTab === 'exchange-shop'}
            onClick={() => handleTabClick('exchange-shop', '/exchange-shop')}
          />
          <NavItem
            icon={<ExchangeIcon />}
            label="交易所"
            isActive={activeTab === 'exchange'}
            onClick={() => handleTabClick('exchange', '/exchange')}
          />
          <NavItem
            icon={<BackpackIcon />}
            label="我的背包"
            isActive={activeTab === 'my-backpack'}
            onClick={() => handleTabClick('my-backpack', '/my-backpack')}
            badge={backpackItemCount > 0 ? backpackItemCount : null}
          />
          <NavItem
            icon={<CheckInIcon />}
            label="每日簽到"
            isActive={activeTab === 'check-in'}
            onClick={() => handleTabClick('check-in', '/check-in')}
          />
          <NavItem
            icon={<LeaveIcon />}
            label="請假申請"
            isActive={activeTab === 'leave-application'}
            onClick={() => handleTabClick('leave-application', '/leave-application')}
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
        style={{ paddingBottom: 'max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 0.5rem))' }}
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
        flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-3 sm:px-4 sm:py-2 rounded-lg transition-all whitespace-nowrap relative min-h-[48px] min-w-[48px] sm:min-w-0 touch-manipulation cursor-pointer text-sm sm:text-base shrink-0
        ${isActive 
          ? 'bg-yellow-400 text-gray-800 font-semibold' 
          : 'text-white hover:bg-gray-600 active:bg-gray-600'
        }
      `}
    >
      {icon}
      <span>{label}</span>
      {badge && badge > 0 && (
        <span className={`absolute top-0.5 right-0.5 sm:-top-1 sm:-right-1 bg-yellow-400 text-gray-800 rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center text-xs font-bold ${
          isActive ? 'bg-gray-800 text-yellow-400' : ''
        }`}>
          {badge}
        </span>
      )}
    </button>
  )
}

export default Dashboard
