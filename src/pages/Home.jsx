import { useState, useEffect, Fragment } from 'react'
import { getUsers } from '../utils/storage'
import { isSupabaseEnabled as isAuthSupabase, getPublicProfiles } from '../utils/authSupabase'
import { getUserPerformanceRecords, getUserLateRecords, getUserAttendanceRecords } from '../utils/performanceStorage'
import { getSchedules } from '../utils/scheduleStorage'
import { getLeaderboardItems, getLeaderboardUIConfig, saveLeaderboardUIConfig, addLeaderboardItem, updateLeaderboardItem, deleteLeaderboardItem, getManualRankings, saveManualRankings, addManualRanking, updateManualRanking, deleteManualRanking } from '../utils/leaderboardStorage'
import { addTestRecord, getTestRecords, deleteTestRecord } from '../utils/testRecordStorage'
import { getCurrentUserRole, getCurrentUser } from '../utils/authStorage'
import { getTodos, addTodo, updateTodo, deleteTodo, toggleTodo } from '../utils/todoStorage'
import { getItems, getItem, createItem, updateItem, deleteItem, ITEM_TYPES } from '../utils/itemStorage'
import { addItemToInventory, hasItem, removeItemFromInventory, getUserInventory } from '../utils/inventoryStorage'
import { getAllEquippedEffects, unequipEffect } from '../utils/effectStorage'
import { addWalletBalance, addTransaction } from '../utils/walletStorage'
import { getDanmus } from '../utils/danmuStorage'
import { getTitleConfig } from '../utils/titleStorage'
import { getEffectDisplayConfig, saveEffectDisplayConfig, getStyleForPreset, getDecorationById, getDecorationForPreset, NAME_EFFECT_PRESETS, MESSAGE_EFFECT_PRESETS, TITLE_BADGE_PRESETS, DECORATION_PRESETS } from '../utils/effectDisplayStorage'
import { getLeaderboardTypes, addLeaderboardType, updateLeaderboardType, deleteLeaderboardType, getPresetIdByRank } from '../utils/leaderboardTypeStorage'
import { getEquippedEffects } from '../utils/effectStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'

