import { useState, useEffect, useRef } from 'react'
import { getTopics, createTopic, addMessage, deleteTopic } from '../utils/memoStorage'
import { getCurrentUser, getCurrentUserRole } from '../utils/authStorage'
import { getAnnouncements, addAnnouncement, updateAnnouncement, deleteAnnouncement } from '../utils/announcementStorage'
import { getItem, getItems, ITEM_TYPES } from '../utils/itemStorage'
import { getUserInventory, hasItem, useItem, getItemQuantity, addItemToInventory, removeItemFromInventory } from '../utils/inventoryStorage'
import { getDanmus, addDanmu, deleteDanmu, clearAllDanmus, getActiveDanmus, cleanExpiredDanmus } from '../utils/danmuStorage'
import { getUsers } from '../utils/storage'
import { getEquippedEffects } from '../utils/effectStorage'
import { getEffectDisplayConfig, getStyleForPreset, getDecorationForPreset, getDecorationById } from '../utils/effectDisplayStorage'
import { getLeaderboardItems } from '../utils/leaderboardStorage'
import { REALTIME_UPDATE_EVENT } from '../utils/supabaseRealtime'

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
  
  // 交流區狀態
  const [topics, setTopics] = useState([])
  const [selectedTopicId, setSelectedTopicId] = useState(null)
  const [newTopicTitle, setNewTopicTitle] = useState('')
  const [showNewTopicForm, setShowNewTopicForm] = useState(false)
  const [messageContent, setMessageContent] = useState('')
  const [author, setAuthor] = useState('')
  const messagesEndRef = useRef(null)
  
  // 彈幕狀態
  const [danmus, setDanmus] = useState([])
  const [danmuContent, setDanmuContent] = useState('')
  const [showDanmuInput, setShowDanmuInput] = useState(false)
  const [hasDanmuItem, setHasDanmuItem] = useState(false)
  const [danmuItemQuantity, setDanmuItemQuantity] = useState(0)
  const [showInventory, setShowInventory] = useState(false)
  const [inventory, setInventory] = useState([])
  // 排行榜項目（用於名子／發話／稱號特效）：切回此頁或取得焦點時重讀，確保編輯排行榜後的設定會反映
  const [leaderboardItems, setLeaderboardItems] = useState(() => getLeaderboardItems())
  const [isChatCollapsed, setIsChatCollapsed] = useState(false) // 聊天區收合狀態



  // 公佈欄相關函數
  const loadAnnouncements = () => {
    const allAnnouncements = getAnnouncements()
    setAnnouncements(allAnnouncements)
  }

  // 交流區相關函數
  const loadTopics = () => {
    const allTopics = getTopics()
    setTopics(allTopics)
    // 如果有话题且没有选中，自动选中第一个
    if (allTopics.length > 0 && !selectedTopicId) {
      setSelectedTopicId(allTopics[0].id)
    }
  }

  useEffect(() => {
    // 自动获取当前登录用户名和角色
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
    loadTopics()
    loadDanmus()
    checkDanmuItem()
    loadInventory()
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
  
  // 定期更新彈幕列表並清理過期彈幕
  useEffect(() => {
    const interval = setInterval(() => {
      loadDanmus()
    }, 2000) // 每2秒更新一次
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    // 自动滚动到底部
    scrollToBottom()
  }, [selectedTopicId, topics])

  // 即時同步：有人新增/修改交流區、公佈欄、彈幕時，其他人不需重整即可看到
  useEffect(() => {
    const fn = (e) => {
      const k = e.detail?.key
      if (k === 'jiameng_memos') {
        const allTopics = getTopics()
        setTopics(allTopics)
        setSelectedTopicId((prev) => (allTopics.some((t) => t.id === prev) ? prev : (allTopics[0]?.id ?? null)))
      }
      if (k === 'jiameng_announcements') setAnnouncements(getAnnouncements())
      if (k === 'jiameng_danmus') setDanmus(getActiveDanmus())
    }
    window.addEventListener(REALTIME_UPDATE_EVENT, fn)
    return () => window.removeEventListener(REALTIME_UPDATE_EVENT, fn)
  }, [])

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

  const handleCreateTopic = (e) => {
    e.preventDefault()
    if (!newTopicTitle.trim()) {
      alert('請輸入話題標題')
      return
    }
    
    const result = createTopic(newTopicTitle.trim())
    if (result.success) {
      setNewTopicTitle('')
      setShowNewTopicForm(false)
      loadTopics()
      setSelectedTopicId(result.topic.id)
    } else {
      alert(result.message || '創建話題失敗')
    }
  }

  const handleSendMessage = (e) => {
    e.preventDefault()
    if (!messageContent.trim() || !selectedTopicId) {
      return
    }
    
    const result = addMessage(selectedTopicId, messageContent.trim(), author)
    if (result.success) {
      setMessageContent('')
      loadTopics()
      setTimeout(scrollToBottom, 100)
    } else {
      alert(result.message || '發送消息失敗')
    }
  }

  const handleDeleteTopic = (topicId) => {
    if (window.confirm('確定要刪除此話題嗎？所有消息將一併刪除。')) {
      const result = deleteTopic(topicId)
      if (result.success) {
        loadTopics()
        if (selectedTopicId === topicId) {
          setSelectedTopicId(null)
        }
      } else {
        alert(result.message || '刪除話題失敗')
      }
    }
  }

  const selectedTopic = topics.find(t => t.id === selectedTopicId)
  const messages = selectedTopic ? selectedTopic.messages : []

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
      <div className="bg-charcoal rounded-lg p-4 sm:p-6 min-h-screen relative">
      <h2 className="text-2xl font-bold text-yellow-400 mb-6">交流區</h2>
      
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
          {danmus.slice(-20).map((danmu, index) => {
            // 使用穩定的 hash 函數生成參數，避免重新渲染時改變
            const hash = (str) => {
              let hash = 0
              for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i)
                hash = ((hash << 5) - hash) + char
                hash = hash & hash // Convert to 32bit integer
              }
              return Math.abs(hash)
            }
            
            // 使用 danmu.id 生成穩定的參數
            const stableSeed = hash(danmu.id)
            const animationIndex = stableSeed % 10000 // 穩定的動畫索引
            const topPosition = 10 + (index % 10) * 8 + (stableSeed % 30) / 10 // 分散在不同高度，10-90%
            const animationDuration = 15 + (stableSeed % 40) / 10 // 15-19秒，更慢的速度
            const animationDelay = (stableSeed % 15) / 10 // 0-1.5秒延遲，穩定
            const fontSize = 20 + (stableSeed % 60) / 10 // 20-26px，穩定的字體大小
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
                  top: `${topPosition}%`,
                  left: '100%',
                  animation: `danmuMove${animationIndex} ${animationDuration}s linear ${animationDelay}s forwards`,
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
                  {danmu.author}
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
                    fontSize: `${fontSize}px`,
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
          ${danmus.slice(-20).map((danmu, index) => {
            const hash = (str) => {
              let hash = 0
              for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i)
                hash = ((hash << 5) - hash) + char
                hash = hash & hash
              }
              return Math.abs(hash)
            }
            const stableSeed = hash(danmu.id)
            const animationIndex = stableSeed % 10000 // 使用穩定的索引
            return `
            @keyframes danmuMove${animationIndex} {
              from {
                left: 100%;
              }
              to {
                left: -100%;
              }
            }
          `
          }).join('')}
          
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
        
        {/* 管理員道具分配表單 */}

        <div className={`grid gap-6 h-[calc(100vh-500px)] min-h-[400px] ${isChatCollapsed ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-3'}`}>
        {/* 左侧：话题列表 */}
        <div className={`bg-gray-800 rounded-lg p-2 sm:p-4 border border-gray-700 flex flex-col ${isChatCollapsed ? 'lg:col-span-1' : 'lg:col-span-1'}`}>
          <div className="flex items-center justify-between mb-2 sm:mb-4">
            <h3 className="text-xs sm:text-sm font-semibold text-white">話題列表</h3>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setIsChatCollapsed(!isChatCollapsed)}
                className="bg-gray-600 hover:bg-gray-500 text-white font-semibold px-2 py-0.5 rounded text-[10px] sm:text-xs transition-colors"
                title={isChatCollapsed ? '展開聊天' : '收合聊天'}
              >
                {isChatCollapsed ? '▶' : '◀'}
              </button>
              <button
                onClick={() => setShowNewTopicForm(!showNewTopicForm)}
                className="bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold px-2 py-0.5 rounded text-[10px] sm:text-xs transition-colors"
              >
                + 新增話題
              </button>
            </div>
          </div>

          {/* 新增话题表单 */}
          {showNewTopicForm && (
            <form onSubmit={handleCreateTopic} className="mb-4 pb-4 border-b border-gray-700">
              <input
                type="text"
                value={newTopicTitle}
                onChange={(e) => setNewTopicTitle(e.target.value)}
                placeholder="請輸入話題標題"
                className="w-full bg-gray-700 border border-gray-500 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 mb-2"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold py-1 rounded text-sm transition-colors"
                >
                  創建
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewTopicForm(false)
                    setNewTopicTitle('')
                  }}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-1 rounded text-sm transition-colors"
                >
                  取消
                </button>
              </div>
            </form>
          )}

          {/* 话题列表 */}
          <div className="flex-1 overflow-y-auto">
            {topics.length === 0 ? (
              <div className="text-gray-400 text-center py-8 text-[10px] sm:text-xs">
                尚無話題，點擊「新增話題」開始
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-1 sm:gap-2">
                {topics.map((topic) => (
                  <div
                    key={topic.id}
                    onClick={() => setSelectedTopicId(topic.id)}
                    className={`p-1.5 sm:p-2 rounded cursor-pointer transition-colors ${
                      selectedTopicId === topic.id
                        ? 'bg-yellow-400 text-gray-800'
                        : 'bg-gray-700 text-white hover:bg-gray-600'
                    }`}
                  >
                    <div className="flex flex-col items-center text-center min-h-0">
                      <div className="font-semibold truncate w-full text-[10px] sm:text-xs mb-0.5">{topic.title}</div>
                      <div className={`text-[9px] sm:text-[10px] ${
                        selectedTopicId === topic.id ? 'text-gray-600' : 'text-gray-400'
                      }`}>
                        {topic.messages.length} 則
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteTopic(topic.id)
                        }}
                        className={`mt-1 text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                          selectedTopicId === topic.id
                            ? 'bg-red-500 hover:bg-red-600 text-white'
                            : 'bg-gray-600 hover:bg-red-500 text-gray-300 hover:text-white'
                        }`}
                      >
                        刪除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 右侧：聊天界面 */}
        {!isChatCollapsed && (
          <div className="lg:col-span-2 bg-gray-800 rounded-lg border border-gray-700 flex flex-col">
            {selectedTopic ? (
              <>
                {/* 话题标题栏 */}
                <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{selectedTopic.title}</h3>
                    <div className="text-sm sm:text-xs text-gray-400 mt-1">
                      創建於 {new Date(selectedTopic.createdAt).toLocaleString('zh-TW')}
                    </div>
                  </div>
                  <button
                    onClick={() => setIsChatCollapsed(true)}
                    className="text-gray-400 hover:text-white transition-colors ml-2"
                    title="收合聊天"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

              {/* 消息列表 */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                  <div className="text-gray-400 text-center py-12">
                    <p>尚無消息</p>
                    <p className="text-sm mt-2">開始發送第一則消息吧！</p>
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
                          {message.author}
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

              {/* 发送者名称显示（只读）：顯示註冊名 */}
              <div className="px-4 py-2 border-t border-gray-700 bg-gray-900">
                <div className="text-gray-400 text-sm flex items-center flex-wrap gap-1">
                  發送者: <span 
                    className="font-semibold"
                    style={getNameEffectStyle(author) || { color: '#FFFFFF' }}
                  >
                    {(getUsers().find((x) => x.account === author)?.name) || author}
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

              {/* 消息输入框 */}
              <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-700">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={messageContent}
                    onChange={(e) => setMessageContent(e.target.value)}
                    placeholder="輸入消息..."
                    className="flex-1 bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
                  />
                  <button
                    type="submit"
                    disabled={!messageContent.trim()}
                    className="bg-yellow-400 hover:bg-yellow-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-gray-800 font-semibold px-6 py-2 rounded transition-colors"
                  >
                    發送
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-gray-400">
                <p className="text-lg mb-2">請選擇一個話題</p>
                <p className="text-sm">或創建新話題開始聊天</p>
              </div>
            </div>
          )}
          </div>
        )}
      </div>
    </div>
    </div>
    </>
  )
}

export default Memo
