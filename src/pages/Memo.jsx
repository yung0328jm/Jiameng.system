import { useState, useEffect, useRef } from 'react'
import { getGlobalMessages, addGlobalMessage, getOrCreateGlobalTopic, cleanExpiredMessages } from '../utils/memoStorage'
import { getCurrentUser, getCurrentUserRole } from '../utils/authStorage'
import { getAnnouncements, addAnnouncement, updateAnnouncement, deleteAnnouncement } from '../utils/announcementStorage'
import { getItem, getItems, ITEM_TYPES } from '../utils/itemStorage'
import { getUserInventory, hasItem, useItem, getItemQuantity, addItemToInventory, removeItemFromInventory } from '../utils/inventoryStorage'
import { getDanmus, addDanmu, deleteDanmu, clearAllDanmus, getActiveDanmus, cleanExpiredDanmus } from '../utils/danmuStorage'
import { getUsers } from '../utils/storage'
import { getEquippedEffects } from '../utils/effectStorage'
import { getEffectDisplayConfig, getStyleForPreset, getDecorationForPreset, getDecorationById } from '../utils/effectDisplayStorage'
import { getLeaderboardItems } from '../utils/leaderboardStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { getDisplayNamesForAccount } from '../utils/dropdownStorage'

function Memo() {
  const [userRole, setUserRole] = useState(null)
  const [currentUser, setCurrentUser] = useState('')
  
  // 公佈欄狀態
  const [announcements, setAnnouncements] = useState([])
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false)
  const [announcementForm, setAnnouncementForm] = useState({
    title: '',
    content: '',
    priority: 'normal'
  })
  const [editingAnnouncementId, setEditingAnnouncementId] = useState(null)
  
  // 交流區狀態（單一對話框，所有用戶直接發話）
  const [messages, setMessages] = useState([])
  const [messageContent, setMessageContent] = useState('')
  const [author, setAuthor] = useState('')
  const [isChatCollapsed, setIsChatCollapsed] = useState(false)
  const chatScrollRef = useRef(null)
  const [stickToBottom, setStickToBottom] = useState(true)
  const forceScrollNextRef = useRef(false) // 發送訊息後強制捲到底一次
  const messagesEndRef = useRef(null)
  
  // 彈幕狀態
  const [danmus, setDanmus] = useState([])
  // 彈幕顯示：最多同時 15 條，超過排隊依序播放，避免「別人的彈幕被刷掉沒出現」
  const [screenDanmus, setScreenDanmus] = useState([])
  const danmuQueueRef = useRef([])
  const danmuSeenRef = useRef(new Set())
  const danmuLaneRef = useRef(0)
  const danmuTimersRef = useRef({})
  const [danmuContent, setDanmuContent] = useState('')
  const [showDanmuInput, setShowDanmuInput] = useState(false)
  const [hasDanmuItem, setHasDanmuItem] = useState(false)
  const [danmuItemQuantity, setDanmuItemQuantity] = useState(0)
  const [showInventory, setShowInventory] = useState(false)
  const [inventory, setInventory] = useState([])
  // 排行榜項目（用於名子／發話／稱號特效）：切回此頁或取得焦點時重讀，確保編輯排行榜後的設定會反映
  const [leaderboardItems, setLeaderboardItems] = useState(() => getLeaderboardItems())

  // 交流區顯示名稱：優先使用「下拉選單綁定帳號的姓名」，其次 users.name，最後才顯示帳號
  const getDisplayNameForAccount = (account) => {
    const acc = String(account || '').trim()
    if (!acc) return '使用者'
    const boundNames = getDisplayNamesForAccount(acc) || []
    const preferred = boundNames.find((n) => n && n !== acc)
    if (preferred) return preferred
    const u = (getUsers() || []).find((x) => x?.account === acc)
    return (u?.name || acc)
  }



  // 公佈欄相關函數
  const loadAnnouncements = () => {
    const allAnnouncements = getAnnouncements()
    setAnnouncements(allAnnouncements)
  }

  const loadMessages = () => {
    getOrCreateGlobalTopic()
    // 交流區：只保留一天內容
    cleanExpiredMessages()
    setMessages(getGlobalMessages())
  }

  useEffect(() => {
    const currentUser = getCurrentUser()
    const role = getCurrentUserRole()
    setCurrentUser(currentUser || '')
    setUserRole(role)
    if (currentUser) {
      setAuthor(currentUser)
    } else {
      setAuthor('使用者')
    }
    loadAnnouncements()
    loadMessages()
    loadDanmus()
    checkDanmuItem()
    loadInventory()
  }, [currentUser])
  
  // 定期更新彈幕列表並清理過期彈幕
  useEffect(() => {
    const interval = setInterval(() => {
      loadDanmus()
    }, 2000) // 每2秒更新一次
    return () => clearInterval(interval)
  }, [])

  // 交流區：定期清理超過 24 小時訊息（即使沒人發話也會自動刪除）
  useEffect(() => {
    const interval = setInterval(() => {
      const r = cleanExpiredMessages()
      if (r?.changed) loadMessages()
    }, 60 * 1000) // 每分鐘檢查一次
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // 只有在「本來就在底部附近」或「剛發送訊息」才自動捲到底，
    // 避免使用者往上看舊訊息時被拉回最下方。
    if (isChatCollapsed) return
    if (forceScrollNextRef.current || stickToBottom) {
      forceScrollNextRef.current = false
      // 使用 auto 避免造成「回彈感」
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
    }
  }, [messages])

  // 即時同步：公佈欄、交流區、彈幕、道具、用戶、排行榜等變更時重讀
  const refetchMemo = () => {
    loadAnnouncements()
    loadMessages()
    setDanmus(getActiveDanmus())
    checkDanmuItem()
    loadInventory()
    setLeaderboardItems(getLeaderboardItems())
  }
  useRealtimeKeys(
    ['jiameng_memos', 'jiameng_announcements', 'jiameng_danmus', 'jiameng_items', 'jiameng_inventories', 'jiameng_users', 'jiameng_equipped_effects', 'jiameng_effect_display_config', 'jiameng_leaderboard_items'],
    refetchMemo
  )

  // 切回此頁或取得焦點時重讀排行榜項目，讓「編輯排行榜」儲存的名子／發話／勳章設定即時反映在交流區
  useEffect(() => {
    const refresh = () => setLeaderboardItems(getLeaderboardItems())
    refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  const handleAddAnnouncement = () => {
    if (!announcementForm.title.trim() || !announcementForm.content.trim()) {
      alert('請輸入標題和內容')
      return
    }
    const result = addAnnouncement({
      ...announcementForm,
      createdBy: currentUser
    })
    if (result.success) {
      setAnnouncementForm({ title: '', content: '', priority: 'normal' })
      setShowAnnouncementForm(false)
      loadAnnouncements()
    } else {
      alert(result.message || '新增失敗')
    }
  }

  const handleUpdateAnnouncement = (id, updates) => {
    const result = updateAnnouncement(id, updates)
    if (result.success) {
      loadAnnouncements()
      setEditingAnnouncementId(null)
    } else {
      alert(result.message || '更新失敗')
    }
  }

  const handleDeleteAnnouncement = (id) => {
    if (window.confirm('確定要刪除此公佈欄項目嗎？')) {
      const result = deleteAnnouncement(id)
      if (result.success) {
        loadAnnouncements()
      } else {
        alert(result.message || '刪除失敗')
      }
    }
  }

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent':
        return 'border-red-500 bg-red-900/20'
      case 'high':
        return 'border-orange-500 bg-orange-900/20'
      default:
        return 'border-gray-600 bg-gray-800'
    }
  }

  const getPriorityLabel = (priority) => {
    switch (priority) {
      case 'urgent':
        return '緊急'
      case 'high':
        return '重要'
      default:
        return '一般'
    }
  }

  const formatAnnouncementDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleSendMessage = (e) => {
    e.preventDefault()
    if (!messageContent.trim()) return
    forceScrollNextRef.current = true
    const result = addGlobalMessage(messageContent.trim(), author)
    if (result.success) {
      setMessageContent('')
      loadMessages()
      setTimeout(scrollToBottom, 100)
    } else {
      alert(result.message || '發送消息失敗')
    }
  }

  const formatTime = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    
    if (messageDate.getTime() === today.getTime()) {
      // 今天：显示时间
      return date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
    } else {
      // 其他日期：显示日期和时间
      return date.toLocaleString('zh-TW', { 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    }
  }

  // 依名次取排行榜的 presetId（優先 Rank1/2/3，無則用統一欄位）
  const getPresetIdByRank = (lb, kind, rank) => {
    if (!lb) return ''
    const r = String(rank)
    const key = kind === 'name' ? `nameEffectPresetIdRank${r}` : kind === 'message' ? `messageEffectPresetIdRank${r}` : `titleBadgePresetIdRank${r}`
    const fallback = kind === 'name' ? lb.nameEffectPresetId : kind === 'message' ? lb.messageEffectPresetId : lb.titleBadgePresetId
    return (lb[key] ?? fallback) ?? ''
  }

  // 獲取用戶的名子特效樣式（僅第一名有名子特效；依裝備道具所屬排行榜＋名次的特效設定；無則用全站預設）
  const getNameEffectStyle = (username) => {
    const effects = getEquippedEffects(username)
    if (!effects.nameEffect) return null
    const effectItem = getItem(effects.nameEffect)
    if (!effectItem) return null
    const rank = effectItem.rank ?? 1
    if (rank !== 1) return null // 只有第一名會有名子特效
    const leaderboardId = effectItem.leaderboardId || ''
    const leaderboard = leaderboardId ? leaderboardItems.find((l) => l.id === leaderboardId) : null
    const presetId = getPresetIdByRank(leaderboard, 'name', rank)
    return getStyleForPreset('name', presetId, rank) || null
  }

  // 獲取名子旁裝飾（第 1、2、3 名皆可顯示）：有 nameEffect 用 nameEffect 的榜＋名次；否則用稱號的榜＋名次取 decorationPresetIdRank
  const getDecorationForNameEffect = (username) => {
    const effects = getEquippedEffects(username)
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
    const leaderboard = leaderboardItems.find((l) => l.id === leaderboardId)
    const decoId = leaderboard?.[`decorationPresetIdRank${rank}`]
    if (decoId) {
      const deco = getDecorationById(decoId)
      if (deco) return deco
    }
    const presetId = getPresetIdByRank(leaderboard, 'name', rank)
    return getDecorationForPreset('name', presetId, rank)
  }

  // 獲取用戶的發話特效樣式（依裝備道具所屬排行榜＋名次的特效設定；無／全站預設）
  const getMessageEffectStyle = (username) => {
    const effects = getEquippedEffects(username)
    if (!effects.messageEffect) return null
    const effectItem = getItem(effects.messageEffect)
    if (!effectItem) return null
    const leaderboardId = effectItem.leaderboardId || ''
    const rank = effectItem.rank ?? 1
    const leaderboard = leaderboardId ? leaderboardItems.find((l) => l.id === leaderboardId) : null
    const presetId = getPresetIdByRank(leaderboard, 'message', rank)
    if (presetId === 'none') return null // 發話選「無」時不套用任何發話特效
    return getStyleForPreset('message', presetId, rank) || null
  }

  // 獲取稱號徽章樣式（依 username 裝備的稱號所屬排行榜＋名次；無則用全站預設）
  const getTitleBadgeStyle = (username) => {
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
    const leaderboard = leaderboardId ? leaderboardItems.find((l) => l.id === leaderboardId) : null
    const presetId = getPresetIdByRank(leaderboard, 'title', rank)
    return getStyleForPreset('title', presetId, rank) || {}
  }

  // 獲取用戶的稱號
  const getUserTitle = (username) => {
    const effects = getEquippedEffects(username)
    if (!effects.title) return null
    
    const titleItem = getItem(effects.title)
    if (!titleItem || titleItem.type !== ITEM_TYPES.TITLE) return null
    
    return titleItem.name || null
  }
  
  // 彈幕相關函數
  const loadDanmus = () => {
    // 先清理過期彈幕
    cleanExpiredDanmus()
    // 只載入24小時內的活躍彈幕
    const activeDanmus = getActiveDanmus()
    setDanmus(activeDanmus)
  }

  // 彈幕排隊播放：確保同時最多 15 條，新的會排隊逐一顯示
  useEffect(() => {
    const MAX_ON_SCREEN = 15
    const LANES = 10

    const hash = (str) => {
      let h = 0
      for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i)
        h = ((h << 5) - h) + c
        h = h & h
      }
      return Math.abs(h)
    }
    const safeAnimName = (id) => `danmuMove_${String(id || '').replace(/[^a-zA-Z0-9_-]/g, '')}`

    // 清理過大 seen，避免長時間使用累積太多
    try {
      if (danmuSeenRef.current.size > 1200) {
        const keepIds = new Set()
        ;(Array.isArray(danmus) ? danmus : []).slice(-500).forEach((d) => { if (d?.id) keepIds.add(String(d.id)) })
        ;(danmuQueueRef.current || []).slice(-300).forEach((d) => { if (d?.id) keepIds.add(String(d.id)) })
        ;(Array.isArray(screenDanmus) ? screenDanmus : []).forEach((d) => { if (d?.id) keepIds.add(String(d.id)) })
        danmuSeenRef.current = keepIds
      }
    } catch (_) {}

    // 把新彈幕加入 queue（依 createdAt 先來先播）
    const list = Array.isArray(danmus) ? danmus : []
    const sorted = [...list].sort((a, b) => (Date.parse(a?.createdAt || '') || 0) - (Date.parse(b?.createdAt || '') || 0))
    sorted.forEach((d) => {
      const id = String(d?.id || '').trim()
      if (!id) return
      if (danmuSeenRef.current.has(id)) return
      danmuSeenRef.current.add(id)
      danmuQueueRef.current.push(d)
    })

    const drain = () => {
      setScreenDanmus((prev) => {
        const next = [...(Array.isArray(prev) ? prev : [])]
        while (next.length < MAX_ON_SCREEN && (danmuQueueRef.current || []).length > 0) {
          const d = danmuQueueRef.current.shift()
          const id = String(d?.id || '').trim()
          if (!id) continue

          const seed = hash(id)
          const lane = danmuLaneRef.current % LANES
          danmuLaneRef.current += 1
          const topPosition = 10 + lane * 8 + (seed % 30) / 10 // 10-90%
          const duration = 12 + (seed % 35) / 10 // 12-15.4 秒（已略加速）
          const delay = (seed % 15) / 10 // 0-1.5 秒
          const fontSize = 20 + (seed % 60) / 10 // 20-26px
          const animationName = safeAnimName(id)

          // 到期移除，空位再補下一條
          const ttlMs = Math.round((duration + delay) * 1000) + 200
          try {
            if (danmuTimersRef.current[id]) clearTimeout(danmuTimersRef.current[id])
            danmuTimersRef.current[id] = setTimeout(() => {
              setScreenDanmus((cur) => (Array.isArray(cur) ? cur.filter((x) => String(x?.id || '') !== id) : []))
              try { delete danmuTimersRef.current[id] } catch (_) {}
              setTimeout(() => drain(), 0)
            }, ttlMs)
          } catch (_) {}

          next.push({ ...d, _anim: { animationName, topPosition, duration, delay, fontSize } })
        }
        return next
      })
    }

    drain()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [danmus])

  // 清理彈幕計時器（避免記憶體堆積）
  useEffect(() => {
    return () => {
      try {
        Object.values(danmuTimersRef.current || {}).forEach((t) => { try { clearTimeout(t) } catch (_) {} })
        danmuTimersRef.current = {}
      } catch (_) {}
    }
  }, [])
  
  const checkDanmuItem = () => {
    if (!currentUser) return
    const danmuItem = getItem('danmu_item')
    if (danmuItem) {
      const userHasItem = hasItem(currentUser, 'danmu_item')
      const quantity = getItemQuantity(currentUser, 'danmu_item')
      setHasDanmuItem(userHasItem)
      setDanmuItemQuantity(quantity)
    }
  }
  
  const loadInventory = () => {
    if (!currentUser) return
    const userInventory = getUserInventory(currentUser)
    const items = getItems()
    const inventoryWithDetails = userInventory.map(inv => {
      const item = items.find(i => i.id === inv.itemId)
      return {
        ...inv,
        item: item || null
      }
    })
    setInventory(inventoryWithDetails)
  }
  
  const handleSendDanmu = (e) => {
    e.preventDefault()
    if (!danmuContent.trim()) {
      return
    }
    
    if (!hasDanmuItem || danmuItemQuantity <= 0) {
      alert('您沒有彈幕道具，無法發送彈幕！')
      return
    }
    
    // 使用道具
    const useResult = useItem(currentUser, 'danmu_item')
    if (!useResult.success) {
      alert('使用道具失敗：' + useResult.message)
      return
    }
    
    // 隨機顏色
    const colors = ['#FFFFFF', '#FFD700', '#FF6B6B', '#4ECDC4', '#95E1D3', '#F38181', '#AA96DA', '#FCBAD3']
    const randomColor = colors[Math.floor(Math.random() * colors.length)]
    
    // 發送彈幕
    const result = addDanmu({
      content: danmuContent.trim(),
      author: currentUser,
      color: randomColor
    })
    
    if (result.success) {
      setDanmuContent('')
      setShowDanmuInput(false)
      loadDanmus()
      checkDanmuItem()
      loadInventory()
    } else {
      alert(result.message || '發送彈幕失敗')
      // 如果發送失敗，恢復道具
      addItemToInventory(currentUser, 'danmu_item', 1)
    }
  }
  
  const handleDeleteDanmu = (danmuId) => {
    if (window.confirm('確定要刪除此彈幕嗎？')) {
      const result = deleteDanmu(danmuId)
      if (result.success) {
        loadDanmus()
      } else {
        alert(result.message || '刪除失敗')
      }
    }
  }
  
  const handleClearAllDanmus = () => {
    if (window.confirm('確定要清除所有彈幕嗎？此操作無法復原！')) {
      const result = clearAllDanmus()
      if (result.success) {
        loadDanmus()
        alert('已清除所有彈幕')
      } else {
        alert(result.message || '清除失敗')
      }
    }
  }
  

  return (
    <>
      {/* 發光動畫樣式 */}
      <style>{`
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
      `}</style>
      <div className="bg-charcoal rounded-lg p-4 sm:p-6 min-h-0 flex flex-col overflow-y-auto">
      <h2 className="text-2xl font-bold text-yellow-400 mb-6 shrink-0">交流區</h2>
      
      {/* 上區塊：公佈欄 */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 
            className="text-lg font-bold text-white text-center"
            style={{
              fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
              animation: 'premiumGlow 3s ease-in-out infinite, subtlePulse 5s ease-in-out infinite',
              textShadow: '0 0 20px rgba(255, 255, 255, 0.8), 0 0 40px rgba(255, 255, 255, 0.5), 0 2px 4px rgba(0, 0, 0, 0.4)'
            }}
          >
            公佈欄
          </h3>
          {userRole === 'admin' && (
            <button
              onClick={() => {
                setShowAnnouncementForm(!showAnnouncementForm)
                setEditingAnnouncementId(null)
                setAnnouncementForm({ title: '', content: '', priority: 'normal' })
              }}
              className="bg-yellow-400 text-gray-900 px-4 py-2 rounded hover:bg-yellow-500 transition-colors font-semibold text-sm"
            >
              {showAnnouncementForm ? '取消' : '+ 新增公告'}
            </button>
          )}
        </div>

        {/* 新增/編輯公告表單 */}
        {showAnnouncementForm && userRole === 'admin' && (
          <div className="mb-6 p-4 bg-gray-900 rounded-lg border border-gray-600">
            <div className="space-y-3">
              <div>
                <label className="block text-gray-400 text-sm mb-1">標題 *</label>
                <input
                  type="text"
                  value={announcementForm.title}
                  onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })}
                  placeholder="輸入公告標題"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                />
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-1">內容 *</label>
                <textarea
                  value={announcementForm.content}
                  onChange={(e) => setAnnouncementForm({ ...announcementForm, content: e.target.value })}
                  placeholder="輸入公告內容"
                  rows="4"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400 resize-none"
                />
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-1">優先級</label>
                <select
                  value={announcementForm.priority}
                  onChange={(e) => setAnnouncementForm({ ...announcementForm, priority: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                >
                  <option value="normal">一般</option>
                  <option value="high">重要</option>
                  <option value="urgent">緊急</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddAnnouncement}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold py-2 rounded transition-colors"
                >
                  {editingAnnouncementId ? '更新' : '發布'}
                </button>
                <button
                  onClick={() => {
                    setShowAnnouncementForm(false)
                    setEditingAnnouncementId(null)
                    setAnnouncementForm({ title: '', content: '', priority: 'normal' })
                  }}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 rounded transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 公佈欄列表 */}
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {announcements.length === 0 ? (
            <div className="text-gray-400 text-center py-8">
              <p>尚無公告</p>
            </div>
          ) : (
            announcements.map((announcement) => (
              <div
                key={announcement.id}
                className={`p-4 rounded-lg border ${getPriorityColor(announcement.priority)}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    {editingAnnouncementId === announcement.id && userRole === 'admin' ? (
                      <input
                        type="text"
                        value={announcementForm.title}
                        onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white font-semibold focus:outline-none focus:border-yellow-400 mb-2"
                      />
                    ) : (
                      <h4 
                        className="text-white font-bold text-xl mb-1"
                        style={{
                          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                          animation: 'premiumGlow 3s ease-in-out infinite, subtlePulse 5s ease-in-out infinite',
                          textShadow: '0 0 20px rgba(255, 255, 255, 0.8), 0 0 40px rgba(255, 255, 255, 0.5), 0 2px 4px rgba(0, 0, 0, 0.4)',
                          letterSpacing: '0.05em'
                        }}
                      >
                        {announcement.title}
                      </h4>
                    )}
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-sm sm:text-xs px-3 sm:px-2 py-1.5 sm:py-1 rounded ${
                        announcement.priority === 'urgent' ? 'bg-red-500 text-white' :
                        announcement.priority === 'high' ? 'bg-orange-500 text-white' :
                        'bg-gray-600 text-gray-300'
                      }`}>
                        {getPriorityLabel(announcement.priority)}
                      </span>
                      <span className="text-gray-400 text-sm sm:text-xs">
                        {announcement.createdBy} · {formatAnnouncementDate(announcement.createdAt)}
                      </span>
                    </div>
                  </div>
                  {userRole === 'admin' && (
                    <div className="flex gap-3 sm:gap-2 ml-4 flex-shrink-0">
                      {editingAnnouncementId === announcement.id ? (
                        <>
                          <button
                            onClick={() => handleUpdateAnnouncement(announcement.id, announcementForm)}
                            className="text-green-400 hover:text-green-300 text-base sm:text-sm px-3 py-1.5 sm:py-1 min-h-[36px] sm:min-h-0"
                          >
                            保存
                          </button>
                          <button
                            onClick={() => {
                              setEditingAnnouncementId(null)
                              setAnnouncementForm({ title: '', content: '', priority: 'normal' })
                            }}
                            className="text-gray-400 hover:text-gray-300 text-base sm:text-sm px-3 py-1.5 sm:py-1 min-h-[36px] sm:min-h-0"
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setEditingAnnouncementId(announcement.id)
                              setAnnouncementForm({
                                title: announcement.title,
                                content: announcement.content,
                                priority: announcement.priority
                              })
                            }}
                            className="text-yellow-400 hover:text-yellow-300 text-base sm:text-sm px-3 py-1.5 sm:py-1 min-h-[36px] sm:min-h-0"
                          >
                            編輯
                          </button>
                          <button
                            onClick={() => handleDeleteAnnouncement(announcement.id)}
                            className="text-red-400 hover:text-red-300 text-base sm:text-sm px-3 py-1.5 sm:py-1 min-h-[36px] sm:min-h-0"
                          >
                            刪除
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {editingAnnouncementId === announcement.id && userRole === 'admin' ? (
                  <textarea
                    value={announcementForm.content}
                    onChange={(e) => setAnnouncementForm({ ...announcementForm, content: e.target.value })}
                    rows="3"
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400 resize-none"
                  />
                ) : (
                  <p 
                    className="text-white text-sm whitespace-pre-wrap"
                    style={{
                      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                      animation: 'textSparkle 4s ease-in-out infinite, subtlePulse 6s ease-in-out infinite',
                      textShadow: '0 0 10px rgba(255, 255, 255, 0.8), 0 0 20px rgba(255, 255, 255, 0.6), 0 0 30px rgba(255, 255, 255, 0.4), 0 2px 4px rgba(0, 0, 0, 0.3)'
                    }}
                  >
                    {announcement.content}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 下區塊：交流區 */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 relative" style={{ overflow: 'hidden', position: 'relative' }}>
        {/* 彈幕顯示區域 - 限制在交流區區塊內，最上層 */}
        <div 
          className="absolute inset-0 pointer-events-none overflow-hidden rounded-lg"
          style={{ 
            zIndex: 1,
            pointerEvents: 'none'
          }}
        >
          {screenDanmus.map((danmu) => {
            const anim = danmu?._anim || {}
            const danmuId = `danmu-${danmu.id}`
            
            // 優雅的配色方案
            const elegantColors = {
              primary: '#E8D5B7', // 優雅的米金色
              secondary: '#D4AF37', // 高貴的金色
              accent: '#C9A961', // 柔和的香檳色
              text: '#F5F1E8' // 優雅的米白色
            }
            
            return (
              <div
                key={danmuId}
                className="absolute pointer-events-none whitespace-nowrap danmu-item"
                style={{
                  top: `${anim.topPosition ?? 10}%`,
                  left: '100%',
                  animation: `${anim.animationName || 'danmuMoveFallback'} ${anim.duration ?? 12}s linear ${anim.delay ?? 0}s forwards`,
                  willChange: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '8px 16px',
                  background: 'linear-gradient(135deg, rgba(232, 213, 183, 0.15) 0%, rgba(212, 175, 55, 0.1) 100%)',
                  backdropFilter: 'blur(10px)',
                  borderRadius: '24px',
                  border: '1px solid rgba(212, 175, 55, 0.3)',
                  boxShadow: `
                    0 4px 20px rgba(0, 0, 0, 0.3),
                    0 0 30px rgba(212, 175, 55, 0.1),
                    inset 0 1px 0 rgba(255, 255, 255, 0.2)
                  `
                }}
              >
                {/* 作者名稱 - 優雅的標籤樣式 */}
                <span 
                  className="inline-flex items-center px-3 py-1 rounded-full"
                  style={{
                    background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.4) 0%, rgba(201, 169, 97, 0.3) 100%)',
                    border: '1px solid rgba(212, 175, 55, 0.5)',
                    color: elegantColors.secondary,
                    fontSize: '14px',
                    fontWeight: '600',
                    letterSpacing: '1px',
                    textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
                    boxShadow: '0 2px 8px rgba(212, 175, 55, 0.2)'
                  }}
                >
                  {getDisplayNameForAccount(danmu.author)}
                  {(() => {
                    const danmuAuthorTitle = getUserTitle(danmu.author)
                    return danmuAuthorTitle ? (
                      <span className="text-xs font-bold ml-2 rounded" style={getTitleBadgeStyle(danmu.author)}>
                        {danmuAuthorTitle}
                      </span>
                    ) : null
                  })()}
                </span>
                
                {/* 分隔符 - 優雅的裝飾 */}
                <span 
                  style={{
                    color: elegantColors.accent,
                    fontSize: '12px',
                    opacity: 0.6,
                    fontWeight: '300'
                  }}
                >
                  •
                </span>
                
                {/* 內容文字 - 優雅的樣式 */}
                <span 
                  style={{ 
                    color: elegantColors.text,
                    fontSize: `${anim.fontSize ?? 20}px`,
                    fontWeight: '500',
                    letterSpacing: '0.5px',
                    textShadow: '0 2px 8px rgba(0, 0, 0, 0.4), 0 0 20px rgba(232, 213, 183, 0.3)',
                    lineHeight: '1.4'
                  }}
                >
                  {danmu.content}
                </span>
                
                {userRole === 'admin' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteDanmu(danmu.id)
                    }}
                    className="ml-2 text-red-300 hover:text-red-200 pointer-events-auto rounded-full w-6 h-6 flex items-center justify-center transition-all duration-200"
                    style={{ 
                      fontSize: '14px',
                      background: 'rgba(239, 68, 68, 0.2)',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      backdropFilter: 'blur(5px)'
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            )
          })}
        </div>
        
        {/* 彈幕動畫樣式 */}
        <style>{`
          /* 為每條彈幕創建獨立的動畫，純線性從右到左移動，無任何跳動或閃爍 */
          ${screenDanmus.map((danmu) => {
            const animName = danmu?._anim?.animationName
            if (!animName) return ''
            return `
            @keyframes ${animName} {
              from {
                left: 100%;
              }
              to {
                left: -100%;
              }
            }
          `
          }).join('')}

          @keyframes danmuMoveFallback {
            from { left: 100%; }
            to { left: -100%; }
          }
          
          .danmu-item {
            animation-fill-mode: forwards;
            position: absolute;
          }
          
          .danmu-item:hover {
            z-index: 1000 !important;
            animation-play-state: paused;
            background: linear-gradient(135deg, rgba(232, 213, 183, 0.25) 0%, rgba(212, 175, 55, 0.15) 100%) !important;
            border-color: rgba(212, 175, 55, 0.5) !important;
            box-shadow: 
              0 8px 30px rgba(0, 0, 0, 0.4),
              0 0 50px rgba(212, 175, 55, 0.2),
              inset 0 1px 0 rgba(255, 255, 255, 0.3) !important;
          }
          
          @keyframes nameEffectGlow {
            0%, 100% {
              filter: drop-shadow(0 0 10px rgba(255, 215, 0, 0.6)) brightness(1);
            }
            50% {
              filter: drop-shadow(0 0 20px rgba(255, 215, 0, 1)) drop-shadow(0 0 30px rgba(255, 165, 0, 0.8)) brightness(1.2);
            }
          }
          @keyframes nameEffectGlowStrong {
            0%, 100% {
              filter: drop-shadow(0 0 15px rgba(255, 215, 0, 0.9)) drop-shadow(0 0 25px rgba(255, 165, 0, 0.7)) brightness(1.1);
            }
            50% {
              filter: drop-shadow(0 0 28px rgba(255, 215, 0, 1)) drop-shadow(0 0 45px rgba(255, 165, 0, 0.9)) brightness(1.25);
            }
          }
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
          
          @keyframes messageEffectShimmer {
            0% {
              background-position: -200% 0;
            }
            100% {
              background-position: 200% 0;
            }
          }
        `}</style>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-bold text-yellow-400">交流區</h3>
          </div>
          <div className="flex items-center gap-2">
            {/* 彈幕按鈕 */}
            <button
              onClick={() => {
                if (!hasDanmuItem || danmuItemQuantity <= 0) {
                  alert('您沒有彈幕道具，無法發送彈幕！')
                  return
                }
                setShowDanmuInput(!showDanmuInput)
              }}
              disabled={!hasDanmuItem || danmuItemQuantity <= 0}
              className={`font-semibold px-3 py-1 rounded text-sm transition-colors flex items-center gap-1 ${
                hasDanmuItem && danmuItemQuantity > 0
                  ? 'bg-yellow-400 hover:bg-yellow-500 text-gray-800'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              <span>💬</span>
              <span>發彈幕</span>
            </button>
            
            {/* 管理員清除彈幕按鈕 */}
            {userRole === 'admin' && (
              <button
                onClick={handleClearAllDanmus}
                className="bg-red-500 hover:bg-red-600 text-white font-semibold px-3 py-1 rounded text-sm transition-colors"
              >
                清除彈幕
              </button>
            )}
          </div>
        </div>
        
        {/* 彈幕輸入框 */}
        {showDanmuInput && hasDanmuItem && danmuItemQuantity > 0 && (
          <div className="mb-4 p-4 bg-gray-900 rounded-lg border border-yellow-400">
            <form onSubmit={handleSendDanmu} className="flex gap-2">
              <input
                type="text"
                value={danmuContent}
                onChange={(e) => setDanmuContent(e.target.value)}
                placeholder="輸入彈幕內容..."
                maxLength={50}
                className="flex-1 bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
                autoFocus
              />
              <button
                type="submit"
                disabled={!danmuContent.trim() || !hasDanmuItem || danmuItemQuantity <= 0}
                className="bg-yellow-400 hover:bg-yellow-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-gray-800 font-semibold px-6 py-2 rounded transition-colors"
              >
                發送 {danmuItemQuantity > 0 && `(剩餘: ${danmuItemQuantity})`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDanmuInput(false)
                  setDanmuContent('')
                }}
                className="bg-gray-700 hover:bg-gray-600 text-white font-semibold px-4 py-2 rounded transition-colors"
              >
                取消
              </button>
            </form>
          </div>
        )}
        
        {/* 對話框：所有用戶直接發話，不需開設話題；僅發話內容區可上下滑動 */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 flex flex-col min-h-0 flex-1 max-h-[70vh]" style={{ minHeight: '50vh' }}>
          <button
            type="button"
            onClick={() => setIsChatCollapsed((v) => !v)}
            className="p-4 border-b border-gray-700 shrink-0 text-left hover:bg-gray-750 transition-colors cursor-pointer select-none"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-white">對話框</h3>
                <p className="text-sm sm:text-xs text-gray-400 mt-0.5">
                  {isChatCollapsed ? '點擊展開對話框' : '所有用戶在此發話，無需新增話題（點擊可收合）'}
                </p>
              </div>
              <div className="text-gray-300 text-lg leading-none mt-1">
                {isChatCollapsed ? '＋' : '－'}
              </div>
            </div>
          </button>

          {/* 發話內容區：僅此區可上下滑動，標題與輸入列固定 */}
          {!isChatCollapsed && (
          <div
            ref={chatScrollRef}
            onScroll={() => {
              const el = chatScrollRef.current
              if (!el) return
              // 距離底部小於 threshold 視為「在底部」
              const threshold = 120
              const dist = el.scrollHeight - el.scrollTop - el.clientHeight
              setStickToBottom(dist <= threshold)
            }}
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-auto p-4 space-y-4"
          >
            {messages.length === 0 ? (
              <div className="text-gray-400 text-center py-12">
                <p>尚無消息</p>
                <p className="text-sm mt-2">輸入下方訊息後按發送即可開始聊天</p>
              </div>
            ) : (
              messages.map((message) => {
                const nameEffectStyle = getNameEffectStyle(message.author)
                const messageEffectStyle = getMessageEffectStyle(message.author)
                const userTitle = getUserTitle(message.author)
                const nameDeco = getDecorationForNameEffect(message.author)
                return (
                  <div key={message.id} className="flex flex-col">
                    <div className="flex items-center space-x-2 mb-1 flex-wrap">
                      <span
                        className="font-semibold text-sm"
                        style={nameEffectStyle || { color: '#FFFFFF' }}
                      >
                        {getDisplayNameForAccount(message.author)}
                      </span>
                      {nameDeco && <span className={nameDeco.className}>{nameDeco.emoji}</span>}
                      {userTitle && (
                        <span className="text-xs font-bold rounded" style={getTitleBadgeStyle(message.author)}>
                          {userTitle}
                        </span>
                      )}
                      <span className="text-gray-500 text-sm sm:text-xs">
                        {formatTime(message.createdAt)}
                      </span>
                    </div>
                    <div
                      className="bg-gray-700 rounded-lg p-4 sm:p-3 text-base sm:text-sm"
                      style={messageEffectStyle ? { ...messageEffectStyle, color: '#F5F1E8' } : { color: '#FFFFFF' }}
                    >
                      {message.content}
                    </div>
                  </div>
                )
              })
            )}
            <div ref={messagesEndRef} />
          </div>
          )}

          {/* 發送者名稱顯示 */}
          {!isChatCollapsed && (
          <div className="px-4 py-2 border-t border-gray-700 bg-gray-900 shrink-0">
            <div className="text-gray-400 text-sm flex items-center flex-wrap gap-1">
              發送者: <span
                className="font-semibold"
                style={getNameEffectStyle(author) || { color: '#FFFFFF' }}
              >
                {getDisplayNameForAccount(author)}
              </span>
              {(() => {
                const authorDeco = getDecorationForNameEffect(author)
                return authorDeco ? <span className={authorDeco.className}>{authorDeco.emoji}</span> : null
              })()}
              {(() => {
                const authorTitle = getUserTitle(author)
                return authorTitle ? (
                  <span className="text-xs font-bold ml-2 rounded" style={getTitleBadgeStyle(author)}>
                    {authorTitle}
                  </span>
                ) : null
              })()}
            </div>
          </div>
          )}

          {/* 消息輸入框 */}
          {!isChatCollapsed && (
          <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-700 shrink-0">
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                placeholder="輸入消息..."
                className="flex-1 min-w-0 bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
              />
              <button
                type="submit"
                disabled={!messageContent.trim()}
                className="flex-shrink-0 bg-yellow-400 hover:bg-yellow-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-gray-800 font-semibold px-4 py-2 rounded transition-colors text-sm"
              >
                發送
              </button>
            </div>
          </form>
          )}
        </div>
      </div>
      </div>
    </>
  )
}

export default Memo