function Home() {
  const [leaderboardItems, setLeaderboardItems] = useState([]) // 可編輯的排行榜項目
  const [rankings, setRankings] = useState({}) // 動態排行榜數據
  const [selectedRankingId, setSelectedRankingId] = useState(null) // 選中的排行榜項目
  const [dateRange, setDateRange] = useState('month') // week, month, year, all
  const [userRole, setUserRole] = useState(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [expandEditTitles, setExpandEditTitles] = useState(false)
  const [expandEditEffects, setExpandEditEffects] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [editForm, setEditForm] = useState({
    name: '',
    type: 'completionRate',
    workContent: '',
    isManual: false, // 是否為手動輸入排行榜
    isGroupGoal: false, // 是否為團體目標模式
    groupGoal: 0, // 團體目標總數
    rewardType: 'text', // 獎勵類型：text（文字描述）、jiameng_coin（佳盟幣）、item（道具）
    reward: '', // 達標獎勵描述（文字描述時使用）
    rewardAmount: 0, // 獎勵數量（佳盟幣或道具數量）
    rewardItemId: '', // 獎勵道具ID（道具類型時使用）
    currentProgress: 0, // 當前累計進度
    achievedAt: null, // 達成時間
    lastResetAt: null, // 上次重置時間
    titleFirstPlace: '', titleSecondPlace: '', titleThirdPlace: '',
    nameEffectPresetId: '', messageEffectPresetId: '', titleBadgePresetId: '',
    nameEffectPresetIdRank1: '', nameEffectPresetIdRank2: '', nameEffectPresetIdRank3: '',
    messageEffectPresetIdRank1: '', messageEffectPresetIdRank2: '', messageEffectPresetIdRank3: '',
    titleBadgePresetIdRank1: '', titleBadgePresetIdRank2: '', titleBadgePresetIdRank3: '',
    decorationPresetIdRank1: '', decorationPresetIdRank2: '', decorationPresetIdRank3: ''
  })
  const [uiConfig, setUIConfig] = useState(getLeaderboardUIConfig())
  const [showUIConfigModal, setShowUIConfigModal] = useState(false)
  const [uiConfigForm, setUIConfigForm] = useState({})
  const [manualRankings, setManualRankings] = useState({}) // 每個排行榜項目的手動排名數據
  const [editingRankingId, setEditingRankingId] = useState(null) // 正在編輯的排名項目ID
  const [editingPanelId, setEditingPanelId] = useState(null) // 正在編輯的面板ID
  const [leaderboardTitleClickEffect, setLeaderboardTitleClickEffect] = useState(false) // 排行榜標題點擊效果
  const [testRecords, setTestRecords] = useState({}) // 測試記錄數據
  const [availableItems, setAvailableItems] = useState([]) // 可用道具列表（用於獎勵選擇）
  const [showEffectConfigModal, setShowEffectConfigModal] = useState(false)
  const [effectConfigTab, setEffectConfigTab] = useState('name') // 'name' | 'message' | 'title'
  const [effectDisplayForm, setEffectDisplayForm] = useState({ nameEffect: {}, messageEffect: {}, titleBadge: {} })
  const [showTypeModal, setShowTypeModal] = useState(false)
  const [editingType, setEditingType] = useState(null) // 正在編輯的類型，null 表示新增
  const emptyRankEffects = () => ({
    nameEffectPresetIdRank1: '', nameEffectPresetIdRank2: '', nameEffectPresetIdRank3: '',
    messageEffectPresetIdRank1: '', messageEffectPresetIdRank2: '', messageEffectPresetIdRank3: '',
    titleBadgePresetIdRank1: '', titleBadgePresetIdRank2: '', titleBadgePresetIdRank3: '',
    decorationPresetIdRank1: '', decorationPresetIdRank2: '', decorationPresetIdRank3: ''
  })
  const [typeForm, setTypeForm] = useState({ name: '', titleFirstPlace: '', titleSecondPlace: '', titleThirdPlace: '', nameEffectPresetId: '', messageEffectPresetId: '', titleBadgePresetId: '', ...emptyRankEffects() })
  const [leaderboardTypes, setLeaderboardTypes] = useState([]) // 排行榜類型列表（供載入類型用）
  // 待辦事項狀態
  const [todos, setTodos] = useState([])
  const [newTodoText, setNewTodoText] = useState('')
  const [currentUser, setCurrentUser] = useState('')

  useEffect(() => {
    const role = getCurrentUserRole()
    const user = getCurrentUser()
    setUserRole(role)
    setCurrentUser(user || '')
    loadTodos()
    loadLeaderboardItems()
    // 不預設任何排行榜，由使用者自行新增
    // 載入可用道具列表
    const items = getItems()
    setAvailableItems(items)
    const config = getLeaderboardUIConfig()
    // 確保 columnTime、columnDaysOnList、leaderboardTitle 存在
    let needsSave = false
    if (!config.columnTime) {
      config.columnTime = '時間'
      needsSave = true
    }
    if (!config.columnDaysOnList) {
      config.columnDaysOnList = '上榜天數'
      needsSave = true
    }
    if (!config.leaderboardTitle) {
      config.leaderboardTitle = '排行榜標題'
      needsSave = true
    }
    if (needsSave) saveLeaderboardUIConfig(config)
    setUIConfig(config)
    setUIConfigForm(config)
  }, [])

  useEffect(() => {
    if (leaderboardItems.length > 0) {
      loadManualRankings()
      calculateAllRankings()
      loadTestRecords()
      // 自動同步「整月無遲到」排行榜
      syncNoLateLeaderboard()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderboardItems.length, selectedRankingId])
  
  // 定期更新團體目標進度（確保手動排名數據被計入）
  useEffect(() => {
    const interval = setInterval(() => {
      // 檢查是否有團體目標模式的排行榜
      const currentItems = getLeaderboardItems()
      const hasGroupGoal = currentItems.some(item => item.isGroupGoal && item.type === 'totalQuantity')
      if (hasGroupGoal) {
        calculateAllRankings()
      }
    }, 2000) // 每2秒更新一次
    return () => clearInterval(interval)
  }, []) // 移除依賴項，避免無限循環
  
  // 自動同步「整月無遲到」排行榜
  const syncNoLateLeaderboard = async () => {
    let users = getUsers().filter(u => u.role !== 'admin')
    if (typeof isAuthSupabase === 'function' && isAuthSupabase()) {
      try {
        const profiles = await getPublicProfiles()
        if (Array.isArray(profiles) && profiles.length > 0) {
          users = profiles
            .filter(p => !p?.is_admin)
            .map(p => ({ account: p.account, name: p.display_name || p.account, role: p.is_admin ? 'admin' : 'user' }))
        }
      } catch (e) {
        console.warn('syncNoLateLeaderboard: 取得 profiles 失敗', e)
      }
    }
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()
    const startDate = new Date(year, month, 1)
    const endDate = new Date(year, month + 1, 0)
    
    leaderboardItems.forEach(item => {
      const isNoLateLeaderboard = item.title === '整月無遲到' || 
                                  item.name === '整月無遲到' ||
                                  item.workContent === '整月無遲到'
      
      if (isNoLateLeaderboard) {
        const existingRankings = getManualRankings(item.id)
        const existingUserNames = new Set(existingRankings.map(r => r.name))
        
        // 檢查每個用戶是否整月無遲到
        users.forEach(user => {
          const userName = user.account
          const userDisplayName = user.name || user.account
          
          // 獲取該用戶在當前月份的遲到記錄
          const lateRecords = getUserLateRecords(userName, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0])
          
          // 如果沒有遲到記錄且尚未在排行榜中，則添加
          if (lateRecords.length === 0 && !existingUserNames.has(userDisplayName)) {
            addManualRanking(item.id, {
              name: userDisplayName,
              quantity: '1',
              time: '',
              department: ''
            })
          }
          
          // 如果有遲到記錄但已在排行榜中，則移除
          if (lateRecords.length > 0 && existingUserNames.has(userDisplayName)) {
            const rankingToRemove = existingRankings.find(r => r.name === userDisplayName)
            if (rankingToRemove) {
              deleteManualRanking(item.id, rankingToRemove.id)
            }
          }
        })
        
        // 重新加載手動排名數據
        loadManualRankings()
      }
    })
  }

  useEffect(() => {
    if (selectedRankingId && rankings[selectedRankingId]) {
      // 當選中的項目有排名數據時，確保已計算
    }
  }, [selectedRankingId, rankings])

  const loadManualRankings = () => {
    const manualData = {}
    leaderboardItems.forEach(item => {
      manualData[item.id] = getManualRankings(item.id)
    })
    setManualRankings(manualData)
  }

  // 待辦事項相關函數
  const loadTodos = () => {
    const allTodos = getTodos()
    // 按創建時間降序排序（最新的在前），未完成的在前
    const sorted = allTodos.sort((a, b) => {
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1 // 未完成的在前
      }
      return new Date(b.createdAt) - new Date(a.createdAt)
    })
    setTodos(sorted)
  }
  useRealtimeKeys(['jiameng_todos'], loadTodos)
  // 排行榜／手動排名變更時重讀，不需登出再登入（calculateAllRankings 由 useEffect 依 leaderboardItems 觸發）
  useRealtimeKeys(['jiameng_leaderboard_items', 'jiameng_leaderboard_ui', 'jiameng_manual_rankings', 'jiameng_users', 'jiameng_items'], () => {
    loadLeaderboardItems()
    loadManualRankings()
  })

  const handleAddTodo = () => {
    if (!newTodoText.trim()) {
      alert('請輸入待辦事項')
      return
    }
    const result = addTodo({
      text: newTodoText.trim(),
      createdBy: currentUser
    })
    if (result.success) {
      setNewTodoText('')
      loadTodos()
    } else {
      alert(result.message || '新增失敗')
    }
  }

  const handleToggleTodo = (id) => {
    const result = toggleTodo(id)
    if (result.success) {
      loadTodos()
    }
  }

  const handleDeleteTodo = (id) => {
    if (window.confirm('確定要刪除此待辦事項嗎？')) {
      const result = deleteTodo(id)
      if (result.success) {
        loadTodos()
      }
    }
  }

  const handleUpdateTodo = (id, text) => {
    if (!text.trim()) {
      alert('待辦事項不能為空')
      return
    }
    const result = updateTodo(id, { text: text.trim() })
    if (result.success) {
      loadTodos()
    }
  }

  // 待辦建立者名稱套用名子特效（僅第一名有名子特效，無則白字）
  const getTodoCreatorNameStyle = (username) => {
    if (!username) return { color: '#FFFFFF' }
    const effects = getEquippedEffects(username)
    if (!effects.nameEffect) return { color: '#FFFFFF' }
    const effectItem = getItem(effects.nameEffect)
    if (!effectItem) return { color: '#FFFFFF' }
    const rank = effectItem.rank ?? 1
    if (rank !== 1) return { color: '#FFFFFF' }
    const leaderboardId = effectItem.leaderboardId || ''
    const leaderboard = leaderboardId ? getLeaderboardItems().find((l) => l.id === leaderboardId) : null
    const presetId = getPresetIdByRank(leaderboard, 'name', rank)
    return getStyleForPreset('name', presetId, rank) || { color: '#FFFFFF' }
  }

  // 待辦建立者名子旁裝飾（第 1、2、3 名皆可：有 nameEffect 用其榜＋名次，否則用稱號的榜＋名次）
  const getTodoCreatorDecoration = (username) => {
    if (!username) return null
    const effects = getEquippedEffects(username)
    const items = getLeaderboardItems()
    let leaderboardId = ''
    let rank = 1
    if (effects.nameEffect) {
      const effectItem = getItem(effects.nameEffect)
      if (effectItem) {
        leaderboardId = effectItem.leaderboardId || ''
        rank = effectItem.rank ?? 1
      }
    }
    if (!leaderboardId && effects.title) {
      const titleItem = getItem(effects.title)
      if (titleItem && titleItem.type === ITEM_TYPES.TITLE) {
        leaderboardId = titleItem.leaderboardId || ''
        rank = titleItem.rank ?? 1
      }
    }
    if (!leaderboardId) return null
    const leaderboard = items.find((l) => l.id === leaderboardId)
    const decoId = leaderboard?.[`decorationPresetIdRank${rank}`]
    if (decoId) {
      const deco = getDecorationById(decoId)
      if (deco) return deco
    }
    const presetId = getPresetIdByRank(leaderboard, 'name', rank)
    return getDecorationForPreset('name', presetId, rank)
  }

  // 待辦建立者稱號文字
  const getTodoCreatorTitle = (username) => {
    if (!username) return null
    const effects = getEquippedEffects(username)
    if (!effects.title) return null
    const titleItem = getItem(effects.title)
    if (!titleItem || titleItem.type !== ITEM_TYPES.TITLE) return null
    return titleItem.name || null
  }

  // 待辦建立者稱號徽章樣式
  const getTodoCreatorTitleBadgeStyle = (username) => {
    if (!username) {
      const config = getEffectDisplayConfig()
      return config.titleBadge ? { ...config.titleBadge } : {}
    }
    const effects = getEquippedEffects(username)
    if (!effects.title) {
      const config = getEffectDisplayConfig()
      return config.titleBadge ? { ...config.titleBadge } : {}
    }
    const titleItem = getItem(effects.title)
    if (!titleItem || titleItem.type !== ITEM_TYPES.TITLE) {
      const config = getEffectDisplayConfig()
      return config.titleBadge ? { ...config.titleBadge } : {}
    }
    const leaderboardId = titleItem.leaderboardId || ''
    const rank = titleItem.rank ?? 1
    const leaderboard = leaderboardId ? getLeaderboardItems().find((l) => l.id === leaderboardId) : null
    const presetId = getPresetIdByRank(leaderboard, 'title', rank)
    return getStyleForPreset('title', presetId, rank) || {}
  }

  // 保存測試記錄
  const handleSaveTestRecord = (leaderboardItemId) => {
    const manualRanks = manualRankings[leaderboardItemId] || []
    const itemRankings = rankings[leaderboardItemId] || []
    
    // 優先使用手動編輯的排名，如果沒有則使用自動計算的排名
    const currentRankings = manualRanks.length > 0 
      ? manualRanks 
      : itemRankings.slice(0, 6).map((user, idx) => ({
          rank: idx + 1,
          name: user.name,
          time: '',
          quantity: getRankingValue(user, leaderboardItems.find(i => i.id === leaderboardItemId)?.type)
        }))
    
    if (currentRankings.length === 0) {
      alert('目前沒有排名數據可保存')
      return
    }
    
    const result = addTestRecord(leaderboardItemId, currentRankings)
    if (result.success) {
      alert('測試記錄已保存')
      loadTestRecords()
    } else {
      alert('保存失敗：' + (result.message || '未知錯誤'))
    }
  }

  // 載入測試記錄
  const loadTestRecords = () => {
    const records = {}
    leaderboardItems.forEach(item => {
      records[item.id] = getTestRecords(item.id)
    })
    setTestRecords(records)
  }

  const handleAddRanking = (leaderboardItemId) => {
    const rankings = getManualRankings(leaderboardItemId)
    const leaderboardItem = leaderboardItems.find(item => item.id === leaderboardItemId)
    const hasReset = leaderboardItem?.lastResetAt ? true : false
    
    const newRanking = {
      id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
      rank: rankings.length + 1,
      name: '',
      department: uiConfig.defaultDepartment,
      time: '',
      quantity: '',
      weekQuantity: '0', // 初始化本輪累計為0
      createdAt: new Date().toISOString()
    }
    const result = addManualRanking(leaderboardItemId, newRanking)
    if (result.success) {
      loadManualRankings()
      
      // 如果是團體目標模式，重新計算進度
      const leaderboardItem = leaderboardItems.find(item => item.id === leaderboardItemId)
      const isGroupGoal = leaderboardItem?.isGroupGoal || false
      if (isGroupGoal) {
        setTimeout(() => {
          calculateAllRankings()
        }, 100)
      }
      
      // 如果是手動排行榜，添加排名後自動排序
      const isManual = leaderboardItem?.isManual || false
      if (isManual) {
        // 延遲排序，確保數據已保存
        setTimeout(() => {
          // 如果有時間數據，按時間排序；如果有數量數據，按數量排序
          const updatedRankings = getManualRankings(leaderboardItemId)
          const hasTime = updatedRankings.some(r => r.time && r.time.trim())
          const hasQuantity = updatedRankings.some(r => r.quantity && parseFloat(r.quantity) > 0)
          
          if (hasTime) {
            autoSortRankingsByTime(leaderboardItemId)
          } else if (hasQuantity) {
            autoSortRankingsByQuantity(leaderboardItemId)
          }
        }, 100)
      }
    }
  }

  // 解析時間字符串為秒數（支持多種格式：1分23秒、1:23、83秒等）
  const parseTimeToSeconds = (timeStr) => {
    if (!timeStr || !timeStr.trim()) return Infinity // 空時間排最後
    
    const str = timeStr.trim()
    
    // 格式1: "1分23秒" 或 "1分23" 或 "23秒"
    const match1 = str.match(/(?:(\d+)分)?(?:(\d+)秒)?/)
    if (match1) {
      const minutes = parseInt(match1[1] || 0)
      const seconds = parseInt(match1[2] || 0)
      if (minutes > 0 || seconds > 0) {
        return minutes * 60 + seconds
      }
    }
    
    // 格式2: "1:23" 或 "1:23:45"
    const match2 = str.match(/^(\d+):(\d+)(?::(\d+))?$/)
    if (match2) {
      const hours = parseInt(match2[1] || 0)
      const minutes = parseInt(match2[2] || 0)
      const seconds = parseInt(match2[3] || 0)
      return hours * 3600 + minutes * 60 + seconds
    }
    
    // 格式3: 純數字（視為秒數）
    const numMatch = str.match(/^(\d+)$/)
    if (numMatch) {
      return parseInt(numMatch[1])
    }
    
    return Infinity // 無法解析的時間排最後
  }

  // 根據時間自動排序並更新排名
  const autoSortRankingsByTime = (leaderboardItemId) => {
    const rankings = getManualRankings(leaderboardItemId)
    if (rankings.length === 0) return
    
    // 按時間排序（時間越短排名越前，空時間排最後）
    const sorted = [...rankings].sort((a, b) => {
      const timeA = parseTimeToSeconds(a.time)
      const timeB = parseTimeToSeconds(b.time)
      // 如果時間相同，保持原有順序
      if (timeA === timeB) {
        return 0
      }
      return timeA - timeB
    })
    
    // 更新排名數字並保存
    const updatedRankings = sorted.map((ranking, index) => ({
      ...ranking,
      rank: index + 1
    }))
    
    // 一次性保存所有更新後的排名
    saveManualRankings(leaderboardItemId, updatedRankings)
    loadManualRankings()
  }

  // 根據數量自動排序並更新排名
  const autoSortRankingsByQuantity = (leaderboardItemId) => {
    const rankings = getManualRankings(leaderboardItemId)
    if (rankings.length === 0) return
    
    // 按數量排序（數量越大排名越前，空數量排最後）
    const sorted = [...rankings].sort((a, b) => {
      const quantityA = parseFloat(a.quantity) || 0
      const quantityB = parseFloat(b.quantity) || 0
      // 如果數量相同，保持原有順序
      if (quantityA === quantityB) {
        return 0
      }
      return quantityB - quantityA // 降序排列
    })
    
    // 更新排名數字並保存
    const updatedRankings = sorted.map((ranking, index) => ({
      ...ranking,
      rank: index + 1
    }))
    
    // 一次性保存所有更新後的排名
    saveManualRankings(leaderboardItemId, updatedRankings)
    loadManualRankings()
  }

  const handleUpdateRanking = (leaderboardItemId, rankingId, field, value) => {
    // 獲取排行榜項目以判斷是否為團體目標且有重置記錄
    const leaderboardItem = leaderboardItems.find(item => item.id === leaderboardItemId)
    const isGroupGoal = leaderboardItem?.isGroupGoal || false
    const hasReset = leaderboardItem?.lastResetAt ? true : false
    
    // 如果更新的是數量字段，且是團體目標且有重置記錄，需要同步更新 weekQuantity
    const updateData = { [field]: value }
    if (field === 'quantity' && isGroupGoal && hasReset) {
      // 如果有重置記錄，手動輸入的數量應該同時更新到 weekQuantity（因為這是新一輪的數量）
      const quantityValue = parseFloat(value) || 0
      updateData.weekQuantity = quantityValue.toString()
    }
    // 如果沒有重置記錄，不需要更新 weekQuantity，團體目標會從 quantity 累加
    
    const result = updateManualRanking(leaderboardItemId, rankingId, updateData)
    if (result.success) {
      loadManualRankings()
      
      // 獲取排行榜項目以判斷排序方式
      const isManual = leaderboardItem?.isManual || false
      
      // 如果是團體目標模式且更新了數量，重新計算進度
      if (isGroupGoal && field === 'quantity') {
        setTimeout(() => {
          calculateAllRankings()
        }, 100)
      }
      
      // 手動排行榜：根據時間或數量自動排序
      if (isManual) {
        if (field === 'time') {
          setTimeout(() => {
            autoSortRankingsByTime(leaderboardItemId)
          }, 100)
        } else if (field === 'quantity') {
          setTimeout(() => {
            autoSortRankingsByQuantity(leaderboardItemId)
          }, 100)
        }
      }
    }
  }

  const handleDeleteRanking = (leaderboardItemId, rankingId) => {
    if (window.confirm('確定要刪除此排名項目嗎？')) {
      const result = deleteManualRanking(leaderboardItemId, rankingId)
      if (result.success) {
        loadManualRankings()
        
        // 如果是團體目標模式，重新計算進度
        const leaderboardItem = leaderboardItems.find(item => item.id === leaderboardItemId)
        const isGroupGoal = leaderboardItem?.isGroupGoal || false
        if (isGroupGoal) {
          setTimeout(() => {
            calculateAllRankings()
          }, 100)
        }
      }
    }
  }

  const loadLeaderboardItems = () => {
    const items = getLeaderboardItems()
    setLeaderboardItems(Array.isArray(items) ? items : [])
    // 不自動選取第一個排行榜，由使用者自行選擇
  }

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

  const calculateAllRankings = async () => {
    if (leaderboardItems.length === 0) return

    // Supabase 模式：用公開 profiles 清單（所有登入者都可取得），避免只靠本機 jiameng_users 造成分發失敗
    let users = getUsers().filter(u => u.role !== 'admin') // 排除管理者
    if (typeof isAuthSupabase === 'function' && isAuthSupabase()) {
      try {
        const profiles = await getPublicProfiles()
        if (Array.isArray(profiles) && profiles.length > 0) {
          users = profiles
            .filter(p => !p?.is_admin)
            .map(p => ({ account: p.account, name: p.display_name || p.account, role: p.is_admin ? 'admin' : 'user' }))
        }
      } catch (e) {
        console.warn('calculateAllRankings: 取得 profiles 失敗', e)
      }
    }
    const schedules = getSchedules() // 排行榜駕駛次數從此排程資訊抓取（出發駕駛、回程駕駛）
    const newRankings = {}

    // 創建名稱到帳號的映射（支持中文名稱和帳號匹配）
    const nameToAccountMap = {}
    users.forEach(user => {
      const account = user.account
      const name = user.name || user.account
      // 帳號映射到自己
      nameToAccountMap[account] = account
      // 名稱映射到帳號
      if (name && name !== account) {
        nameToAccountMap[name] = account
      }
    })

    // 輔助函數：將名稱或帳號轉換為帳號
    const getNameToAccount = (nameOrAccount) => {
      return nameToAccountMap[nameOrAccount] || nameOrAccount
    }

    // 為每個排行榜項目計算排名（不使用時間範圍過濾）
    for (const leaderboardItem of (Array.isArray(leaderboardItems) ? leaderboardItems : [])) {
      const userStats = {}

      // 初始化每個用戶的統計數據
      users.forEach(user => {
        const userName = user.account
        userStats[userName] = {
          userName,
          name: user.name || user.account,
          value: 0, // 排行榜值
          totalWorkItems: 0,
          completedItems: 0,
          totalCompletionRate: 0,
          itemsWithRate: 0,
          workDays: new Set(), // 用於計算工作天數
          departureDriverCount: 0, // 工作排程出發駕駛次數
          returnDriverCount: 0 // 工作排程回程駕駛次數
        }
      })

        // 排行榜累加邏輯：不計算今天以前的排程（只計 schedule.date >= 今日）
        const today = new Date().toISOString().split('T')[0]
        schedules.forEach(schedule => {
          if (schedule.date && schedule.date < today) return
        // 駕駛次數：抓取排程的出發駕駛、回程駕駛，每次各算 1 次；不同人則各記 1 次
        if (schedule.departureDriver) {
          const acc = getNameToAccount(String(schedule.departureDriver).trim())
          if (userStats[acc]) userStats[acc].departureDriverCount = (userStats[acc].departureDriverCount || 0) + 1
        }
        if (schedule.returnDriver) {
          const acc = getNameToAccount(String(schedule.returnDriver).trim())
          if (userStats[acc]) userStats[acc].returnDriverCount = (userStats[acc].returnDriverCount || 0) + 1
        }
        // 計算工作天數（用於時間類型）
        if (schedule.date && schedule.participants) {
          const participants = schedule.participants.split(',').map(p => p.trim())
          participants.forEach(participant => {
            // 將參與人員名稱轉換為帳號
            const participantAccount = getNameToAccount(participant)
            if (userStats[participantAccount]) {
              userStats[participantAccount].workDays.add(schedule.date)
            }
          })
        }
        
        if (schedule.workItems && schedule.workItems.length > 0) {
          schedule.workItems.forEach(item => {
            // 如果指定了工作項目類型，只計算匹配的項目
            if (leaderboardItem.workContent && item.workContent !== leaderboardItem.workContent) {
              return
            }

            // 將負責人名稱轉換為帳號
            const responsiblePerson = item.responsiblePerson
            const responsiblePersonAccount = getNameToAccount(responsiblePerson)
            if (responsiblePersonAccount && userStats[responsiblePersonAccount]) {
              const target = parseFloat(item.targetQuantity) || 0
              const actual = parseFloat(item.actualQuantity) || 0
              const completionRate = target > 0 ? (actual / target * 100) : 0
              
              userStats[responsiblePersonAccount].totalWorkItems++
              userStats[responsiblePersonAccount].totalCompletionRate += completionRate
              userStats[responsiblePersonAccount].itemsWithRate++

              if (completionRate >= 100) {
                userStats[responsiblePersonAccount].completedItems++
              }
            }
          })
        }
      })

      // 根據類型計算排行榜值
      Object.keys(userStats).forEach(userName => {
        const stats = userStats[userName]
        
        // 檢查是否為「整月無遲到」排行榜
        const isNoLateLeaderboard = leaderboardItem.title === '整月無遲到' || 
                                    leaderboardItem.name === '整月無遲到' ||
                                    leaderboardItem.workContent === '整月無遲到'
        
        if (isNoLateLeaderboard) {
          // 獲取當前月份的第一天和最後一天
          const now = new Date()
          const year = now.getFullYear()
          const month = now.getMonth()
          const startDate = new Date(year, month, 1)
          const endDate = new Date(year, month + 1, 0)
          
          // 獲取該用戶在當前月份的遲到記錄
          const lateRecords = getUserLateRecords(userName, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0])
          
          // 如果沒有遲到記錄，則上榜（值為1表示無遲到）
          stats.value = lateRecords.length === 0 ? 1 : 0
        } else {
          // 其他類型的排行榜計算
          switch (leaderboardItem.type) {
            case 'completionRate':
              stats.value = stats.itemsWithRate > 0 
                ? (stats.totalCompletionRate / stats.itemsWithRate) 
                : 0
              break
            case 'completedItems':
              stats.value = stats.completedItems
              break
            case 'workItems':
              stats.value = stats.totalWorkItems
              break
            case 'totalQuantity':
              // 計算總完成數量
              // 注意：這裡統計的是所有已累加到排行榜的數據（從手動排名數據中獲取）
              // 實際的累加邏輯在 Calendar.jsx 和 EngineeringSchedule.jsx 中
              // 這裡只負責顯示統計結果
              let totalQuantity = 0
              
              // 從手動排名數據中獲取該用戶的總累計數量
              // 注意：manualRanks 中的 name 可能是中文名稱，需要匹配帳號或用戶名
              const manualRanks = getManualRankings(leaderboardItem.id) || []
              const userRanking = manualRanks.find(r => {
                // 匹配帳號或用戶名
                const rankingName = r.name
                return rankingName === userName || 
                       rankingName === stats.name ||
                       getNameToAccount(rankingName) === userName
              })
              if (userRanking) {
                totalQuantity = parseFloat(userRanking.quantity) || 0
              }
              
              stats.value = totalQuantity
              break
            case 'totalTime':
              // 計算總工作時間（工作天數）
              stats.value = stats.workDays ? stats.workDays.size : 0
              break
            case 'driverCount':
              // 出發駕駛與回程駕駛次數合併累加
              stats.value = (stats.departureDriverCount ?? 0) + (stats.returnDriverCount ?? 0)
              break
            default:
              stats.value = 0
          }
        }
      })

      // 檢查是否為團體目標模式
      const isGroupGoal = leaderboardItem.isGroupGoal || false
      const groupGoal = parseFloat(leaderboardItem.groupGoal) || 0
      
      // 如果是團體目標模式，計算團體總進度
      if (isGroupGoal && leaderboardItem.type === 'totalQuantity') {
        let groupTotal = 0
        
        // 檢查是否有重置記錄
        const lastResetAt = leaderboardItem.lastResetAt ? new Date(leaderboardItem.lastResetAt) : null
        const hasReset = lastResetAt !== null
        
        // 從手動排名數據中累加
        const manualRanks = getManualRankings(leaderboardItem.id) || []
        
        manualRanks.forEach(ranking => {
          // ranking.name 可能是中文名稱，需要轉換為帳號來匹配
          const rankingAccount = getNameToAccount(ranking.name)
          if (hasReset) {
            // 如果有重置記錄，只計算本輪累計（weekQuantity）
            const weekQuantity = parseFloat(ranking.weekQuantity) || 0
            if (weekQuantity > 0) {
              groupTotal += weekQuantity
            }
          } else {
            // 如果沒有重置記錄，計算總數（quantity）
            const quantity = parseFloat(ranking.quantity) || 0
            if (quantity > 0) {
              groupTotal += quantity
            }
          }
        })
        
        // 更新當前進度（四捨五入為整數）
        const currentProgress = Math.round(groupTotal)
        const achievedAt = leaderboardItem.achievedAt
        let newAchievedAt = achievedAt
        let isNewAchievement = false // 標記是否為新達成
        
        // 檢查是否達成目標
        // 如果已經達成過，需要檢查是否已重置
        if (achievedAt && lastResetAt) {
          // 如果重置時間晚於達成時間，說明已經重置過，需要重新計算
          if (new Date(lastResetAt) > new Date(achievedAt)) {
            // 已重置，檢查是否再次達成
            if (currentProgress >= groupGoal && groupGoal > 0) {
              newAchievedAt = new Date().toISOString()
              isNewAchievement = true // 重置後再次達成
            }
          }
        } else if (currentProgress >= groupGoal && !achievedAt && groupGoal > 0) {
          // 首次達成目標，記錄達成時間
          newAchievedAt = new Date().toISOString()
          isNewAchievement = true // 首次達成
        }
        
        // 如果是新達成，派發全體達成獎勵（支援 Supabase 用戶列表）
        if (isNewAchievement) {
          const rewardType = leaderboardItem.rewardType || 'text'
          let allUsers = []
          if (typeof isAuthSupabase === 'function' && isAuthSupabase()) {
            try {
              const profiles = await getPublicProfiles()
              allUsers = (profiles || []).filter(p => !p?.is_admin).map(p => ({ account: p.account }))
            } catch (e) {
              console.warn('團體目標派發：取得 profiles 失敗', e)
            }
          }
          if (allUsers.length === 0) {
            const local = getUsers()
            allUsers = (Array.isArray(local) ? local : []).filter(u => u.role !== 'admin')
          }
          if (rewardType === 'item' && leaderboardItem.rewardItemId) {
            allUsers.forEach(user => {
              if (user.account) {
                addItemToInventory(user.account, leaderboardItem.rewardItemId, 1)
              }
            })
            console.log(`團體目標達成：已為所有用戶派發道具 ${leaderboardItem.rewardItemId}`)
          } else if (rewardType === 'jiameng_coin' && leaderboardItem.rewardAmount > 0) {
            allUsers.forEach(user => {
              if (user.account) {
                addWalletBalance(user.account, leaderboardItem.rewardAmount)
                addTransaction({
                  type: 'reward',
                  from: 'system',
                  to: user.account,
                  amount: leaderboardItem.rewardAmount,
                  description: `團體目標達成獎勵：${leaderboardItem.name || '團體目標'}`
                })
              }
            })
            console.log(`團體目標達成：已為所有用戶派發 ${leaderboardItem.rewardAmount} 佳盟幣`)
          }
        }
        
        // 更新進度和達成狀態
        updateLeaderboardItem(leaderboardItem.id, {
          currentProgress: currentProgress,
          achievedAt: newAchievedAt
        })
        
        // 立即更新本地狀態以反映進度變化
        setLeaderboardItems(prev => 
          prev.map(i => 
            i.id === leaderboardItem.id 
              ? { ...i, currentProgress, achievedAt: newAchievedAt }
              : i
          )
        )
      }
      
      // 轉換為數組並排序
      // 對於「整月無遲到」排行榜，只顯示無遲到的用戶（value = 1），並按姓名排序
      const isNoLateLeaderboard = leaderboardItem.title === '整月無遲到' || 
                                  leaderboardItem.name === '整月無遲到' ||
                                  leaderboardItem.workContent === '整月無遲到'
      
      let userArray = Object.values(userStats)
      if (isNoLateLeaderboard) {
        // 只保留無遲到的用戶（value = 1），並按姓名排序
        userArray = userArray.filter(user => user.value === 1).sort((a, b) => {
          const nameA = a.name || a.userName || ''
          const nameB = b.name || b.userName || ''
          return nameA.localeCompare(nameB, 'zh-TW')
        })
      } else {
        // 其他排行榜按值降序排序
        userArray = userArray.sort((a, b) => b.value - a.value)
      }
      
      newRankings[leaderboardItem.id] = userArray
    }
    
    setRankings(newRankings)
    
    // 在排名計算完成後，立即分配稱號與上榜／團體達成道具（延遲執行以避免狀態更新衝突）
    setTimeout(async () => {
      console.log('calculateAllRankings 完成，開始分配稱號、特效與上榜道具')
      await distributeTitlesAndEffects(newRankings)
    }, 500)
  }

  // 分配稱號、特效與上榜道具的獨立函數（支援 Supabase 用戶列表）
  const distributeTitlesAndEffects = async (currentRankings) => {
    if (!currentRankings || Object.keys(currentRankings).length === 0) {
      console.log('distributeTitlesAndEffects: 沒有排行榜數據')
      return
    }
    
    console.log('開始分配特效道具和稱號，排行榜數量:', Object.keys(currentRankings).length)
    const rawItems = getLeaderboardItems()
    const currentLeaderboardItems = Array.isArray(rawItems) ? rawItems : []
    const titleConfigData = getTitleConfig()
    
    // 名稱→帳號對應：Supabase 啟用時用 profiles，否則用 getUsers()
    let nameToAccountMap = {}
    let allUsersForRemove = []
    if (typeof isAuthSupabase === 'function' && isAuthSupabase()) {
      try {
        const profiles = await getPublicProfiles()
        const list = Array.isArray(profiles) ? profiles : []
        list.forEach(p => {
          if (p.account) {
            nameToAccountMap[p.account] = p.account
            const name = p.display_name || p.account
            if (name) nameToAccountMap[name] = p.account
          }
        })
        allUsersForRemove = list.map(p => ({ account: p.account, is_admin: !!p.is_admin }))
      } catch (e) {
        console.warn('distributeTitlesAndEffects: 取得 profiles 失敗', e)
      }
    }
    if (Object.keys(nameToAccountMap).length === 0) {
      const local = getUsers()
      const list = Array.isArray(local) ? local : []
      list.forEach(u => {
        nameToAccountMap[u.account] = u.account
        if (u.name) nameToAccountMap[u.name] = u.account
      })
      allUsersForRemove = list
    }
    
    const resolveToAccount = (nameOrAccount) => nameToAccountMap[nameOrAccount] || nameOrAccount
    
    Object.keys(currentRankings).forEach(leaderboardId => {
        const leaderboardItem = currentLeaderboardItems.find(item => item && item.id === leaderboardId)
        if (!leaderboardItem) return
        
        const isNoLateLeaderboard = leaderboardItem.title === '整月無遲到' || 
                                    leaderboardItem.name === '整月無遲到' ||
                                    leaderboardItem.workContent === '整月無遲到'
        
        if (isNoLateLeaderboard) return // 跳過「整月無遲到」排行榜
        
        const userArray = currentRankings[leaderboardId] || []
        
        // 此排行榜的稱號名稱（留空用全站預設）
        const lbFirst = (leaderboardItem.titleFirstPlace ?? titleConfigData.firstPlace ?? '').trim() || titleConfigData.firstPlace
        const lbSecond = (leaderboardItem.titleSecondPlace ?? titleConfigData.secondPlace ?? '').trim() || titleConfigData.secondPlace
        const lbThird = (leaderboardItem.titleThirdPlace ?? titleConfigData.thirdPlace ?? '').trim() || titleConfigData.thirdPlace
        
        // 有手動排名的排行榜：與畫面一致，依「手動排名依數量排序」取前三，並用名稱→帳號對應發放
        const manualRanks = getManualRankings(leaderboardId) || []
        
        let topThree
        if (manualRanks.length > 0) {
          const sorted = [...manualRanks].sort((a, b) => {
            const qA = parseFloat(a.quantity) || 0
            const qB = parseFloat(b.quantity) || 0
            return qB - qA
          })
          topThree = sorted.slice(0, 3).map((r, i) => ({
            userName: resolveToAccount(r.name) || r.name,
            name: r.name,
            value: parseFloat(r.quantity) || 0
          }))
        } else {
          const validUsers = userArray.filter(u => {
            const numValue = parseFloat(u.value) || 0
            return !isNaN(numValue) && numValue >= 0 && u.userName
          })
          validUsers.sort((a, b) => {
            const valA = parseFloat(a.value) || 0
            const valB = parseFloat(b.value) || 0
            return valB - valA
          })
          topThree = validUsers.slice(0, 3)
        }
        
        if (topThree.length > 0) {
          let allItems = getItems()
          // 依排行榜維度：只找此榜的稱號道具（leaderboardId 一致）
          const isThisBoardTitle = (item) => item.type === ITEM_TYPES.TITLE && (item.leaderboardId || '') === leaderboardId
          let firstTitleItem = allItems.find(item => isThisBoardTitle(item) && item.rank === 1)
          let secondTitleItem = allItems.find(item => isThisBoardTitle(item) && item.rank === 2)
          let thirdTitleItem = allItems.find(item => isThisBoardTitle(item) && item.rank === 3)
          
          let firstTitleItemCreated = false
          let secondTitleItemCreated = false
          let thirdTitleItemCreated = false
          
          if (!firstTitleItem) {
            const result = createItem({
              name: lbFirst,
              type: ITEM_TYPES.TITLE,
              description: `排行榜「${leaderboardItem.name || leaderboardId}」第一名稱號`,
              icon: '🏆',
              rank: 1,
              leaderboardId,
              price: 0
            })
            if (result.success) {
              firstTitleItem = result.item
              firstTitleItemCreated = true
              allItems = getItems()
            }
          } else if (firstTitleItem.name !== lbFirst) {
            updateItem(firstTitleItem.id, { name: lbFirst })
            allItems = getItems()
            firstTitleItem = allItems.find(item => item.id === firstTitleItem.id)
          }
          
          if (!secondTitleItem) {
            const result = createItem({
              name: lbSecond,
              type: ITEM_TYPES.TITLE,
              description: `排行榜「${leaderboardItem.name || leaderboardId}」第二名稱號`,
              icon: '🥈',
              rank: 2,
              leaderboardId,
              price: 0
            })
            if (result.success) {
              secondTitleItem = result.item
              secondTitleItemCreated = true
              allItems = getItems()
            }
          } else if (secondTitleItem.name !== lbSecond) {
            updateItem(secondTitleItem.id, { name: lbSecond })
            allItems = getItems()
            secondTitleItem = allItems.find(item => item.id === secondTitleItem.id)
          }
          
          if (!thirdTitleItem) {
            const result = createItem({
              name: lbThird,
              type: ITEM_TYPES.TITLE,
              description: `排行榜「${leaderboardItem.name || leaderboardId}」第三名稱號`,
              icon: '🥉',
              rank: 3,
              leaderboardId,
              price: 0
            })
            if (result.success) {
              thirdTitleItem = result.item
              thirdTitleItemCreated = true
              allItems = getItems()
            }
          } else if (thirdTitleItem.name !== lbThird) {
            updateItem(thirdTitleItem.id, { name: lbThird })
            allItems = getItems()
            thirdTitleItem = allItems.find(item => item.id === thirdTitleItem.id)
          }
          
          // 此排行榜的名子／發話特效道具（依名次，與稱號一致）
          const isThisBoardEffect = (item, type) => item.type === type && (item.leaderboardId || '') === leaderboardId
          let firstNameEffect = allItems.find(item => isThisBoardEffect(item, ITEM_TYPES.NAME_EFFECT) && item.rank === 1)
          let secondNameEffect = allItems.find(item => isThisBoardEffect(item, ITEM_TYPES.NAME_EFFECT) && item.rank === 2)
          let thirdNameEffect = allItems.find(item => isThisBoardEffect(item, ITEM_TYPES.NAME_EFFECT) && item.rank === 3)
          let firstMsgEffect = allItems.find(item => isThisBoardEffect(item, ITEM_TYPES.MESSAGE_EFFECT) && item.rank === 1)
          let secondMsgEffect = allItems.find(item => isThisBoardEffect(item, ITEM_TYPES.MESSAGE_EFFECT) && item.rank === 2)
          let thirdMsgEffect = allItems.find(item => isThisBoardEffect(item, ITEM_TYPES.MESSAGE_EFFECT) && item.rank === 3)
          const lbName = leaderboardItem.name || leaderboardId
          const ensureEffect = (current, type, rank, label) => {
            if (current) return current
            const r = createItem({
              name: label,
              type,
              description: `排行榜「${lbName}」第${rank}名${type === ITEM_TYPES.NAME_EFFECT ? '名子' : '發話'}特效`,
              icon: type === ITEM_TYPES.NAME_EFFECT ? '✨' : '💫',
              rank,
              leaderboardId,
              price: 0
            })
            if (r.success) { allItems = getItems(); return r.item }
            return null
          }
          firstNameEffect = ensureEffect(firstNameEffect, ITEM_TYPES.NAME_EFFECT, 1, '名子特效·第一名') || firstNameEffect
          secondNameEffect = ensureEffect(secondNameEffect, ITEM_TYPES.NAME_EFFECT, 2, '名子特效·第二名') || secondNameEffect
          thirdNameEffect = ensureEffect(thirdNameEffect, ITEM_TYPES.NAME_EFFECT, 3, '名子特效·第三名') || thirdNameEffect
          firstMsgEffect = ensureEffect(firstMsgEffect, ITEM_TYPES.MESSAGE_EFFECT, 1, '發話特效·第一名') || firstMsgEffect
          secondMsgEffect = ensureEffect(secondMsgEffect, ITEM_TYPES.MESSAGE_EFFECT, 2, '發話特效·第二名') || secondMsgEffect
          thirdMsgEffect = ensureEffect(thirdMsgEffect, ITEM_TYPES.MESSAGE_EFFECT, 3, '發話特效·第三名') || thirdMsgEffect
          allItems = getItems()
          
          // 只移除「屬於此排行榜」的稱號與名子／發話特效：非前三名收回此榜全部；前三名在下面只做「此榜其他名次」的移除與發放
          const localUsers = getUsers()
          const allUsersRaw = allUsersForRemove.length > 0 ? allUsersForRemove : (Array.isArray(localUsers) ? localUsers : [])
          const allUsers = allUsersRaw.filter(u => !u?.is_admin && u?.role !== 'admin')
          allUsers.forEach(user => {
            const userAccount = user.account
            const isInTopThree = topThree.some(t => t.userName === userAccount)
            const userInventory = getUserInventory(userAccount)
            userInventory.forEach(inv => {
              const item = allItems.find(i => i.id === inv.itemId)
              if (!item || (item.leaderboardId || '') !== leaderboardId) return
              const isThisBoardReward = item.type === ITEM_TYPES.TITLE || item.type === ITEM_TYPES.NAME_EFFECT || item.type === ITEM_TYPES.MESSAGE_EFFECT
              if (!isThisBoardReward) return
              if (isInTopThree) return // 前三名在下面只做「此榜其他名次」的移除與發放
              removeItemFromInventory(userAccount, item.id, inv.quantity)
            })
          })
          
          const tryGive = (userName, rewardItem, created) => {
            if (!userName || !rewardItem) return
            const inv = getUserInventory(userName)
            const has = inv.some(i => i.itemId === rewardItem.id && i.quantity > 0)
            if (!has || created) addItemToInventory(userName, rewardItem.id, 1)
            else {
              const actual = getUserInventory(userName)
              if (!actual.some(i => i.itemId === rewardItem.id && i.quantity > 0)) addItemToInventory(userName, rewardItem.id, 1)
            }
          }
          
          const removeThisBoardOtherRank = (userName, rank) => {
            const inv = getUserInventory(userName)
            inv.forEach(invEntry => {
              const item = allItems.find(i => i.id === invEntry.itemId)
              if (!item || (item.leaderboardId || '') !== leaderboardId) return
              if ((item.type !== ITEM_TYPES.TITLE && item.type !== ITEM_TYPES.NAME_EFFECT && item.type !== ITEM_TYPES.MESSAGE_EFFECT)) return
              if (item.rank === rank) return
              removeItemFromInventory(userName, item.id, invEntry.quantity)
            })
          }
          
          // 發放前依「此榜 + 名次」重新從 getItems() 取最新道具，避免 id 重複或引用錯亂
          const freshItems = getItems()
          const titleByRank = (r) => freshItems.find(i => i.type === ITEM_TYPES.TITLE && (i.leaderboardId || '') === leaderboardId && i.rank === r)
          const nameEffectByRank = (r) => freshItems.find(i => i.type === ITEM_TYPES.NAME_EFFECT && (i.leaderboardId || '') === leaderboardId && i.rank === r)
          const msgEffectByRank = (r) => freshItems.find(i => i.type === ITEM_TYPES.MESSAGE_EFFECT && (i.leaderboardId || '') === leaderboardId && i.rank === r)
          // 只有第一名會有名子特效：第二、三名收回此榜的名子特效道具
          const removeNameEffectForBoard = (userName) => {
            const inv = getUserInventory(userName)
            inv.forEach(invEntry => {
              const item = freshItems.find(i => i.id === invEntry.itemId)
              if (!item || item.type !== ITEM_TYPES.NAME_EFFECT || (item.leaderboardId || '') !== leaderboardId) return
              removeItemFromInventory(userName, item.id, invEntry.quantity)
            })
          }
          
          // 非手動榜時，僅對「該榜數值 > 0」的前三名發放獎勵，避免新帳號（value 0）被誤發稱號與特效
          const shouldGiveRank = (index) => manualRanks.length > 0 || (parseFloat(topThree[index]?.value) || 0) > 0

          // 第一名：移除此榜且非第一名的稱號／名子／發話特效，再發放此榜第一名的稱號、名子特效、發話特效
          if (topThree[0] && shouldGiveRank(0)) {
            const firstUserName = topThree[0].userName
            removeThisBoardOtherRank(firstUserName, 1)
            tryGive(firstUserName, titleByRank(1), firstTitleItemCreated)
            tryGive(firstUserName, nameEffectByRank(1), false)
            tryGive(firstUserName, msgEffectByRank(1), false)
          }

          // 第二名：只發稱號與發話特效，不發名子特效；並收回此榜名子特效
          if (topThree[1] && shouldGiveRank(1)) {
            const secondUserName = topThree[1].userName
            removeThisBoardOtherRank(secondUserName, 2)
            removeNameEffectForBoard(secondUserName)
            tryGive(secondUserName, titleByRank(2), secondTitleItemCreated)
            tryGive(secondUserName, msgEffectByRank(2), false)
          }

          // 第三名：只發稱號與發話特效，不發名子特效；並收回此榜名子特效
          if (topThree[2] && shouldGiveRank(2)) {
            const thirdUserName = topThree[2].userName
            removeThisBoardOtherRank(thirdUserName, 3)
            removeNameEffectForBoard(thirdUserName)
            tryGive(thirdUserName, titleByRank(3), thirdTitleItemCreated)
            tryGive(thirdUserName, msgEffectByRank(3), false)
          }

          // 上榜道具：前三名依排行榜設定的獎勵類型發放道具或佳盟幣（與團體目標分開，此為「上榜」獎勵）
          const rewardType = leaderboardItem.rewardType || 'text'
          const rewardAmount = parseInt(leaderboardItem.rewardAmount, 10) || 0
          const rewardItemId = leaderboardItem.rewardItemId || ''
          ;[0, 1, 2].forEach(idx => {
            if (!topThree[idx] || !shouldGiveRank(idx)) return
            const account = topThree[idx].userName
            if (!account) return
            if (rewardType === 'item' && rewardItemId) {
              const qty = Math.max(1, rewardAmount)
              addItemToInventory(account, rewardItemId, qty)
            } else if (rewardType === 'jiameng_coin' && rewardAmount > 0) {
              addWalletBalance(account, rewardAmount)
              addTransaction({
                type: 'reward',
                from: 'system',
                to: account,
                amount: rewardAmount,
                description: `排行榜「${leaderboardItem.name || leaderboardId}」上榜獎勵`
              })
            }
          })

          // 在非手動榜下，前三名中數值為 0 的用戶不發獎勵，並收回此榜全部稱號／特效（rank 0 表示全部移除），避免新帳號或無貢獻者保留舊獎勵
          ;[0, 1, 2].forEach((idx) => {
            if (!topThree[idx] || shouldGiveRank(idx)) return
            removeThisBoardOtherRank(topThree[idx].userName, 0)
          })
        }
      })
  }

  // 為上榜用戶自動給予特效道具和稱號（useEffect 作為備用觸發）
  useEffect(() => {
    if (Object.keys(rankings).length === 0) {
      console.log('useEffect: rankings 為空，跳過分配')
      return
    }
    console.log('useEffect: 觸發稱號分配，排行榜數量:', Object.keys(rankings).length)
    distributeTitlesAndEffects(rankings)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.keys(rankings).length])

  const getRankingValue = (user, itemType, leaderboardItem = null) => {
    if (!itemType) return ''

    // 檢查是否為「整月無遲到」排行榜
    const isNoLateLeaderboard = leaderboardItem && (
      leaderboardItem.title === '整月無遲到' || 
      leaderboardItem.name === '整月無遲到' ||
      leaderboardItem.workContent === '整月無遲到'
    )
    
    if (isNoLateLeaderboard) {
      // 對於「整月無遲到」，顯示空字符串或「無遲到」
      return '無遲到'
    }

    switch (itemType) {
      case 'completionRate':
        return `${user.value.toFixed(1)}%`
      case 'completedItems':
        return `${user.value}項`
      case 'workItems':
        return `${user.value}項`
      case 'totalQuantity':
        return `${user.value.toFixed(1)}`
      case 'totalTime':
        return `${user.value}天`
      case 'danmuCount':
        return `${user.value}次`
      case 'driverCount':
        return `${user.value}次`
      default:
        return `${user.value}`
    }
  }

  const handleAddItem = () => {
    setEditingItem(null)
    setEditForm({
      name: '',
      type: 'completionRate',
      workContent: '',
      isManual: false,
      isGroupGoal: false,
      groupGoal: 0,
      rewardType: 'text',
      reward: '',
      rewardAmount: 0,
      rewardItemId: '',
      currentProgress: 0,
      achievedAt: null,
      lastResetAt: null,
        titleFirstPlace: '', titleSecondPlace: '', titleThirdPlace: '',
        nameEffectPresetId: '', messageEffectPresetId: '', titleBadgePresetId: '',
    nameEffectPresetIdRank1: '', nameEffectPresetIdRank2: '', nameEffectPresetIdRank3: '',
    messageEffectPresetIdRank1: '', messageEffectPresetIdRank2: '', messageEffectPresetIdRank3: '',
    titleBadgePresetIdRank1: '', titleBadgePresetIdRank2: '', titleBadgePresetIdRank3: '',
    decorationPresetIdRank1: '', decorationPresetIdRank2: '', decorationPresetIdRank3: ''
    })
    setExpandEditTitles(false)
    setExpandEditEffects(false)
    setShowEditModal(true)
  }

  const handleEditItem = (item) => {
    setEditingItem(item)
    const defaultTitles = getTitleConfig()
    setEditForm({
      name: item.name,
      type: item.type,
      workContent: item.workContent || '',
      isManual: item.isManual || false,
      isGroupGoal: item.isGroupGoal || false,
      groupGoal: item.groupGoal || 0,
      rewardType: item.rewardType || 'text',
      reward: item.reward || '',
      rewardAmount: item.rewardAmount || 0,
      rewardItemId: item.rewardItemId || '',
      currentProgress: item.currentProgress || 0,
      achievedAt: item.achievedAt || null,
      lastResetAt: item.lastResetAt || null,
      titleFirstPlace: item.titleFirstPlace ?? defaultTitles.firstPlace ?? '',
      titleSecondPlace: item.titleSecondPlace ?? defaultTitles.secondPlace ?? '',
      titleThirdPlace: item.titleThirdPlace ?? defaultTitles.thirdPlace ?? '',
      nameEffectPresetId: item.nameEffectPresetId ?? '',
      messageEffectPresetId: item.messageEffectPresetId ?? '',
      titleBadgePresetId: item.titleBadgePresetId ?? '',
      nameEffectPresetIdRank1: item.nameEffectPresetIdRank1 ?? '', nameEffectPresetIdRank2: item.nameEffectPresetIdRank2 ?? '', nameEffectPresetIdRank3: item.nameEffectPresetIdRank3 ?? '',
      messageEffectPresetIdRank1: item.messageEffectPresetIdRank1 ?? '', messageEffectPresetIdRank2: item.messageEffectPresetIdRank2 ?? '', messageEffectPresetIdRank3: item.messageEffectPresetIdRank3 ?? '',
      titleBadgePresetIdRank1: item.titleBadgePresetIdRank1 ?? '', titleBadgePresetIdRank2: item.titleBadgePresetIdRank2 ?? '', titleBadgePresetIdRank3: item.titleBadgePresetIdRank3 ?? '',
      decorationPresetIdRank1: item.decorationPresetIdRank1 ?? '', decorationPresetIdRank2: item.decorationPresetIdRank2 ?? '', decorationPresetIdRank3: item.decorationPresetIdRank3 ?? ''
    })
    setExpandEditTitles(false)
    setExpandEditEffects(false)
    setShowEditModal(true)
  }

  const handleSaveItem = () => {
    if (!editForm.name.trim()) {
      alert('請輸入項目名稱')
      return
    }

    if (editingItem) {
      const result = updateLeaderboardItem(editingItem.id, editForm)
      if (result.success) {
        alert('更新成功')
        loadLeaderboardItems()
        setShowEditModal(false)
        setEditingItem(null)
        setEditForm({
          name: '',
          type: 'completionRate',
          workContent: '',
          isManual: false,
          isGroupGoal: false,
          groupGoal: 0,
          rewardType: 'text',
          reward: '',
          rewardAmount: 0,
          rewardItemId: '',
          currentProgress: 0,
          achievedAt: null,
          lastResetAt: null,
          titleFirstPlace: '', titleSecondPlace: '', titleThirdPlace: '',
          nameEffectPresetId: '', messageEffectPresetId: '', titleBadgePresetId: '',
          nameEffectPresetIdRank1: '', nameEffectPresetIdRank2: '', nameEffectPresetIdRank3: '',
          messageEffectPresetIdRank1: '', messageEffectPresetIdRank2: '', messageEffectPresetIdRank3: '',
          titleBadgePresetIdRank1: '', titleBadgePresetIdRank2: '', titleBadgePresetIdRank3: '',
          decorationPresetIdRank1: '', decorationPresetIdRank2: '', decorationPresetIdRank3: ''
        })
      } else {
        alert(result.message || '更新失敗')
      }
    } else {
      const result = addLeaderboardItem(editForm)
      if (result.success) {
        alert('添加成功')
        loadLeaderboardItems()
        setShowEditModal(false)
        setEditForm({
          name: '',
          type: 'completionRate',
          workContent: '',
          isManual: false,
          isGroupGoal: false,
          groupGoal: 0,
          rewardType: 'text',
          reward: '',
          rewardAmount: 0,
          rewardItemId: '',
          currentProgress: 0,
          achievedAt: null,
          lastResetAt: null,
          titleFirstPlace: '', titleSecondPlace: '', titleThirdPlace: '',
          nameEffectPresetId: '', messageEffectPresetId: '', titleBadgePresetId: '',
          nameEffectPresetIdRank1: '', nameEffectPresetIdRank2: '', nameEffectPresetIdRank3: '',
          messageEffectPresetIdRank1: '', messageEffectPresetIdRank2: '', messageEffectPresetIdRank3: '',
          titleBadgePresetIdRank1: '', titleBadgePresetIdRank2: '', titleBadgePresetIdRank3: ''
        })
      } else {
        alert(result.message || '添加失敗')
      }
    }
  }

  const handleDeleteItem = (id) => {
    if (!window.confirm('確定要刪除此排行榜面板嗎？這將同時刪除該面板的所有排名數據，並移除所有屬於此榜的稱號／名子／發話特效道具，不保留。')) return
    
    const result = deleteLeaderboardItem(id)
    if (result.success) {
      // 同時刪除該項目的手動排名數據
      try {
        const allRankings = localStorage.getItem('jiameng_manual_rankings')
        if (allRankings) {
          const data = JSON.parse(allRankings)
          delete data[id]
          localStorage.setItem('jiameng_manual_rankings', JSON.stringify(data))
        }
      } catch (error) {
        console.error('Error deleting manual rankings:', error)
      }

      // 移除此排行榜所有特殊道具（稱號、名子特效、發話特效）：卸下裝備 → 清空所有人背包內該類道具 → 刪除道具定義，不保留
      try {
        const items = getItems()
        const specialItems = items.filter(
          (i) => (i.leaderboardId || '') === id && (i.type === ITEM_TYPES.TITLE || i.type === ITEM_TYPES.NAME_EFFECT || i.type === ITEM_TYPES.MESSAGE_EFFECT)
        )
        const specialIds = new Set(specialItems.map((i) => i.id))

        // 若有屬於此榜的特殊道具，先卸下所有用戶的裝備、再從背包移除、最後刪除道具
        if (specialIds.size > 0) {
          const allEquipped = getAllEquippedEffects()
          Object.keys(allEquipped || {}).forEach((username) => {
            const e = allEquipped[username] || {}
            if (e.nameEffect && specialIds.has(e.nameEffect)) unequipEffect(username, 'name')
            if (e.messageEffect && specialIds.has(e.messageEffect)) unequipEffect(username, 'message')
            if (e.title && specialIds.has(e.title)) unequipEffect(username, 'title')
          })
          getUsers().forEach((user) => {
            const inv = getUserInventory(user.account)
            inv.forEach((invEntry) => {
              if (specialIds.has(invEntry.itemId)) removeItemFromInventory(user.account, invEntry.itemId, invEntry.quantity)
            })
          })
          specialItems.forEach((item) => deleteItem(item.id))
        }
      } catch (error) {
        console.error('Error removing special items for deleted leaderboard:', error)
      }
      
      alert('刪除成功')
      loadLeaderboardItems()
      loadManualRankings()
    } else {
      alert(result.message || '刪除失敗')
    }
  }

  const handleClearAll = () => {
    if (!window.confirm('確定要清空所有排行榜面板嗎？此操作無法復原，將刪除所有面板和排名數據。')) return
    
    try {
      // 清空所有排行榜項目
      localStorage.removeItem('jiameng_leaderboard_items')
      
      // 清空所有手動排名數據
      localStorage.removeItem('jiameng_manual_rankings')
      
      // 重新初始化
      setLeaderboardItems([])
      setRankings({})
      setManualRankings({})
      setSelectedRankingId(null)
      
      alert('已清空所有版面')
      loadLeaderboardItems()
      loadManualRankings()
    } catch (error) {
      console.error('Error clearing all:', error)
      alert('清空失敗')
    }
  }

  const handleEditUIElement = (field, value) => {
    const updatedConfig = { ...uiConfig, [field]: value }
    setUIConfig(updatedConfig)
    setUIConfigForm(updatedConfig)
    // 立即保存
    saveLeaderboardUIConfig(updatedConfig)
  }

  const getRankColor = (rank) => {
    if (rank === 1) return 'bg-yellow-400 text-gray-900' // 金牌
    if (rank === 2) return 'bg-gray-300 text-gray-900'   // 銀牌
    if (rank === 3) return 'bg-orange-400 text-white'     // 銅牌
    return 'bg-gray-700 text-white'
  }

  const getMedalIcon = (rank) => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return ''
  }

  return (
    <>
      {/* 優化的發光動畫樣式 */}
      <style>{`
        @keyframes glow {
          0%, 100% {
            text-shadow: 0 0 8px rgba(251, 191, 36, 0.4),
                         0 0 16px rgba(251, 191, 36, 0.3),
                         0 0 24px rgba(251, 191, 36, 0.2);
            filter: brightness(1);
          }
          50% {
            text-shadow: 0 0 12px rgba(251, 191, 36, 0.6),
                         0 0 24px rgba(251, 191, 36, 0.4),
                         0 0 36px rgba(251, 191, 36, 0.3),
                         0 0 48px rgba(251, 191, 36, 0.2);
            filter: brightness(1.1);
          }
        }
        @keyframes radiateGlow {
          0% {
            text-shadow: 0 0 10px rgba(251, 191, 36, 0.5),
                         0 0 20px rgba(251, 191, 36, 0.4),
                         0 0 30px rgba(251, 191, 36, 0.3),
                         0 0 40px rgba(251, 191, 36, 0.2),
                         0 0 50px rgba(251, 191, 36, 0.1);
            filter: brightness(1);
            transform: scale(1);
          }
          50% {
            text-shadow: 0 0 20px rgba(251, 191, 36, 0.8),
                         0 0 40px rgba(251, 191, 36, 0.6),
                         0 0 60px rgba(251, 191, 36, 0.4),
                         0 0 80px rgba(251, 191, 36, 0.3),
                         0 0 100px rgba(251, 191, 36, 0.2),
                         0 0 120px rgba(251, 191, 36, 0.1);
            filter: brightness(1.3);
            transform: scale(1.02);
          }
          100% {
            text-shadow: 0 0 10px rgba(251, 191, 36, 0.5),
                         0 0 20px rgba(251, 191, 36, 0.4),
                         0 0 30px rgba(251, 191, 36, 0.3),
                         0 0 40px rgba(251, 191, 36, 0.2),
                         0 0 50px rgba(251, 191, 36, 0.1);
            filter: brightness(1);
            transform: scale(1);
          }
        }
        @keyframes clickGlow {
          0% {
            text-shadow: 0 0 10px rgba(251, 191, 36, 0.5),
                         0 0 20px rgba(251, 191, 36, 0.4),
                         0 0 30px rgba(251, 191, 36, 0.3);
            filter: brightness(1);
            transform: scale(1);
          }
          40% {
            text-shadow: 0 0 24px rgba(251, 191, 36, 0.9),
                         0 0 48px rgba(251, 191, 36, 0.7),
                         0 0 72px rgba(251, 191, 36, 0.5),
                         0 0 96px rgba(251, 191, 36, 0.3);
            filter: brightness(1.4);
            transform: scale(1.05);
          }
          100% {
            text-shadow: 0 0 10px rgba(251, 191, 36, 0.5),
                         0 0 20px rgba(251, 191, 36, 0.4),
                         0 0 30px rgba(251, 191, 36, 0.3);
            filter: brightness(1);
            transform: scale(1);
          }
        }
        @keyframes premiumGlow {
          0%, 100% {
            text-shadow: 0 0 15px rgba(255, 255, 255, 0.6),
                         0 0 30px rgba(255, 255, 255, 0.4),
                         0 0 45px rgba(255, 255, 255, 0.3),
                         0 2px 4px rgba(0, 0, 0, 0.4);
            filter: brightness(1) drop-shadow(0 0 8px rgba(255, 255, 255, 0.3));
          }
          50% {
            text-shadow: 0 0 25px rgba(255, 255, 255, 0.9),
                         0 0 50px rgba(255, 255, 255, 0.7),
                         0 0 75px rgba(255, 255, 255, 0.5),
                         0 0 100px rgba(255, 255, 255, 0.3),
                         0 2px 4px rgba(0, 0, 0, 0.4);
            filter: brightness(1.15) drop-shadow(0 0 15px rgba(255, 255, 255, 0.5));
          }
        }
        @keyframes elegantShimmer {
          0% {
            background-position: -200% center;
          }
          100% {
            background-position: 200% center;
          }
        }
        @keyframes subtlePulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.95;
            transform: scale(1.01);
          }
        }
        @keyframes nobleSparkle {
          0%, 100% {
            background: linear-gradient(135deg, #d4af37 0%, #f4e4bc 50%, #d4af37 100%);
            box-shadow: 0 0 20px rgba(212, 175, 55, 0.3),
                        0 0 40px rgba(212, 175, 55, 0.2),
                        inset 0 0 20px rgba(255, 255, 255, 0.1);
            filter: brightness(1);
          }
          25% {
            background: linear-gradient(135deg, #f4e4bc 0%, #d4af37 50%, #f4e4bc 100%);
            box-shadow: 0 0 30px rgba(212, 175, 55, 0.5),
                        0 0 60px rgba(212, 175, 55, 0.3),
                        inset 0 0 30px rgba(255, 255, 255, 0.2);
            filter: brightness(1.15);
          }
          50% {
            background: linear-gradient(135deg, #ffd700 0%, #f4e4bc 50%, #ffd700 100%);
            box-shadow: 0 0 40px rgba(255, 215, 0, 0.6),
                        0 0 80px rgba(255, 215, 0, 0.4),
                        inset 0 0 40px rgba(255, 255, 255, 0.3);
            filter: brightness(1.3);
          }
          75% {
            background: linear-gradient(135deg, #f4e4bc 0%, #d4af37 50%, #f4e4bc 100%);
            box-shadow: 0 0 30px rgba(212, 175, 55, 0.5),
                        0 0 60px rgba(212, 175, 55, 0.3),
                        inset 0 0 30px rgba(255, 255, 255, 0.2);
            filter: brightness(1.15);
          }
        }
        @keyframes textSparkle {
          0%, 100% {
            text-shadow: 0 0 10px rgba(255, 255, 255, 0.8),
                         0 0 20px rgba(255, 255, 255, 0.6),
                         0 0 30px rgba(255, 255, 255, 0.4),
                         0 2px 4px rgba(0, 0, 0, 0.3);
            filter: brightness(1);
          }
          50% {
            text-shadow: 0 0 20px rgba(255, 255, 255, 1),
                         0 0 40px rgba(255, 255, 255, 0.8),
                         0 0 60px rgba(255, 255, 255, 0.6),
                         0 0 80px rgba(255, 255, 255, 0.4),
                         0 2px 4px rgba(0, 0, 0, 0.3);
            filter: brightness(1.2);
          }
        }
        /* 待辦建立者名子旁裝飾動畫（與交流區一致） */
        @keyframes decorationBounce1 {
          0%, 100% { transform: translateY(0) scale(1); opacity: 1; }
          50% { transform: translateY(-4px) scale(1.2); opacity: 0.9; }
        }
        @keyframes decorationBounce2 {
          0%, 100% { transform: translateY(0) scale(0.9); opacity: 0.9; }
          50% { transform: translateY(-2px) scale(1); opacity: 1; }
        }
        @keyframes decorationBounce3 {
          0%, 100% { transform: translateY(0); opacity: 0.7; }
          50% { transform: translateY(-1px); opacity: 0.85; }
        }
        @keyframes decorationTwinkle {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
        @keyframes decorationFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes decorationPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.85; }
        }
        @keyframes decorationSwing {
          0%, 100% { transform: rotate(-8deg); }
          50% { transform: rotate(8deg); }
        }
        @keyframes decorationSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .decoration-bounce-1 { display: inline-block; animation: decorationBounce1 1s ease-in-out infinite; margin-left: 2px; }
        .decoration-bounce-2 { display: inline-block; animation: decorationBounce2 1.5s ease-in-out infinite; margin-left: 2px; }
        .decoration-bounce-3 { display: inline-block; animation: decorationBounce3 2s ease-in-out infinite; margin-left: 2px; }
        .decoration-twinkle { display: inline-block; animation: decorationTwinkle 0.8s ease-in-out infinite; margin-left: 2px; }
        .decoration-float { display: inline-block; animation: decorationFloat 1.2s ease-in-out infinite; margin-left: 2px; }
        .decoration-pulse { display: inline-block; animation: decorationPulse 1s ease-in-out infinite; margin-left: 2px; }
        .decoration-swing { display: inline-block; animation: decorationSwing 1s ease-in-out infinite; margin-left: 2px; }
        .decoration-spin { display: inline-block; animation: decorationSpin 2s linear infinite; margin-left: 2px; }
      `}</style>
      <div className="bg-charcoal rounded-lg p-4 sm:p-6 min-h-screen">
      {/* 眉條 - 頂部標題橫幅（手機垂直排列、按鈕整齊不溢出） */}
      <div 
        className="rounded-t-lg px-4 py-3 sm:px-6 sm:py-4 mb-4 sm:mb-6 overflow-hidden"
        style={{
          background: 'linear-gradient(90deg, #1a1a1a 0%, #2a2a2a 50%, #1a1a1a 100%)',
          borderBottom: '2px solid rgba(251, 191, 36, 0.3)'
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
          <div className="flex-shrink-0 min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-yellow-400 mb-1 truncate">首頁</h2>
            <p className="text-gray-300 text-sm truncate">歡迎使用佳盟事業群企業管理系統</p>
          </div>
          {userRole === 'admin' && (
            <div className="flex flex-wrap gap-2 sm:gap-2 justify-start sm:justify-end min-w-0">
              <button
                onClick={handleAddItem}
                className="bg-yellow-400 text-gray-900 px-3 py-2.5 sm:px-4 sm:py-2 rounded hover:bg-yellow-500 transition-colors font-semibold text-sm flex items-center gap-1.5 min-h-[44px] shrink-0"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="truncate">新增排行榜面板</span>
              </button>
              <button
                onClick={() => {
                  setEffectDisplayForm(getEffectDisplayConfig())
                  setEffectConfigTab('name')
                  setShowEffectConfigModal(true)
                }}
                className="bg-indigo-500 text-white px-3 py-2.5 sm:px-4 sm:py-2 rounded hover:bg-indigo-600 transition-colors font-semibold text-sm flex items-center gap-1.5 min-h-[44px] shrink-0"
              >
                <span className="shrink-0">✨</span>
                <span className="truncate">特效設定</span>
              </button>
              <button
                onClick={() => {
                  setShowTypeModal(true)
                  setEditingType(null)
                  setTypeForm({ name: '', titleFirstPlace: '', titleSecondPlace: '', titleThirdPlace: '', nameEffectPresetId: '', messageEffectPresetId: '', titleBadgePresetId: '', ...emptyRankEffects() })
                  setLeaderboardTypes(getLeaderboardTypes())
                }}
                className="bg-amber-600 text-white px-3 py-2.5 sm:px-4 sm:py-2 rounded hover:bg-amber-500 transition-colors font-semibold text-sm flex items-center gap-1.5 min-h-[44px] shrink-0"
              >
                <span className="shrink-0">📋</span>
                <span className="truncate">排行榜類型</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 待辦事項區塊（字體比照行事曆） */}
      <div className="bg-gray-800 rounded-lg p-3 sm:p-5 border border-gray-700 mb-4">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h3 className="text-sm sm:text-base font-bold text-yellow-400">待辦事項</h3>
        </div>
        
        {/* 新增待辦事項（可換行，字體小一點） */}
        <div className="mb-3 sm:mb-4 flex flex-wrap gap-2">
          <input
            type="text"
            value={newTodoText}
            onChange={(e) => setNewTodoText(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleAddTodo()
              }
            }}
            placeholder="輸入待辦事項..."
            className="flex-1 min-w-[200px] bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-[10px] sm:text-xs focus:outline-none focus:border-yellow-400 min-h-[36px] sm:min-h-0"
          />
          <button
            onClick={handleAddTodo}
            className="bg-yellow-400 text-gray-900 px-3 py-1.5 rounded hover:bg-yellow-500 transition-colors font-semibold text-[10px] sm:text-xs min-h-[36px] sm:min-h-0 whitespace-nowrap"
          >
            新增
          </button>
        </div>

        {/* 待辦事項列表 */}
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {todos.length === 0 ? (
            <div className="text-gray-400 text-center py-6">
              <p className="text-[10px] sm:text-xs">尚無待辦事項</p>
            </div>
          ) : (
            todos.map((todo) => (
              <div
                key={todo.id}
                className={`flex items-center gap-2 p-2 sm:p-2.5 bg-gray-900 rounded border border-gray-700 hover:bg-gray-850 ${
                  todo.completed ? 'opacity-60' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={todo.completed}
                  onChange={() => handleToggleTodo(todo.id)}
                  className="w-5 h-5 text-yellow-400 bg-gray-700 border-gray-600 rounded focus:ring-yellow-400 focus:ring-2"
                />
                <div className="flex-1 flex items-center gap-1.5 min-w-0">
                  {todo.completed ? (
                    <span className="text-gray-500 line-through flex-1 text-xs sm:text-sm truncate">{todo.text}</span>
                  ) : (
                    <input
                      type="text"
                      value={todo.text}
                      onChange={(e) => handleUpdateTodo(todo.id, e.target.value)}
                      onBlur={(e) => {
                        if (e.target.value.trim() !== todo.text) {
                          handleUpdateTodo(todo.id, e.target.value)
                        }
                      }}
                      className="flex-1 min-w-0 bg-transparent border-b border-transparent hover:border-gray-500 focus:border-yellow-400 text-white text-xs sm:text-sm focus:outline-none"
                    />
                  )}
                  {todo.createdBy && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] sm:text-xs flex-wrap flex-shrink-0">
                      <span style={getTodoCreatorNameStyle(todo.createdBy)}>({todo.createdBy})</span>
                      {(() => {
                        const deco = getTodoCreatorDecoration(todo.createdBy)
                        return deco ? <span className={deco.className}>{deco.emoji}</span> : null
                      })()}
                      {(() => {
                        const t = getTodoCreatorTitle(todo.createdBy)
                        return t ? (
                          <span className="font-bold rounded ml-0.5" style={getTodoCreatorTitleBadgeStyle(todo.createdBy)}>{t}</span>
                        ) : null
                      })()}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleDeleteTodo(todo.id)}
                  className="text-red-400 hover:text-red-300 text-xs flex-shrink-0"
                  title="刪除"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 排行榜 - 海報風格樣式；寬度跟首頁主體一致（不做置中變窄） */}
      <div className="relative rounded-lg overflow-hidden shadow-2xl min-h-[320px] sm:min-h-[500px] lg:min-h-[800px] w-full" style={{
        background: 'linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 50%, #0f0f0f 100%)',
        position: 'relative'
      }}>
        {/* 背景裝飾 - 金色光線效果 */}
        <div className="absolute inset-0" style={{
          background: `
            radial-gradient(ellipse at top right, rgba(251, 191, 36, 0.15) 0%, transparent 50%),
            linear-gradient(135deg, transparent 0%, rgba(251, 191, 36, 0.05) 50%, transparent 100%),
            linear-gradient(45deg, transparent 0%, rgba(251, 191, 36, 0.03) 50%, transparent 100%)
          `
        }}></div>
        
        {/* 幾何線條圖案 */}
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: `
            repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(251, 191, 36, 0.1) 2px, rgba(251, 191, 36, 0.1) 4px),
            repeating-linear-gradient(-45deg, transparent, transparent 2px, rgba(251, 191, 36, 0.1) 2px, rgba(251, 191, 36, 0.1) 4px)
          `,
          backgroundSize: '40px 40px'
        }}></div>
        
        {/* 內容區域：手機加大間距、排行榜卡片不擠在一起 */}
        <div className="relative p-3 sm:p-4 lg:p-6">
          {/* 控制選項：手機加大按鈕間距 */}
          {userRole === 'admin' && (
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4 sm:mb-4">
              <button
                type="button"
                onClick={handleAddItem}
                className="bg-yellow-400 text-gray-900 px-3 py-2.5 sm:px-3 rounded-lg hover:bg-yellow-500 active:bg-yellow-500 transition-colors font-semibold min-h-[44px] touch-manipulation text-sm"
              >
                新增項目
              </button>
              {leaderboardItems.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="bg-red-500 text-white px-3 py-2.5 sm:px-3 rounded-lg hover:bg-red-600 active:bg-red-600 transition-colors font-semibold min-h-[44px] touch-manipulation text-sm"
                >
                  清空所有版面
                </button>
              )}
            </div>
          )}

          {/* 排行榜：自動依可用寬度排欄位；面板數量少時會拉寬填滿左右 */}
          <div className="grid gap-3 sm:gap-4 items-stretch w-full min-w-0 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
            {leaderboardItems.length === 0 ? (
              <div className="col-span-full text-center py-8">
                <p className="text-[10px] sm:text-xs text-gray-400 mb-3">尚無排行榜項目</p>
                {userRole === 'admin' && (
                  <button
                    onClick={handleAddItem}
                    className="bg-yellow-400 text-gray-900 px-4 py-2 rounded hover:bg-yellow-500 transition-colors font-semibold text-xs sm:text-sm"
                  >
                    + 新增排行榜面板
                  </button>
                )}
              </div>
            ) : (
              (Array.isArray(leaderboardItems) ? leaderboardItems : []).map((item, index) => {
                if (!item || !item.id) return null
                const itemRankings = (rankings[item.id] || []).slice(0, 6)
                const manualRanks = manualRankings[item.id] || []
                
                // 檢查排行榜是否被觸發
                // 手動排行榜：只要有排名數據就顯示
                // 工作進度排行榜：需要有實際完成數量 > 0
                const isManual = item.isManual || false
                let hasValidRankings
                
                if (isManual) {
                  // 手動排行榜：只要有排名數據就顯示
                  hasValidRankings = manualRanks.length > 0
                } else {
                  // 非手動：手動有數量 > 0 則算有效；若無手動數據則看自動計算結果（如駕駛次數來自排程）
                  const hasManualQty = manualRanks.some(ranking => {
                    const quantity = parseFloat(ranking.quantity) || 0
                    return quantity > 0
                  })
                  const calcList = rankings[item.id] || []
                  const hasCalcQty = calcList.some(u => (u.value ?? 0) > 0)
                  hasValidRankings = hasManualQty || (manualRanks.length === 0 && hasCalcQty)
                }
                
                // 如果沒有有效排名數據，顯示灰色界面和大問號（僅限工作進度排行榜）
                const greyCardEl = (!hasValidRankings && !isManual) ? (
                    <div
                      key={item.id}
                      className="relative rounded-lg overflow-hidden shadow-2xl min-w-0 flex flex-col h-[380px] sm:h-[420px] lg:h-[460px]"
                      style={{
                        background: 'linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 50%, #2a2a2a 100%)',
                        position: 'relative'
                      }}
                    >
                      {/* 灰色背景遮罩 */}
                      <div className="absolute inset-0 bg-gray-800 bg-opacity-90"></div>
                      
                      {/* 內容區域 - 手機縮小 padding、圖片與字級，避免擠在一起 */}
                      <div className="relative p-2 sm:p-6 flex-1 min-h-0 flex flex-col overflow-auto">
                        {/* 標題區域 - 僅管理員可見；手機縮小圖片與間距 */}
                        {item && userRole === 'admin' && (
                          <div className="mb-2 sm:mb-4 pb-2 sm:pb-4 border-b border-gray-600">
                            <div className="flex items-start gap-2 sm:gap-4">
                              <div className="relative w-14 h-14 sm:w-24 sm:h-24 flex-shrink-0">
                                {item.imageUrl ? (
                                  <img
                                    src={item.imageUrl}
                                    alt="排行榜照片"
                                    className="w-full h-full object-cover rounded border-2 border-yellow-400"
                                  />
                                ) : (
                                  <div className="w-full h-full border-2 border-dashed border-gray-500 rounded flex items-center justify-center bg-gray-700">
                                    <span className="text-gray-500 text-2xl">+</span>
                                  </div>
                                )}
                                {item.imageUrl && (
                                  <button
                                    onClick={() => {
                                      updateLeaderboardItem(item.id, { imageUrl: '' })
                                      setLeaderboardItems(prev => 
                                        prev.map(i => i.id === item.id ? { ...i, imageUrl: '' } : i)
                                      )
                                    }}
                                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 text-xs"
                                    title="刪除照片"
                                  >
                                    ×
                                  </button>
                                )}
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => {
                                    const file = e?.target?.files?.[0]
                                    if (!file || !item?.id) return
                                    const reader = new FileReader()
                                    const itemId = item.id
                                    reader.onloadend = () => {
                                      try {
                                        const imageUrl = reader.result
                                        if (!imageUrl || typeof imageUrl !== 'string') return
                                        updateLeaderboardItem(itemId, { imageUrl })
                                        setLeaderboardItems(prev => 
                                          prev.map(i => i.id === itemId ? { ...i, imageUrl } : i)
                                        )
                                      } catch (err) {
                                        console.error('Leaderboard image update error', err)
                                      }
                                    }
                                    reader.onerror = () => { try { console.error('FileReader error') } catch (_) {} }
                                    reader.readAsDataURL(file)
                                  }}
                                  className="hidden"
                                  id={`image-upload-${item.id}`}
                                />
                                <label
                                  htmlFor={`image-upload-${item.id}`}
                                  className="absolute inset-0 cursor-pointer"
                                  title="點擊上傳照片"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                              <div className="flex-1">
                                <input
                                  type="text"
                                  value={item.subtitle || uiConfig.subtitle || ''}
                                  onChange={(e) => {
                                    updateLeaderboardItem(item.id, { subtitle: e.target.value })
                                    setLeaderboardItems(prev => 
                                      prev.map(i => i.id === item.id ? { ...i, subtitle: e.target.value } : i)
                                    )
                                  }}
                                  className="bg-transparent border-b border-transparent hover:border-yellow-400 focus:border-yellow-400 text-yellow-400 text-xs sm:text-sm font-semibold focus:outline-none w-full mb-1 sm:mb-2"
                                  placeholder="業績"
                                />
                                <input
                                  type="text"
                                  value={item.title || item.name || ''}
                                  onChange={(e) => {
                                    updateLeaderboardItem(item.id, { title: e.target.value })
                                    setLeaderboardItems(prev => 
                                      prev.map(i => i.id === item.id ? { ...i, title: e.target.value } : i)
                                    )
                                  }}
                                  className="bg-transparent border-b border-transparent hover:border-white focus:border-white text-white text-lg sm:text-3xl font-bold focus:outline-none w-full mb-1 sm:mb-2"
                                  placeholder="排行榜"
                                />
                                <input
                                  type="text"
                                  value={item.slogan || uiConfig.slogan1 || ''}
                                  onChange={(e) => {
                                    updateLeaderboardItem(item.id, { slogan: e.target.value })
                                    setLeaderboardItems(prev => 
                                      prev.map(i => i.id === item.id ? { ...i, slogan: e.target.value } : i)
                                    )
                                  }}
                                  className="bg-transparent border-b border-transparent hover:border-yellow-400 focus:border-yellow-400 text-yellow-400 text-xs sm:text-sm focus:outline-none w-full"
                                  placeholder="乘風破浪 披荊斬棘"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* 一般用戶：無排名資料時只顯示簡短提示；管理員下方有編輯表格 */}
                        {userRole !== 'admin' && (
                          <div className="flex items-center justify-center py-8">
                            <p className="text-gray-400 text-sm">尚無排名數據，當有人完成工作並有實際完成數量時會顯示</p>
                          </div>
                        )}
                        
                        {/* 管理員編輯區域 - 排行榜表格；手機縮小間距與字級 */}
                        {userRole === 'admin' && (
                          <div className="relative rounded-lg sm:rounded-lg px-2 py-2 sm:px-4 sm:py-4" style={{
                            background: 'linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 100%)'
                          }}>
                            {/* 表頭：手機加大姓名欄、姓名可完整顯示 */}
                            <div className="grid grid-cols-12 gap-1 sm:gap-2 pb-2 sm:pb-3 mb-2 sm:mb-3 border-b border-gray-600">
                              <div className="col-span-2 flex items-center justify-center">
                                <input
                                  type="text"
                                  value={uiConfig.columnRank}
                                  onChange={(e) => handleEditUIElement('columnRank', e.target.value)}
                                  className="bg-transparent border-b border-transparent hover:border-white focus:border-white text-white font-bold focus:outline-none w-full text-[10px] sm:text-sm text-center"
                                />
                              </div>
                              <div className="col-span-4 sm:col-span-3 flex items-center min-w-0">
                                <input
                                  type="text"
                                  value={uiConfig.columnName}
                                  onChange={(e) => handleEditUIElement('columnName', e.target.value)}
                                  className="bg-transparent border-b border-transparent hover:border-white focus:border-white text-white font-bold focus:outline-none w-full text-[10px] sm:text-sm"
                                />
                              </div>
                              <div className="col-span-2 sm:col-span-3 flex items-center justify-center">
                                <input
                                  type="text"
                                  value={uiConfig.columnTime || '時間'}
                                  onChange={(e) => handleEditUIElement('columnTime', e.target.value)}
                                  className="bg-transparent border-b border-transparent hover:border-white focus:border-white text-white font-bold focus:outline-none w-full text-[10px] sm:text-sm text-center"
                                />
                              </div>
                              <div className="col-span-4 sm:col-span-4 flex items-center justify-end">
                                <input
                                  type="text"
                                  value={uiConfig.columnPerformance}
                                  onChange={(e) => handleEditUIElement('columnPerformance', e.target.value)}
                                  className="bg-transparent border-b border-transparent hover:border-white focus:border-white text-white font-bold text-right focus:outline-none w-full text-[10px] sm:text-sm"
                                />
                              </div>
                            </div>

                            {/* 排名列表：手機縮短可捲高度 */}
                            <div className="max-h-48 sm:max-h-96 overflow-y-auto">
                              {(() => {
                                const calculatedList = (rankings[item.id] || []).map((user, idx) => ({
                                  id: `auto-${user.userName}`,
                                  rank: idx + 1,
                                  name: user.name || user.userName,
                                  time: '',
                                  quantity: item ? getRankingValue(user, item.type, item) : '',
                                  weekQuantity: ''
                                }))
                                const displayRankings = (manualRanks && manualRanks.length > 0) ? manualRanks : calculatedList
                                const isShowingAuto = !manualRanks || manualRanks.length === 0
                                
                                if (displayRankings.length === 0) {
                                  return (
                                    <div className="text-gray-400 text-center py-8 text-sm">
                                      尚無排名數據，點擊下方按鈕新增排名項目
                                    </div>
                                  )
                                }
                                
                                return (
                                  <>
                                    {displayRankings.map((ranking, rankingIndex) => {
                                      const rank = ranking.rank || rankingIndex + 1
                                      const isTopThree = rank <= 3
                                      const isAutoRow = String(ranking.id || '').startsWith('auto-')
                                      
                                      return (
                                        <div
                                          key={ranking.id}
                                          className="grid grid-cols-12 gap-1 sm:gap-2 py-2 sm:py-3 items-center group"
                                          style={{
                                            borderBottom: '1px solid rgba(75, 85, 99, 0.3)'
                                          }}
                                        >
                                          {/* 排名 */}
                                          <div className="col-span-2 flex items-center justify-center">
                                            {isTopThree ? (
                                              <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-white font-bold text-sm sm:text-lg ${
                                                rank === 1 ? 'bg-yellow-500' : rank === 2 ? 'bg-gray-400' : 'bg-orange-600'
                                              }`}>
                                                {rank}
                                              </div>
                                            ) : (
                                              <span className="text-gray-400 text-xs sm:text-sm">{rank}</span>
                                            )}
                                          </div>
                                          
                                          {/* 姓名：手機加大欄寬、可換行顯示完整名稱 */}
                                          <div className="col-span-4 sm:col-span-3 min-w-0">
                                            {isAutoRow ? (
                                              <span className="text-white text-xs sm:text-sm px-1 sm:px-3 py-1 sm:py-2 block break-words line-clamp-2">{ranking.name || ''}</span>
                                            ) : (
                                              <input
                                                type="text"
                                                value={ranking.name || ''}
                                                onChange={(e) => handleUpdateRanking(item.id, ranking.id, 'name', e.target.value)}
                                                placeholder="姓名"
                                                className="w-full bg-gray-700 border border-gray-600 rounded px-2 sm:px-3 py-1.5 sm:py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 text-xs sm:text-sm"
                                              />
                                            )}
                                          </div>
                                          
                                          {/* 時間 */}
                                          <div className="col-span-2 sm:col-span-3 flex items-center justify-center">
                                            {isAutoRow ? (
                                              <span className="text-gray-400 text-xs sm:text-sm">{ranking.time || ''}</span>
                                            ) : (
                                              <input
                                                type="text"
                                                value={ranking.time || ''}
                                                onChange={(e) => handleUpdateRanking(item.id, ranking.id, 'time', e.target.value)}
                                                placeholder="時間"
                                                className="w-full bg-gray-700 border border-gray-600 rounded px-2 sm:px-3 py-1.5 sm:py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 text-xs sm:text-sm text-center"
                                              />
                                            )}
                                          </div>
                                          
                                          {/* 數量 */}
                                          <div className="col-span-4 sm:col-span-3 flex flex-col items-end justify-center pr-1 sm:pr-4">
                                            {isAutoRow ? (
                                              <span className="text-white text-xs sm:text-sm">{ranking.quantity || ''}</span>
                                            ) : (
                                              <>
                                                <input
                                                  type="number"
                                                  value={ranking.quantity || ''}
                                                  onChange={(e) => handleUpdateRanking(item.id, ranking.id, 'quantity', e.target.value)}
                                                  placeholder="數量"
                                                  className="w-full bg-gray-700 border border-gray-600 rounded px-2 sm:px-3 py-1.5 sm:py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 text-xs sm:text-sm text-right"
                                                  min="0"
                                                  step="0.01"
                                                />
                                                {item.lastResetAt && (
                                                  <div className="text-[10px] sm:text-xs text-gray-400 mt-0.5 sm:mt-1 pr-1 sm:pr-2">
                                                    本輪: {Math.round(parseFloat(ranking.weekQuantity) || 0)}
                                                  </div>
                                                )}
                                              </>
                                            )}
                                          </div>
                                          
                                          {/* 刪除按鈕：僅手動排名可刪 */}
                                          <div className="col-span-1 flex items-center justify-end">
                                            {!isAutoRow && (
                                              <button
                                                onClick={() => handleDeleteRanking(item.id, ranking.id)}
                                                className="text-red-400 hover:text-red-500 px-1 sm:px-2 py-1 text-xs sm:text-sm opacity-0 group-hover:opacity-100 transition-opacity touch-manipulation"
                                                title="刪除"
                                              >
                                                刪除
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      )
                                    })}
                                    {isShowingAuto && calculatedList.length > 0 && (
                                      <div className="text-gray-500 text-xs py-2 px-2 border-t border-gray-600 mt-2">
                                        以上為依排程自動計算（如駕駛次數來自出發／回程駕駛）
                                      </div>
                                    )}
                                  </>
                                )
                              })()}
                            </div>
                            
                            {/* 新增排名項目按鈕：手機加大可點區域 */}
                            <div className="mt-3 sm:mt-4">
                              <button
                                onClick={() => handleAddRanking(item.id)}
                                className="w-full bg-yellow-400 text-gray-900 px-3 py-2.5 sm:py-2 rounded-lg hover:bg-yellow-500 transition-colors font-semibold text-sm min-h-[44px] touch-manipulation"
                              >
                                + 新增排名項目
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* 刪除按鈕（管理員可見） */}
                      {userRole === 'admin' && (
                        <div className="absolute top-3 right-3 z-20">
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg"
                            title="刪除面板"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                ) : null;

                const fullCardEl = (
                  <div
                    key={item.id}
                    className="relative rounded-lg overflow-hidden shadow-2xl min-w-0 flex flex-col h-[380px] sm:h-[420px] lg:h-[460px] ring-2 ring-yellow-400"
                    style={{
                      background: 'linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 30%, #2a2a2a 60%, #1a1a1a 100%)',
                      position: 'relative',
                      boxShadow: '0 0 32px rgba(251, 191, 36, 0.4), 0 0 64px rgba(251, 191, 36, 0.2), inset 0 0 0 1px rgba(251, 191, 36, 0.3)'
                    }}
                  >
                  {/* 背景金色光線效果 */}
                  <div className="absolute inset-0" style={{
                    background: `
                      radial-gradient(ellipse at center top, rgba(251, 191, 36, 0.2) 0%, transparent 60%),
                      linear-gradient(180deg, transparent 0%, rgba(251, 191, 36, 0.05) 50%, transparent 100%)
                    `
                  }}></div>
                  
                  {/* 刪除按鈕：手機略小 */}
                  {userRole === 'admin' && (
                    <div className="absolute top-2 right-2 sm:top-3 sm:right-3 z-20">
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="w-7 h-7 sm:w-8 sm:h-8 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg touch-manipulation"
                        title="刪除面板"
                      >
                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}

                  {/* 內容區域 - 手機縮小 padding 與圖片，避免擠在一起 */}
                  <div className="relative p-2 sm:p-6 flex-1 min-h-0 flex flex-col overflow-auto">
                    {/* 標題區域 - 僅管理員可見；手機縮小圖片與間距 */}
                    {item && userRole === 'admin' && (
                      <div className="mb-2 sm:mb-4 pb-2 sm:pb-4 border-b border-gray-600">
                        {/* 標題區域 - 包含左上角照片和文字內容 */}
                        <div className="flex items-start gap-2 sm:gap-4">
                          {/* 左上角照片區塊：手機縮小 */}
                          <div className="flex-shrink-0">
                            {item.imageUrl ? (
                              <div className="relative group">
                                <img 
                                  src={item.imageUrl} 
                                  alt="排行榜照片"
                                  className="w-14 h-14 sm:w-24 sm:h-24 object-cover rounded-lg border-2 border-gray-600 shadow-lg"
                                />
                                {userRole === 'admin' && (
                                  <>
                                    <button
                                      onClick={() => {
                                        const updatedItem = { ...item, imageUrl: '' }
                                        updateLeaderboardItem(item.id, { imageUrl: '' })
                                        setLeaderboardItems(prev => 
                                          prev.map(i => i.id === item.id ? updatedItem : i)
                                        )
                                      }}
                                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-red-600"
                                      title="刪除照片"
                                    >
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                    <label className="absolute inset-0 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-lg flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                          const file = e?.target?.files?.[0]
                                          if (!file || !item?.id) return
                                          const reader = new FileReader()
                                          const itemId = item.id
                                          reader.onload = () => {
                                            try {
                                              const imageUrl = reader.result
                                              if (!imageUrl || typeof imageUrl !== 'string') return
                                              updateLeaderboardItem(itemId, { imageUrl })
                                              setLeaderboardItems(prev => 
                                                prev.map(i => i.id === itemId ? { ...i, imageUrl } : i)
                                              )
                                            } catch (err) {
                                              console.error('Leaderboard image update error', err)
                                            }
                                          }
                                          reader.onerror = () => { try { console.error('FileReader error') } catch (_) {} }
                                          reader.readAsDataURL(file)
                                        }}
                                      />
                                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                      </svg>
                                    </label>
                                  </>
                                )}
                              </div>
                            ) : (
                              userRole === 'admin' && (
                                <label className="w-14 h-14 sm:w-24 sm:h-24 border-2 border-dashed border-gray-600 rounded-lg flex items-center justify-center cursor-pointer hover:border-yellow-400 hover:bg-gray-800/50 transition-colors group touch-manipulation" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e?.target?.files?.[0]
                                      if (!file || !item?.id) return
                                      const reader = new FileReader()
                                      const itemId = item.id
                                      reader.onload = () => {
                                        try {
                                          const imageUrl = reader.result
                                          if (!imageUrl || typeof imageUrl !== 'string') return
                                          updateLeaderboardItem(itemId, { imageUrl })
                                          setLeaderboardItems(prev => 
                                            prev.map(i => i.id === itemId ? { ...i, imageUrl } : i)
                                          )
                                        } catch (err) {
                                          console.error('Leaderboard image update error', err)
                                        }
                                      }
                                      reader.onerror = () => { try { console.error('FileReader error') } catch (_) {} }
                                      reader.readAsDataURL(file)
                                    }}
                                  />
                                  <svg className="w-8 h-8 text-gray-500 group-hover:text-yellow-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                  </svg>
                                </label>
                              )
                            )}
                          </div>
                          
                          {/* 文字內容區域 */}
                          <div className="flex-1">
                        {/* 上方小標題 - 可編輯 - 高端動畫 */}
                        {userRole === 'admin' ? (
                          <input
                            type="text"
                            value={item.subtitle || '九月业绩'}
                            onChange={(e) => {
                              const updatedItem = { ...item, subtitle: e.target.value }
                              updateLeaderboardItem(item.id, { subtitle: e.target.value })
                              setLeaderboardItems(prev => 
                                prev.map(i => i.id === item.id ? updatedItem : i)
                              )
                            }}
                            className="bg-transparent border-b border-transparent hover:border-white/60 focus:border-white/60 text-white text-sm text-center focus:outline-none w-full mb-2"
                            placeholder="九月业绩"
                            style={{
                              fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                              animation: 'premiumGlow 4s ease-in-out infinite, subtlePulse 6s ease-in-out infinite',
                              fontWeight: '500',
                              letterSpacing: '0.03em'
                            }}
                            onFocus={(e) => {
                              e.target.style.borderBottomColor = 'rgba(255, 255, 255, 0.6)'
                            }}
                            onBlur={(e) => {
                              e.target.style.borderBottomColor = 'transparent'
                            }}
                          />
                        ) : (
                          <p 
                            className="text-white text-sm text-center mb-2" 
                            style={{ 
                              fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                              animation: 'premiumGlow 4s ease-in-out infinite, subtlePulse 6s ease-in-out infinite',
                              fontWeight: '500',
                              letterSpacing: '0.03em'
                            }}
                          >
                            {item.subtitle || '九月业绩'}
                          </p>
                        )}
                        
                        {/* 主標題 - 白色、居中、可編輯 - 高端專業動畫 */}
                        {userRole === 'admin' ? (
                          <input
                            type="text"
                            value={item.title || item.name || ''}
                            onChange={(e) => {
                              const updatedItem = { ...item, title: e.target.value }
                              updateLeaderboardItem(item.id, { title: e.target.value })
                              setLeaderboardItems(prev => 
                                prev.map(i => i.id === item.id ? updatedItem : i)
                              )
                            }}
                            className="bg-transparent border-b-2 border-transparent hover:border-white/60 focus:border-white/60 text-white text-3xl font-bold text-center focus:outline-none w-full pb-2"
                            placeholder="排行榜"
                            style={{
                              fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                              letterSpacing: '0.05em',
                              animation: 'premiumGlow 3s ease-in-out infinite, subtlePulse 5s ease-in-out infinite',
                              color: '#ffffff',
                              textShadow: '0 0 20px rgba(255, 255, 255, 0.8), 0 0 40px rgba(255, 255, 255, 0.5), 0 2px 4px rgba(0, 0, 0, 0.4)'
                            }}
                            onFocus={(e) => {
                              e.target.style.borderBottomColor = 'rgba(255, 255, 255, 0.6)'
                            }}
                            onBlur={(e) => {
                              e.target.style.borderBottomColor = 'transparent'
                            }}
                          />
                        ) : (
                          <h2 
                            className="text-white text-3xl font-bold text-center pb-2"
                            style={{
                              fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                              letterSpacing: '0.05em',
                              animation: 'premiumGlow 3s ease-in-out infinite, subtlePulse 5s ease-in-out infinite',
                              color: '#ffffff',
                              textShadow: '0 0 20px rgba(255, 255, 255, 0.8), 0 0 40px rgba(255, 255, 255, 0.5), 0 2px 4px rgba(0, 0, 0, 0.4)'
                            }}
                          >
                            {item.title || item.name || '排行榜'}
                          </h2>
                        )}
                        
                        {/* 副標題 - 可編輯 - 高端動畫 */}
                        {userRole === 'admin' ? (
                          <input
                            type="text"
                            value={item.slogan || '乘风破浪 披荆斩棘'}
                            onChange={(e) => {
                              const updatedItem = { ...item, slogan: e.target.value }
                              updateLeaderboardItem(item.id, { slogan: e.target.value })
                              setLeaderboardItems(prev => 
                                prev.map(i => i.id === item.id ? updatedItem : i)
                              )
                            }}
                            className="bg-transparent border-b border-transparent hover:border-white/60 focus:border-white/60 text-white text-sm text-center focus:outline-none w-full mt-2"
                            placeholder="乘风破浪 披荆斩棘"
                            style={{
                              fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                              animation: 'premiumGlow 4s ease-in-out infinite, subtlePulse 6s ease-in-out infinite',
                              fontWeight: '500',
                              letterSpacing: '0.03em'
                            }}
                            onFocus={(e) => {
                              e.target.style.borderBottomColor = 'rgba(255, 255, 255, 0.6)'
                            }}
                            onBlur={(e) => {
                              e.target.style.borderBottomColor = 'transparent'
                            }}
                          />
                        ) : (
                          <p 
                            className="text-white text-sm text-center mt-2" 
                            style={{ 
                              fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                              animation: 'premiumGlow 4s ease-in-out infinite, subtlePulse 6s ease-in-out infinite',
                              fontWeight: '500',
                              letterSpacing: '0.03em'
                            }}
                          >
                            {item.slogan || '乘风破浪 披荆斩棘'}
                          </p>
                        )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 團體目標進度顯示 */}
                    {item.isGroupGoal && item.type === 'totalQuantity' && (
                      <div className="mb-4 p-4 bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-lg border border-blue-500">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="text-blue-400 font-semibold text-lg">團體目標進度</span>
                              {userRole === 'admin' && (
                                <button
                                  onClick={() => handleEditItem(item)}
                                  className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 border border-blue-400 rounded transition-colors"
                                >
                                  編輯設定
                                </button>
                              )}
                              {item.achievedAt && (
                                <span className="bg-green-500 text-white text-xs px-2 py-1 rounded">
                                  已達成 ✓
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-white">
                                當前進度: <span className="text-yellow-400 font-bold text-lg">{Math.round(item.currentProgress || 0)}</span>
                              </span>
                              <span className="text-gray-400">/</span>
                              <span className="text-white">
                                目標: <span className="text-blue-400 font-bold text-lg">{item.groupGoal || 0}</span>
                              </span>
                              <span className="text-gray-400">
                                ({item.groupGoal > 0 ? Math.round(((item.currentProgress || 0) / item.groupGoal) * 100) : 0}%)
                              </span>
                            </div>
                          </div>
                          {userRole === 'admin' && item.achievedAt && (
                            <button
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                if (window.confirm('確定要重置團體目標進度嗎？這將清零當前進度並開始新一輪計算，排行榜累計數量將保留。溢出數量會保留在「本輪+」中。')) {
                                  // 1. 計算溢出數量（如果當前進度超過目標）
                                  const currentProgress = parseFloat(item.currentProgress) || 0
                                  const groupGoal = parseFloat(item.groupGoal) || 0
                                  const overflowQuantity = currentProgress > groupGoal ? (currentProgress - groupGoal) : 0
                                  
                                  // 2. 獲取所有排名數據，計算總的 weekQuantity（用於按比例分配溢出數量）
                                  const rankings = getManualRankings(item.id) || []
                                  
                                  // 計算所有用戶的 weekQuantity 總和（用於按比例分配）
                                  let totalWeekQuantity = 0
                                  rankings.forEach(ranking => {
                                    totalWeekQuantity += parseFloat(ranking.weekQuantity) || 0
                                  })
                                  
                                  // 3. 按比例分配溢出數量到各個用戶的 weekQuantity
                                  const updatedRankings = rankings.map(ranking => {
                                    const weekQty = parseFloat(ranking.weekQuantity) || 0
                                    let newWeekQuantity = 0
                                    
                                    if (overflowQuantity > 0 && totalWeekQuantity > 0) {
                                      // 按比例分配溢出數量（四捨五入為整數）
                                      const proportion = weekQty / totalWeekQuantity
                                      const allocatedOverflow = overflowQuantity * proportion
                                      newWeekQuantity = Math.round(allocatedOverflow)
                                    } else if (overflowQuantity > 0 && totalWeekQuantity === 0) {
                                      // 如果沒有 weekQuantity 但有溢出，按 quantity 比例分配（四捨五入為整數）
                                      const totalQuantity = rankings.reduce((sum, r) => sum + (parseFloat(r.quantity) || 0), 0)
                                      if (totalQuantity > 0) {
                                        const qty = parseFloat(ranking.quantity) || 0
                                        const proportion = qty / totalQuantity
                                        const allocatedOverflow = overflowQuantity * proportion
                                        newWeekQuantity = Math.round(allocatedOverflow)
                                      } else {
                                        // 如果連 quantity 都沒有，平均分配（四捨五入為整數）
                                        newWeekQuantity = rankings.length > 0 ? Math.round(overflowQuantity / rankings.length) : 0
                                      }
                                    } else {
                                      // 如果沒有溢出，歸零
                                      newWeekQuantity = 0
                                    }
                                    
                                    return {
                                      ...ranking,
                                      weekQuantity: newWeekQuantity.toString()
                                    }
                                  })
                                  
                                  saveManualRankings(item.id, updatedRankings)
                                  
                                  // 4. 更新排行榜項目：清空進度、達成時間，記錄重置時間
                                  updateLeaderboardItem(item.id, {
                                    currentProgress: 0,
                                    achievedAt: null,
                                    lastResetAt: new Date().toISOString()
                                  })
                                  
                                  // 5. 立即更新本地狀態
                                  setLeaderboardItems(prev => 
                                    prev.map(i => 
                                      i.id === item.id 
                                        ? { ...i, currentProgress: 0, achievedAt: null, lastResetAt: new Date().toISOString() }
                                        : i
                                    )
                                  )
                                  
                                  // 6. 重新載入手動排名數據
                                  loadManualRankings()
                                  
                                  // 7. 重新載入並計算排行榜
                                  setTimeout(() => {
                                    loadLeaderboardItems()
                                    calculateAllRankings()
                                  }, 100)
                                  
                                  if (overflowQuantity > 0) {
                                    alert(`已重置團體目標進度，排行榜累計數量已保留。溢出數量 ${Math.round(overflowQuantity)} 已按比例分配至各用戶的「本輪+」中。`)
                                  } else {
                                    alert('已重置團體目標進度，排行榜累計數量已保留，本輪累計已歸零')
                                  }
                                }
                              }}
                              className="bg-green-500 hover:bg-green-600 text-white font-semibold px-4 py-2 rounded transition-colors cursor-pointer relative z-10"
                              style={{ zIndex: 10 }}
                            >
                              重置重算
                            </button>
                          )}
                        </div>
                        
                        {/* 進度條 */}
                        <div className="w-full bg-gray-700 rounded-full h-6 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500 flex items-center justify-end pr-2"
                            style={{
                              width: `${item.groupGoal > 0 ? Math.min(((item.currentProgress || 0) / item.groupGoal) * 100, 100) : 0}%`
                            }}
                          >
                            {item.achievedAt && item.groupGoal > 0 && (item.currentProgress || 0) >= item.groupGoal && (
                              <span className="text-white text-xs font-bold">🎉 達成！</span>
                            )}
                          </div>
                        </div>
                        
                        {/* 達標獎勵顯示 */}
                        {(item.reward || item.rewardType === 'jiameng_coin' || item.rewardType === 'item') && (
                          <div className="mt-3 pt-3 border-t border-blue-500/30">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-yellow-400">🏆</span>
                                <span className="text-yellow-400 text-sm">
                                  達標獎勵: 
                                  {item.rewardType === 'text' && item.reward && (
                                    <span className="text-white ml-1">{item.reward}</span>
                                  )}
                                  {item.rewardType === 'jiameng_coin' && (
                                    <span className="text-white ml-1">
                                      <span className="text-yellow-400">💰</span> {item.rewardAmount || 0} 佳盟幣
                                    </span>
                                  )}
                                  {item.rewardType === 'item' && item.rewardItemId && (
                                    <span className="text-white ml-1">
                                      {(() => {
                                        const rewardItem = availableItems.find(i => i.id === item.rewardItemId)
                                        return rewardItem ? `${rewardItem.icon} ${rewardItem.name}（全體獎勵）` : '未知道具'
                                      })()}
                                    </span>
                                  )}
                                </span>
                              </div>
                              {userRole === 'admin' && (
                                <button
                                  onClick={() => handleEditItem(item)}
                                  className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 border border-blue-400 rounded transition-colors"
                                >
                                  編輯
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* 達成時間顯示 */}
                        {item.achievedAt && (
                          <div className="mt-2 text-gray-400 text-xs">
                            達成時間: {new Date(item.achievedAt).toLocaleString('zh-TW')}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* 排行榜名稱：一般用戶也要能看到這是什麼榜（管理員已在標題區編輯） */}
                    {userRole !== 'admin' && item && (
                      <div className="mb-2 sm:mb-3 pt-1">
                        <h2 className="text-yellow-400 font-bold text-base sm:text-xl text-center break-words px-1">
                          {item.title || item.name || '排行榜'}
                        </h2>
                        {item.subtitle && (
                          <p className="text-gray-400 text-xs sm:text-sm text-center mt-0.5 break-words px-1">{item.subtitle}</p>
                        )}
                      </div>
                    )}
                    
                    {/* 排行榜表格 - 深色背景；手機縮小間距與字級 */}
                    <div className="relative rounded-lg px-2 py-2 sm:px-4 sm:py-4" style={{
                      background: 'linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 100%)'
                    }}>
                      {/* 表頭：手機加大姓名欄、姓名可完整顯示 */}
                      <div className="grid grid-cols-12 gap-1 sm:gap-2 pb-2 sm:pb-3 mb-2 sm:mb-3 border-b border-gray-600">
                        <div className="col-span-2 flex items-center justify-center">
                          {userRole === 'admin' ? (
                            <input
                              type="text"
                              value={uiConfig.columnRank}
                              onChange={(e) => handleEditUIElement('columnRank', e.target.value)}
                              className="bg-transparent border-b border-transparent hover:border-white focus:border-white text-white font-bold focus:outline-none w-full text-[10px] sm:text-sm text-center"
                            />
                          ) : (
                            <span className="text-white font-bold text-[10px] sm:text-sm text-center w-full">{uiConfig.columnRank}</span>
                          )}
                        </div>
                        <div className="col-span-4 sm:col-span-3 flex items-center min-w-0">
                          {userRole === 'admin' ? (
                            <input
                              type="text"
                              value={uiConfig.columnName}
                              onChange={(e) => handleEditUIElement('columnName', e.target.value)}
                              className="bg-transparent border-b border-transparent hover:border-white focus:border-white text-white font-bold focus:outline-none w-full text-[10px] sm:text-sm"
                            />
                          ) : (
                            <span className="text-white font-bold text-[10px] sm:text-sm">{uiConfig.columnName}</span>
                          )}
                        </div>
                        <div className="col-span-2 sm:col-span-3 flex items-center justify-center">
                          {userRole === 'admin' ? (
                            <input
                              type="text"
                              value={uiConfig.columnTime || '時間'}
                              onChange={(e) => handleEditUIElement('columnTime', e.target.value)}
                              className="bg-transparent border-b border-transparent hover:border-white focus:border-white text-white font-bold focus:outline-none w-full text-[10px] sm:text-sm text-center"
                            />
                          ) : (
                            <span className="text-white font-bold text-[10px] sm:text-sm text-center w-full">{uiConfig.columnTime || '時間'}</span>
                          )}
                        </div>
                        <div className="col-span-4 flex items-center justify-end">
                          {userRole === 'admin' ? (
                            <input
                              type="text"
                              value={uiConfig.columnPerformance}
                              onChange={(e) => handleEditUIElement('columnPerformance', e.target.value)}
                              className="bg-transparent border-b border-transparent hover:border-white focus:border-white text-white font-bold text-right focus:outline-none w-full text-[10px] sm:text-sm"
                            />
                          ) : (
                            <span className="text-white font-bold text-[10px] sm:text-sm text-right w-full">{uiConfig.columnPerformance}</span>
                          )}
                        </div>
                      </div>

                      {/* 排名列表：手機縮短可捲高度 */}
                      <div className="max-h-48 sm:max-h-96 overflow-y-auto">
                        {(() => {
                          // 優先顯示手動編輯的排名，如果沒有則顯示自動計算的排名
                          const manualRanks = manualRankings[item.id] || []
                          const displayRankings = manualRanks.length > 0 
                            ? manualRanks 
                            : (itemRankings.map((user, idx) => ({
                                id: `auto-${user.userName}`,
                                rank: idx + 1,
                                name: user.name,
                                department: uiConfig.defaultDepartment,
                                time: '',
                                quantity: item ? getRankingValue(user, item.type, item) : ''
                              })))
                          
                          if (displayRankings.length === 0) {
                            return (
                              <div className="text-gray-400 text-center py-8 text-sm">
                                尚無排名數據
                              </div>
                            )
                          }
                          
                          return (
                            <>
                              {displayRankings.map((ranking, rankingIndex) => {
                                const rank = ranking.rank || rankingIndex + 1
                                const isTopThree = rank <= 3
                                const isManual = manualRanks.length > 0
                                
                                return (
                                  <div
                                    key={ranking.id}
                                    className="grid grid-cols-12 gap-1 sm:gap-2 py-2 sm:py-3 items-center group"
                                    style={{
                                      borderBottom: rankingIndex < displayRankings.length - 1 ? '1px solid rgba(255, 255, 255, 0.1)' : 'none'
                                    }}
                                  >
                                    {/* 排名列：手機縮小徽章 */}
                                    <div className="col-span-2">
                                      {rank === 1 && (
                                        <div className="flex items-center justify-center">
                                          <div className="relative w-8 h-8 sm:w-12 sm:h-12" style={{
                                            filter: 'drop-shadow(0 4px 8px rgba(251, 191, 36, 0.6))'
                                          }}>
                                            <div className="absolute inset-0 bg-gradient-to-br from-yellow-400 via-yellow-500 to-yellow-600 rounded-full" style={{
                                              boxShadow: 'inset 0 2px 10px rgba(255, 255, 255, 0.3), inset 0 -2px 10px rgba(0, 0, 0, 0.2), 0 4px 15px rgba(251, 191, 36, 0.5)'
                                            }}></div>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                              <svg className="w-4 h-4 sm:w-7 sm:h-7 text-gray-900" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                              </svg>
                                            </div>
                                            <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 text-gray-900 font-bold text-[8px] sm:text-xs">1</div>
                                          </div>
                                        </div>
                                      )}
                                      {rank === 2 && (
                                        <div className="flex items-center justify-center">
                                          <div className="relative w-8 h-8 sm:w-12 sm:h-12" style={{
                                            filter: 'drop-shadow(0 4px 8px rgba(156, 163, 175, 0.6))'
                                          }}>
                                            <div className="absolute inset-0 bg-gradient-to-br from-gray-300 via-gray-400 to-gray-500 rounded-full" style={{
                                              boxShadow: 'inset 0 2px 10px rgba(255, 255, 255, 0.3), inset 0 -2px 10px rgba(0, 0, 0, 0.2), 0 4px 15px rgba(156, 163, 175, 0.5)'
                                            }}></div>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                              <svg className="w-4 h-4 sm:w-7 sm:h-7 text-gray-900" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                              </svg>
                                            </div>
                                            <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 text-gray-900 font-bold text-[8px] sm:text-xs">2</div>
                                          </div>
                                        </div>
                                      )}
                                      {rank === 3 && (
                                        <div className="flex items-center justify-center">
                                          <div className="relative w-8 h-8 sm:w-12 sm:h-12" style={{
                                            filter: 'drop-shadow(0 4px 8px rgba(251, 146, 60, 0.6))'
                                          }}>
                                            <div className="absolute inset-0 bg-gradient-to-br from-orange-400 via-orange-500 to-orange-600 rounded-full" style={{
                                              boxShadow: 'inset 0 2px 10px rgba(255, 255, 255, 0.3), inset 0 -2px 10px rgba(0, 0, 0, 0.2), 0 4px 15px rgba(251, 146, 60, 0.5)'
                                            }}></div>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                              <svg className="w-4 h-4 sm:w-7 sm:h-7 text-gray-900" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                              </svg>
                                            </div>
                                            <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 text-gray-900 font-bold text-[8px] sm:text-xs">3</div>
                                          </div>
                                        </div>
                                      )}
                                      {rank > 3 && (
                                        <span className="text-white font-bold text-sm sm:text-xl">{rank}</span>
                                      )}
                                    </div>
                                    
                                    {/* 姓名列：手機加大欄寬、可換行顯示完整名稱 */}
                                    <div className="col-span-4 sm:col-span-3 text-white text-xs sm:text-sm flex items-center min-w-0">
                                      {isManual && userRole === 'admin' ? (
                                        <input
                                          type="text"
                                          value={ranking.name || ''}
                                          onChange={(e) => handleUpdateRanking(item.id, ranking.id, 'name', e.target.value)}
                                          className="bg-transparent border-b border-transparent hover:border-white focus:border-white text-white text-xs sm:text-sm focus:outline-none w-full"
                                          placeholder="輸入姓名"
                                        />
                                      ) : (
                                        <span className="break-words line-clamp-2">{ranking.name || ''}</span>
                                      )}
                                    </div>
                                    
                                    {/* 時間列 */}
                                    <div className="col-span-2 sm:col-span-3 text-white text-xs sm:text-sm flex items-center justify-center">
                                      {isManual && userRole === 'admin' ? (
                                        <input
                                          type="text"
                                          value={ranking.time || ''}
                                          onChange={(e) => handleUpdateRanking(item.id, ranking.id, 'time', e.target.value)}
                                          className="bg-transparent border-b border-transparent hover:border-white focus:border-white text-white text-sm focus:outline-none w-full text-center"
                                          placeholder="1分23秒"
                                        />
                                      ) : (
                                        <span className="text-center w-full">{ranking.time || ''}</span>
                                      )}
                                    </div>
                                    
                                    {/* 業績列 */}
                                    <div className={`col-span-4 text-xs sm:text-sm font-bold flex items-center justify-end pr-1 sm:pr-4 ${
                                      isTopThree 
                                        ? (rank === 1 ? 'text-yellow-300' : rank === 2 ? 'text-gray-300' : 'text-orange-300')
                                        : 'text-white'
                                    }`}>
                                      {isManual && userRole === 'admin' ? (
                                        <div className="text-right w-full pr-2">
                                          <input
                                            type="text"
                                            value={ranking.quantity || ''}
                                            onChange={(e) => handleUpdateRanking(item.id, ranking.id, 'quantity', e.target.value)}
                                            className="bg-transparent border-b border-transparent hover:border-yellow-300 focus:border-yellow-300 text-right text-sm focus:outline-none w-full"
                                            placeholder="數量"
                                          />
                                          {item.lastResetAt && (
                                            <div className="text-xs text-gray-400 mt-1 pr-2">
                                              本輪: {Math.round(parseFloat(ranking.weekQuantity) || 0)}
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-right w-full pr-2">
                                          {(() => {
                                            const totalQty = parseFloat(ranking.quantity) || 0
                                            const weekQty = parseFloat(ranking.weekQuantity) || 0
                                            const hasReset = item.lastResetAt ? true : false
                                            
                                            // 總累計數量始終顯示
                                            if (hasReset && weekQty > 0) {
                                              // 如果有重置記錄且本輪累計 > 0，顯示：總數 (本輪+本輪數)（四捨五入為整數）
                                              return `${Math.round(totalQty)} (本輪+${Math.round(weekQty)})`
                                            } else if (hasReset && weekQty === 0) {
                                              // 如果有重置記錄但本輪累計為 0，只顯示總數（但標註已重置）（四捨五入為整數）
                                              return `${Math.round(totalQty)}`
                                            } else {
                                              // 沒有重置記錄，只顯示總數（四捨五入為整數）
                                              return Math.round(totalQty) || ''
                                            }
                                          })()}
                                        </span>
                                      )}
                                    </div>
                                    
                                    {/* 刪除按鈕 */}
                                    {isManual && userRole === 'admin' && (
                                      <div className="col-span-12 flex justify-end mt-2">
                                        <button
                                          onClick={() => handleDeleteRanking(item.id, ranking.id)}
                                          className="text-red-400 hover:text-red-300 text-xs"
                                        >
                                          刪除
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                              
                              {/* 操作按鈕區域：手機加大間距與可點區域 */}
                              {userRole === 'admin' && (
                                <div className="mt-3 sm:mt-4 pt-2 sm:pt-3 border-t border-gray-600 space-y-2">
                                  <button
                                    onClick={() => handleAddRanking(item.id)}
                                    className="w-full bg-gray-700 hover:bg-gray-600 text-white text-sm py-2.5 sm:py-2 rounded-lg transition-colors min-h-[44px] touch-manipulation"
                                  >
                                    + 新增排名項目
                                  </button>
                                  <button
                                    onClick={() => handleSaveTestRecord(item.id)}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm py-2.5 sm:py-2 rounded-lg transition-colors font-semibold min-h-[44px] touch-manipulation"
                                  >
                                    💾 保存測試記錄
                                  </button>
                                </div>
                              )}
                            </>
                          )
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
                );

                const hasRankingEffect = hasValidRankings // 有資料卡：直接顯示完整卡片
                // 有資料時：所有人看見完整卡片（一般用戶可見排行榜名稱）
                if (hasValidRankings) {
                  return <Fragment key={item.id}>{fullCardEl}</Fragment>;
                }
                // 無資料時：所有人看見灰色 ? 卡（讓一般用戶知道有榜尚未有人上榜，但不顯示條件／榜名）；管理員另有刪除鈕
                return (
                  <Fragment key={item.id}>
                    <div
                      className="relative rounded-lg overflow-hidden shadow-lg min-w-0 flex flex-col min-h-[88px] sm:min-h-[100px] border border-gray-600"
                      style={{ background: 'linear-gradient(180deg, #1a1a1a 0%, #2a2a2a 100%)' }}
                    >
                      <div className="flex items-center gap-2 p-2 flex-1">
                        {/* 灰色 ? 卡：不顯示榜名與條件，僅表示「此榜尚無人上榜」 */}
                        <div className="w-full h-full min-h-[60px] sm:min-h-[72px] flex items-center justify-center">
                          <span className="text-gray-400 text-4xl sm:text-5xl font-bold opacity-60">?</span>
                        </div>
                      </div>
                      {userRole === 'admin' && (
                        <div className="absolute top-1 right-1">
                          <button type="button" onClick={() => handleDeleteItem(item.id)} className="w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 text-[10px] leading-none">×</button>
                        </div>
                      )}
                    </div>
                  </Fragment>
                );
              })
            )}
            
            {/* 新增面板按鈕（與緊湊卡片同高、對齊） */}
            {userRole === 'admin' && (
              <div
                className="relative rounded-lg overflow-hidden shadow-lg border-2 border-dashed border-gray-600 hover:border-yellow-400 transition-colors cursor-pointer min-w-0 flex flex-col min-h-[100px] sm:min-h-[120px]"
                style={{
                  background: 'linear-gradient(180deg, #1a1a1a 0%, #2a2a2a 100%)',
                  position: 'relative'
                }}
                onClick={handleAddItem}
              >
                <div className="absolute inset-0 flex flex-col items-center justify-center p-2">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-yellow-400 rounded-full flex items-center justify-center mb-1">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <p className="text-white text-xs font-semibold text-center">新增排行榜面板</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 編輯排行榜項目彈窗 */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto">
          <div className="bg-gray-800 rounded-lg p-4 sm:p-6 border border-yellow-400 w-full max-w-md min-w-0 max-h-[90vh] overflow-y-auto overflow-x-hidden my-auto">
            {/* 標題區域 - 圖一風格 */}
            <div className="relative mb-4 pb-4 border-b border-gray-700">
              {/* 上方小標題 */}
              <p className="text-white text-sm text-center mb-2">九月业绩</p>
              
              {/* 主標題 - 白色、居中、裝飾性字體，手機用小字級 */}
              <h3 
                className="text-2xl sm:text-3xl font-bold text-center cursor-pointer select-none text-white"
                style={{
                  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                  letterSpacing: '0.05em',
                  textShadow: '2px 2px 4px rgba(0, 0, 0, 0.5)'
                }}
                onClick={() => {
                  setLeaderboardTitleClickEffect(true)
                  setTimeout(() => setLeaderboardTitleClickEffect(false), 500)
                }}
              >
                排行榜
              </h3>
              
              {/* 副標題 */}
              <p className="text-white text-sm text-center mt-2">乘风破浪 披荆斩棘</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-gray-400 text-sm mb-2">項目名稱 *</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                  placeholder="例如：平均完成率"
                />
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm mb-2">排行榜類型 *</label>
                <select
                  value={editForm.isManual ? 'manual' : 'auto'}
                  onChange={(e) => {
                    const isManual = e.target.value === 'manual'
                    setEditForm({ 
                      ...editForm, 
                      isManual,
                      // 如果是手動類型，清空工作相關字段
                      ...(isManual ? { workContent: '', type: 'completionRate' } : {})
                    })
                  }}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                >
                  <option value="auto">工作進度累加（自動抓取）</option>
                  <option value="manual">手動輸入（自行輸入人員和時間）</option>
                </select>
              </div>
              
              {!editForm.isManual && (
                <>
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">計算類型 *</label>
                    <select
                      value={editForm.type}
                      onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                    >
                      <option value="completionRate">平均完成率</option>
                      <option value="completedItems">完成項目數</option>
                      <option value="workItems">工作項目總數</option>
                      <option value="totalQuantity">總完成數量</option>
                      <option value="totalTime">總工作時間</option>
                      <option value="danmuCount">發彈幕次數</option>
                      <option value="driverCount">駕駛次數（出發＋回程合計）</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">工作項目類型（選填）</label>
                    <input
                      type="text"
                      value={editForm.workContent}
                      onChange={(e) => setEditForm({ ...editForm, workContent: e.target.value })}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                      placeholder="留空表示所有工作項目"
                    />
                    <p className="text-gray-500 text-xs mt-1">留空則計算所有工作項目，填寫則只計算該類型</p>
                  </div>
                  
                  {/* 團體目標設定（僅限總完成數量類型） */}
                  {editForm.type === 'totalQuantity' && (
                    <>
                      <div className="mt-4 pt-4 border-t border-gray-700">
                        <label className="flex items-center gap-2 mb-3">
                          <input
                            type="checkbox"
                            checked={editForm.isGroupGoal || false}
                            onChange={(e) => setEditForm({ 
                              ...editForm, 
                              isGroupGoal: e.target.checked,
                              // 取消團體目標時重置相關字段
                              ...(e.target.checked ? {} : { groupGoal: 0, reward: '', currentProgress: 0, achievedAt: null, lastResetAt: null })
                            })}
                            className="w-4 h-4 text-yellow-400 bg-gray-700 border-gray-600 rounded focus:ring-yellow-400"
                          />
                          <span className="text-gray-300 text-sm font-semibold">啟用團體目標模式</span>
                        </label>
                        <p className="text-gray-500 text-xs mb-3 ml-6">啟用後，所有成員的數量將累加為團體總數，達成目標後可重置重算</p>
                      </div>
                      
                      {editForm.isGroupGoal && (
                        <>
                          <div>
                            <label className="block text-gray-400 text-sm mb-2">團體目標總數 *</label>
                            <input
                              type="number"
                              min="1"
                              value={editForm.groupGoal || ''}
                              onChange={(e) => setEditForm({ ...editForm, groupGoal: parseFloat(e.target.value) || 0 })}
                              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                              placeholder="例如：1000"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-gray-400 text-sm mb-2">獎勵類型 *</label>
                            <select
                              value={editForm.rewardType || 'text'}
                              onChange={(e) => setEditForm({ 
                                ...editForm, 
                                rewardType: e.target.value,
                                // 切換類型時清空相關字段
                                ...(e.target.value === 'text' ? { rewardAmount: 0, rewardItemId: '' } : {}),
                                ...(e.target.value === 'jiameng_coin' ? { reward: '', rewardItemId: '' } : {}),
                                ...(e.target.value === 'item' ? { reward: '' } : {})
                              })}
                              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                            >
                              <option value="text">文字描述</option>
                              <option value="jiameng_coin">佳盟幣</option>
                              <option value="item">道具</option>
                            </select>
                          </div>
                          
                          {editForm.rewardType === 'text' && (
                            <div>
                              <label className="block text-gray-400 text-sm mb-2">達標獎勵描述（選填）</label>
                              <input
                                type="text"
                                value={editForm.reward || ''}
                                onChange={(e) => setEditForm({ ...editForm, reward: e.target.value })}
                                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                                placeholder="例如：全體聚餐、獎金1000元等"
                              />
                            </div>
                          )}
                          
                          {editForm.rewardType === 'jiameng_coin' && (
                            <div>
                              <label className="block text-gray-400 text-sm mb-2">佳盟幣數量 *</label>
                              <input
                                type="number"
                                min="1"
                                value={editForm.rewardAmount || ''}
                                onChange={(e) => setEditForm({ ...editForm, rewardAmount: parseFloat(e.target.value) || 0 })}
                                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                                placeholder="例如：1000"
                              />
                            </div>
                          )}
                          
                          {editForm.rewardType === 'item' && (
                            <div>
                              <label className="block text-gray-400 text-sm mb-2">選擇道具 *</label>
                              <select
                                value={editForm.rewardItemId || ''}
                                onChange={(e) => setEditForm({ ...editForm, rewardItemId: e.target.value })}
                                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                              >
                                <option value="">請選擇道具</option>
                                {availableItems.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.icon} {item.name}
                                  </option>
                                ))}
                              </select>
                              <p className="text-gray-500 text-xs mt-1">達成目標後，所有成員將獲得此道具</p>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </>
              )}
              
              {editForm.isManual && (
                <div className="bg-blue-500/20 border border-blue-500 rounded-lg p-3">
                  <p className="text-blue-400 text-sm">
                    <strong>手動輸入排行榜：</strong><br/>
                    • 可以自行輸入人員姓名和時間/數量<br/>
                    • 輸入後會自動根據時間或數量進行排名<br/>
                    • 不會顯示灰色問號狀態
                  </p>
                </div>
              )}

              {/* 載入類型：選一個類型後，將該類型的第一/二/三名稱與特效填入表單 */}
              <div className="mt-4 pt-4 border-t border-gray-700">
                <label className="block text-gray-400 text-sm mb-2">載入類型</label>
                <select
                  value=""
                  onChange={(e) => {
                    const id = e.target.value
                    if (!id) return
                    const types = getLeaderboardTypes()
                    const t = types.find((x) => x.id === id)
                    if (t) {
                      setEditForm((prev) => ({
                        ...prev,
                        titleFirstPlace: t.titleFirstPlace ?? '',
                        titleSecondPlace: t.titleSecondPlace ?? '',
                        titleThirdPlace: t.titleThirdPlace ?? '',
                        nameEffectPresetId: t.nameEffectPresetId ?? '',
                        messageEffectPresetId: t.messageEffectPresetId ?? '',
                        titleBadgePresetId: t.titleBadgePresetId ?? '',
                        nameEffectPresetIdRank1: t.nameEffectPresetIdRank1 ?? '', nameEffectPresetIdRank2: t.nameEffectPresetIdRank2 ?? '', nameEffectPresetIdRank3: t.nameEffectPresetIdRank3 ?? '',
                        messageEffectPresetIdRank1: t.messageEffectPresetIdRank1 ?? '', messageEffectPresetIdRank2: t.messageEffectPresetIdRank2 ?? '', messageEffectPresetIdRank3: t.messageEffectPresetIdRank3 ?? '',
                        titleBadgePresetIdRank1: t.titleBadgePresetIdRank1 ?? '', titleBadgePresetIdRank2: t.titleBadgePresetIdRank2 ?? '', titleBadgePresetIdRank3: t.titleBadgePresetIdRank3 ?? '',
                        decorationPresetIdRank1: t.decorationPresetIdRank1 ?? '', decorationPresetIdRank2: t.decorationPresetIdRank2 ?? '', decorationPresetIdRank3: t.decorationPresetIdRank3 ?? ''
                      }))
                      // 自動展開特效區塊，讓用戶可以看到已載入的特效
                      setExpandEditEffects(true)
                      setExpandEditTitles(true)
                    }
                    e.target.value = ''
                  }}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                >
                  <option value="">選擇類型套用到此排行榜…</option>
                  {getLeaderboardTypes().map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <p className="text-gray-500 text-xs mt-1">選好後會填入第一／二／三名稱與名子／發話／稱號特效，僅 1、2、3 名套用。</p>
              </div>

              {/* 此排行榜稱號（前三名）：點擊展開 */}
              <div className="mt-4 pt-4 border-t border-gray-700">
                <button
                  type="button"
                  onClick={() => setExpandEditTitles(!expandEditTitles)}
                  className="w-full flex items-center justify-between text-left py-1 rounded hover:bg-gray-700/50 transition-colors"
                >
                  <span className="text-gray-300 text-sm font-semibold">此排行榜稱號（前三名）</span>
                  <span className="text-gray-500 text-xs">{expandEditTitles ? '▼ 收合' : '▶ 點擊展開'}</span>
                </button>
                {expandEditTitles && (
                  <>
                    <p className="text-gray-500 text-xs mt-2 mb-3">留空則使用全站預設稱號。同一人若在多個排行榜都上榜，可獲得多個不同稱號，並在背包中擇一裝備。</p>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-gray-400 text-xs mb-1">第一名稱號</label>
                        <input
                          type="text"
                          value={editForm.titleFirstPlace ?? ''}
                          onChange={(e) => setEditForm({ ...editForm, titleFirstPlace: e.target.value })}
                          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                          placeholder="例如：🏆 冠軍（留空用全站預設）"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-400 text-xs mb-1">第二名稱號</label>
                        <input
                          type="text"
                          value={editForm.titleSecondPlace ?? ''}
                          onChange={(e) => setEditForm({ ...editForm, titleSecondPlace: e.target.value })}
                          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                          placeholder="例如：🥈 亞軍（留空用全站預設）"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-400 text-xs mb-1">第三名稱號</label>
                        <input
                          type="text"
                          value={editForm.titleThirdPlace ?? ''}
                          onChange={(e) => setEditForm({ ...editForm, titleThirdPlace: e.target.value })}
                          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                          placeholder="例如：🥉 季軍（留空用全站預設）"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* 此排行榜特效樣式：點擊展開 */}
              <div className="mt-4 pt-4 border-t border-gray-700">
                <button
                  type="button"
                  onClick={() => setExpandEditEffects(!expandEditEffects)}
                  className="w-full flex items-center justify-between text-left py-1 rounded hover:bg-gray-700/50 transition-colors"
                >
                  <span className="text-gray-300 text-sm font-semibold">此排行榜特效樣式（僅第一名有名子特效）</span>
                  <span className="text-gray-500 text-xs">{expandEditEffects ? '▼ 收合' : '▶ 點擊展開'}</span>
                </button>
                {expandEditEffects && (
                  <>
                    <p className="text-gray-500 text-xs mt-2 mb-3">僅第一名有名子特效；第 1、2、3 名皆可選發話、稱號、名子旁裝飾。留空則使用全站預設。</p>
                {[1, 2, 3].map((rank) => (
                  <div key={rank} className="mb-4 p-3 rounded bg-gray-900/50 border border-gray-600">
                    <p className="text-amber-400 text-xs font-medium mb-2">第{rank}名</p>
                    <div className={rank === 1 ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-2 gap-2'}>
                      {rank === 1 && (
                        <div>
                          <label className="block text-gray-500 text-xs mb-1">名子</label>
                          <select
                            value={editForm.nameEffectPresetIdRank1 ?? ''}
                            onChange={(e) => setEditForm({ ...editForm, nameEffectPresetIdRank1: e.target.value })}
                            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-yellow-400"
                          >
                            <option value="">全站預設</option>
                            {NAME_EFFECT_PRESETS.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
                          </select>
                        </div>
                      )}
                      <div>
                        <label className="block text-gray-500 text-xs mb-1">發話</label>
                        <select
                          value={editForm[`messageEffectPresetIdRank${rank}`] ?? ''}
                          onChange={(e) => setEditForm({ ...editForm, [`messageEffectPresetIdRank${rank}`]: e.target.value })}
                          className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-yellow-400"
                        >
                          <option value="">全站預設</option>
                          <option value="none">無</option>
                          {MESSAGE_EFFECT_PRESETS.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-gray-500 text-xs mb-1">稱號</label>
                        <select
                          value={editForm[`titleBadgePresetIdRank${rank}`] ?? ''}
                          onChange={(e) => setEditForm({ ...editForm, [`titleBadgePresetIdRank${rank}`]: e.target.value })}
                          className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-yellow-400"
                        >
                          <option value="">全站預設</option>
                          {TITLE_BADGE_PRESETS.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
                        </select>
                      </div>
                    </div>
                    <div className="mt-2">
                      <label className="block text-gray-500 text-xs mb-1">名子旁裝飾（約 30 種跳躍樣式）</label>
                      <select
                        value={editForm[`decorationPresetIdRank${rank}`] ?? ''}
                        onChange={(e) => setEditForm({ ...editForm, [`decorationPresetIdRank${rank}`]: e.target.value })}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-yellow-400"
                      >
                        <option value="">無</option>
                        {DECORATION_PRESETS.map((p) => (<option key={p.id} value={p.id}>{p.emoji} {p.label}</option>))}
                      </select>
                    </div>
                  </div>
                ))}
                  </>
                )}
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveItem}
                className="px-4 py-2 bg-yellow-400 text-gray-900 rounded hover:bg-yellow-500 transition-colors font-semibold"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 排行榜類型彈窗：新增/編輯類型（第一/二/三名稱 + 名子/發話/稱號特效），供編輯排行榜時「載入類型」 */}
      {showTypeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg border border-amber-500 w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <h2 className="text-xl font-bold text-amber-400">排行榜類型</h2>
              <button onClick={() => { setShowTypeModal(false); setEditingType(null); }} className="text-gray-400 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {editingType === null ? (
                <>
                  <p className="text-gray-400 text-sm mb-3">設定好類型後，在「編輯排行榜」中可選擇「載入類型」套用第一/二/三名稱與特效。</p>
                  <div className="flex justify-end mb-3">
                    <button
                      onClick={() => {
                        setEditingType('new')
                        setTypeForm({ name: '', titleFirstPlace: '', titleSecondPlace: '', titleThirdPlace: '', nameEffectPresetId: '', messageEffectPresetId: '', titleBadgePresetId: '', ...emptyRankEffects() })
                      }}
                      className="bg-amber-500 text-gray-900 px-3 py-2 rounded hover:bg-amber-400 text-sm font-medium"
                    >
                      新增類型
                    </button>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {leaderboardTypes.length === 0 ? (
                      <p className="text-gray-500 text-sm">尚無類型，請先新增。</p>
                    ) : (
                      leaderboardTypes.map((t) => (
                        <div key={t.id} className="flex items-center justify-between gap-2 p-3 bg-gray-900 rounded border border-gray-700">
                          <span className="text-white font-medium truncate flex-1">{t.name}</span>
                          <div className="flex gap-2 shrink-0">
                            <button
                              onClick={() => {
                                setEditingType(t)
                                setTypeForm({
                                  name: t.name ?? '',
                                  titleFirstPlace: t.titleFirstPlace ?? '', titleSecondPlace: t.titleSecondPlace ?? '', titleThirdPlace: t.titleThirdPlace ?? '',
                                  nameEffectPresetId: t.nameEffectPresetId ?? '', messageEffectPresetId: t.messageEffectPresetId ?? '', titleBadgePresetId: t.titleBadgePresetId ?? '',
                                  nameEffectPresetIdRank1: t.nameEffectPresetIdRank1 ?? '', nameEffectPresetIdRank2: t.nameEffectPresetIdRank2 ?? '', nameEffectPresetIdRank3: t.nameEffectPresetIdRank3 ?? '',
                                  messageEffectPresetIdRank1: t.messageEffectPresetIdRank1 ?? '', messageEffectPresetIdRank2: t.messageEffectPresetIdRank2 ?? '', messageEffectPresetIdRank3: t.messageEffectPresetIdRank3 ?? '',
                                  titleBadgePresetIdRank1: t.titleBadgePresetIdRank1 ?? '', titleBadgePresetIdRank2: t.titleBadgePresetIdRank2 ?? '', titleBadgePresetIdRank3: t.titleBadgePresetIdRank3 ?? '',
                                  decorationPresetIdRank1: t.decorationPresetIdRank1 ?? '', decorationPresetIdRank2: t.decorationPresetIdRank2 ?? '', decorationPresetIdRank3: t.decorationPresetIdRank3 ?? ''
                                })
                              }}
                              className="text-amber-400 hover:text-amber-300 text-sm"
                            >
                              編輯
                            </button>
                            <button
                              onClick={() => {
                                if (!window.confirm(`確定刪除類型「${t.name}」？`)) return
                                const res = deleteLeaderboardType(t.id)
                                if (res.success) setLeaderboardTypes(getLeaderboardTypes())
                              }}
                              className="text-red-400 hover:text-red-300 text-sm"
                            >
                              刪除
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-gray-400 text-sm mb-1">類型名稱 *</label>
                    <input
                      type="text"
                      value={typeForm.name}
                      onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400"
                      placeholder="例如：業績榜"
                    />
                  </div>
                  <div className="border-t border-gray-700 pt-3">
                    <p className="text-gray-300 text-sm font-semibold mb-2">第一／二／三名稱（只套用 1、2、3）</p>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-gray-500 text-xs mb-1">第一名稱號</label>
                        <input
                          type="text"
                          value={typeForm.titleFirstPlace}
                          onChange={(e) => setTypeForm({ ...typeForm, titleFirstPlace: e.target.value })}
                          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400"
                          placeholder="例如：冠軍"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-500 text-xs mb-1">第二名稱號</label>
                        <input
                          type="text"
                          value={typeForm.titleSecondPlace}
                          onChange={(e) => setTypeForm({ ...typeForm, titleSecondPlace: e.target.value })}
                          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400"
                          placeholder="例如：亞軍"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-500 text-xs mb-1">第三名稱號</label>
                        <input
                          type="text"
                          value={typeForm.titleThirdPlace}
                          onChange={(e) => setTypeForm({ ...typeForm, titleThirdPlace: e.target.value })}
                          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400"
                          placeholder="例如：季軍"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-gray-700 pt-3">
                    <p className="text-gray-300 text-sm font-semibold mb-2">第 1、2、3 名各選一組特效（僅第一名有名子；1～3 名皆有名子旁裝飾）</p>
                    {[1, 2, 3].map((rank) => (
                      <div key={rank} className="mb-3 p-2 rounded bg-gray-900/50 border border-gray-600">
                        <p className="text-amber-400 text-xs font-medium mb-1">第{rank}名</p>
                        <div className={rank === 1 ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-2 gap-2'}>
                          {rank === 1 && (
                            <div>
                              <label className="block text-gray-500 text-xs mb-0.5">名子</label>
                              <select
                                value={typeForm.nameEffectPresetIdRank1 ?? ''}
                                onChange={(e) => setTypeForm({ ...typeForm, nameEffectPresetIdRank1: e.target.value })}
                                className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-amber-400"
                              >
                                <option value="">全站預設</option>
                                {NAME_EFFECT_PRESETS.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
                              </select>
                            </div>
                          )}
                          <div>
                            <label className="block text-gray-500 text-xs mb-0.5">發話</label>
                            <select
                              value={typeForm[`messageEffectPresetIdRank${rank}`] ?? ''}
                              onChange={(e) => setTypeForm({ ...typeForm, [`messageEffectPresetIdRank${rank}`]: e.target.value })}
                              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-amber-400"
                            >
                              <option value="">全站預設</option>
                              <option value="none">無</option>
                              {MESSAGE_EFFECT_PRESETS.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-gray-500 text-xs mb-0.5">稱號</label>
                            <select
                              value={typeForm[`titleBadgePresetIdRank${rank}`] ?? ''}
                              onChange={(e) => setTypeForm({ ...typeForm, [`titleBadgePresetIdRank${rank}`]: e.target.value })}
                              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-amber-400"
                            >
                              <option value="">全站預設</option>
                              {TITLE_BADGE_PRESETS.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
                            </select>
                          </div>
                        </div>
                        <div className="mt-1.5">
                          <label className="block text-gray-500 text-xs mb-0.5">名子旁裝飾（約 30 種跳躍樣式）</label>
                          <select
                            value={typeForm[`decorationPresetIdRank${rank}`] ?? ''}
                            onChange={(e) => setTypeForm({ ...typeForm, [`decorationPresetIdRank${rank}`]: e.target.value })}
                            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-amber-400"
                          >
                            <option value="">無</option>
                            {DECORATION_PRESETS.map((p) => (<option key={p.id} value={p.id}>{p.emoji} {p.label}</option>))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={() => setEditingType(null)}
                      className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 text-sm"
                    >
                      取消
                    </button>
                    <button
                      onClick={() => {
                        if (!typeForm.name.trim()) { alert('請填寫類型名稱'); return }
                        const payload = {
                          name: typeForm.name.trim(),
                          titleFirstPlace: typeForm.titleFirstPlace ?? '', titleSecondPlace: typeForm.titleSecondPlace ?? '', titleThirdPlace: typeForm.titleThirdPlace ?? '',
                          nameEffectPresetId: typeForm.nameEffectPresetId ?? '', messageEffectPresetId: typeForm.messageEffectPresetId ?? '', titleBadgePresetId: typeForm.titleBadgePresetId ?? '',
                          nameEffectPresetIdRank1: typeForm.nameEffectPresetIdRank1 ?? '', nameEffectPresetIdRank2: typeForm.nameEffectPresetIdRank2 ?? '', nameEffectPresetIdRank3: typeForm.nameEffectPresetIdRank3 ?? '',
                          messageEffectPresetIdRank1: typeForm.messageEffectPresetIdRank1 ?? '', messageEffectPresetIdRank2: typeForm.messageEffectPresetIdRank2 ?? '', messageEffectPresetIdRank3: typeForm.messageEffectPresetIdRank3 ?? '',
                          titleBadgePresetIdRank1: typeForm.titleBadgePresetIdRank1 ?? '', titleBadgePresetIdRank2: typeForm.titleBadgePresetIdRank2 ?? '', titleBadgePresetIdRank3: typeForm.titleBadgePresetIdRank3 ?? '',
                          decorationPresetIdRank1: typeForm.decorationPresetIdRank1 ?? '', decorationPresetIdRank2: typeForm.decorationPresetIdRank2 ?? '', decorationPresetIdRank3: typeForm.decorationPresetIdRank3 ?? ''
                        }
                        if (editingType === 'new') {
                          const res = addLeaderboardType(payload)
                          if (res.success) {
                            setLeaderboardTypes(getLeaderboardTypes())
                            setEditingType(null)
                            setTypeForm({ name: '', titleFirstPlace: '', titleSecondPlace: '', titleThirdPlace: '', nameEffectPresetId: '', messageEffectPresetId: '', titleBadgePresetId: '', ...emptyRankEffects() })
                            alert('保存成功')
                          } else alert(res.message || '新增失敗')
                        } else {
                          const res = updateLeaderboardType(editingType.id, payload)
                          if (res.success) {
                            setLeaderboardTypes(getLeaderboardTypes())
                            setEditingType(null)
                            alert('保存成功')
                          } else alert(res.message || '更新失敗')
                        }
                      }}
                      className="px-4 py-2 bg-amber-500 text-gray-900 rounded hover:bg-amber-400 text-sm font-medium"
                    >
                      保存
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 特效設定彈窗：名子特效／發話特效／稱號－可編輯道具名稱與顯示效果 */}
      {showEffectConfigModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg border border-indigo-400 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <h2 className="text-xl font-bold text-indigo-400">特效設定</h2>
              <button onClick={() => setShowEffectConfigModal(false)} className="text-gray-400 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex border-b border-gray-700">
              {['name', 'message', 'title'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setEffectConfigTab(tab)}
                  className={`px-4 py-3 text-sm font-medium ${effectConfigTab === tab ? 'text-indigo-400 border-b-2 border-indigo-400 bg-gray-800' : 'text-gray-400 hover:text-white'}`}
                >
                  {tab === 'name' ? '名子特效' : tab === 'message' ? '發話特效' : '稱號'}
                </button>
              ))}
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <p className="text-gray-500 text-sm mb-4">第 1、2、3 名的名稱在「排行榜類型」或「編輯排行榜」裡設。此處只選<strong className="text-gray-400">顯示樣式</strong>，點卡片「套用」後按保存。</p>
              {/* 預覽樣式：直接選擇並套用 */}
              <div>
                <h3 className="text-gray-300 font-semibold mb-2">預覽樣式</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-64 overflow-y-auto">
                  {effectConfigTab === 'name' && NAME_EFFECT_PRESETS.map((preset) => (
                    <div
                      key={preset.id}
                      className="bg-gray-700/50 rounded-lg border border-gray-600 p-3 flex flex-col items-center gap-2 hover:border-indigo-400 transition-colors"
                    >
                      <div className="w-full min-h-[2.5rem] flex items-center justify-center bg-gray-800 rounded px-2">
                        <span style={preset.style} className="text-sm font-bold">範例名稱</span>
                      </div>
                      <span className="text-gray-300 text-xs font-medium">{preset.label}</span>
                      <button
                        type="button"
                        onClick={() => setEffectDisplayForm({ ...effectDisplayForm, nameEffect: { ...preset.style } })}
                        className="w-full py-1.5 px-2 bg-indigo-500 hover:bg-indigo-600 text-white text-xs rounded font-medium"
                      >
                        套用
                      </button>
                    </div>
                  ))}
                  {effectConfigTab === 'message' && MESSAGE_EFFECT_PRESETS.map((preset) => (
                    <div
                      key={preset.id}
                      className="bg-gray-700/50 rounded-lg border border-gray-600 p-3 flex flex-col items-center gap-2 hover:border-indigo-400 transition-colors"
                    >
                      <div className="w-full min-h-[2.5rem] flex items-center justify-center bg-gray-800 rounded px-2 py-1">
                        <span style={preset.style} className="text-sm">範例發話內容</span>
                      </div>
                      <span className="text-gray-300 text-xs font-medium">{preset.label}</span>
                      <button
                        type="button"
                        onClick={() => setEffectDisplayForm({ ...effectDisplayForm, messageEffect: { ...preset.style } })}
                        className="w-full py-1.5 px-2 bg-indigo-500 hover:bg-indigo-600 text-white text-xs rounded font-medium"
                      >
                        套用
                      </button>
                    </div>
                  ))}
                  {effectConfigTab === 'title' && TITLE_BADGE_PRESETS.map((preset) => (
                    <div
                      key={preset.id}
                      className="bg-gray-700/50 rounded-lg border border-gray-600 p-3 flex flex-col items-center gap-2 hover:border-indigo-400 transition-colors"
                    >
                      <div className="w-full min-h-[2.5rem] flex items-center justify-center bg-gray-800 rounded px-2">
                        <span style={preset.style}>稱號範例</span>
                      </div>
                      <span className="text-gray-300 text-xs font-medium">{preset.label}</span>
                      <button
                        type="button"
                        onClick={() => setEffectDisplayForm({ ...effectDisplayForm, titleBadge: { ...preset.style } })}
                        className="w-full py-1.5 px-2 bg-indigo-500 hover:bg-indigo-600 text-white text-xs rounded font-medium"
                      >
                        套用
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-gray-500 text-xs mt-2">名子／發話／稱號道具為特殊道具，不可交易、不可刪除。</p>
            </div>
            <div className="p-4 border-t border-gray-700 flex justify-end gap-2">
              <button onClick={() => setShowEffectConfigModal(false)} className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600">取消</button>
              <button
                onClick={() => {
                  const res = saveEffectDisplayConfig(effectDisplayForm)
                  if (res.success) { alert('特效顯示設定已保存'); setShowEffectConfigModal(false) }
                  else alert(res.message || '保存失敗')
                }}
                className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 font-semibold"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      </div>
    </>
  )
}

export default Home
