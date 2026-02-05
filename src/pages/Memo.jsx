import { useState, useEffect, useRef } from 'react'
import { getGlobalMessages, addGlobalMessage, getOrCreateGlobalTopic, cleanExpiredMessages, clearGlobalMessages } from '../utils/memoStorage'
import { getCurrentUser, getCurrentUserRole } from '../utils/authStorage'
import { getItem, getItems, ITEM_TYPES } from '../utils/itemStorage'
import { getUserInventory, hasItem, useItem, getItemQuantity, addItemToInventory, removeItemFromInventory } from '../utils/inventoryStorage'
import { getDanmus, addDanmu, deleteDanmu, clearAllDanmus, getActiveDanmus, cleanExpiredDanmus } from '../utils/danmuStorage'
import { getUsers } from '../utils/storage'
import { getEquippedEffects } from '../utils/effectStorage'
import { getEffectDisplayConfig, getStyleForPreset, getDecorationForPreset, getDecorationById } from '../utils/effectDisplayStorage'
import { getLeaderboardItems } from '../utils/leaderboardStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { getDisplayNamesForAccount } from '../utils/dropdownStorage'
import { addWalletBalance, addTransaction } from '../utils/walletStorage'
import { touchLastSeen } from '../utils/lastSeenStorage'
import {
  getKeywordRewardRules,
  addKeywordRewardRule,
  updateKeywordRewardRule,
  deleteKeywordRewardRule,
  canClaimGlobalKeywordReward,
  markGlobalKeywordRewardClaimed,
  canClaimKeywordReward,
  markKeywordRewardClaimed,
  matchKeywordReward
} from '../utils/keywordRewardStorage'

function Memo() {
  const [userRole, setUserRole] = useState(null)
  const [currentUser, setCurrentUser] = useState('')
  
  // 交流區狀態（單一對話框，所有用戶直接發話；公佈欄已移至首頁）
  const [messages, setMessages] = useState([])
  const [messageContent, setMessageContent] = useState('')
  const [author, setAuthor] = useState('')
  // 交流區關鍵字獎勵（管理員設定）
  const [keywordRewardRules, setKeywordRewardRules] = useState([])
  const [showKeywordRewardAdmin, setShowKeywordRewardAdmin] = useState(false)
  const [editingRuleId, setEditingRuleId] = useState(null)
  const [ruleForm, setRuleForm] = useState({
    keyword: '',
    match: 'includes',
    ignoreCase: true,
    rewardType: 'item',
    itemId: 'danmu_item',
    quantity: 1,
    coinAmount: 10,
    cooldownSec: 30,
    dailyLimit: 5,
    enabled: true
  })
  const [keywordRewardNotice, setKeywordRewardNotice] = useState('')
  const keywordRewardNoticeTimerRef = useRef(null)
  const [isChatCollapsed, setIsChatCollapsed] = useState(false)
  const chatScrollRef = useRef(null)
  const [stickToBottom, setStickToBottom] = useState(true)
  const forceScrollNextRef = useRef(false) // 發送訊息後強制捲到底一次
  const messagesEndRef = useRef(null)
  const chatScrollRestoredRef = useRef(false)
  const CHAT_SCROLL_KEY = 'jiameng_memo_chat_scroll_v1'
  
  // 彈幕狀態
  const [danmus, setDanmus] = useState([])
  // 彈幕顯示：最多同時 15 條，超過排隊依序播放，避免「別人的彈幕被刷掉沒出現」
  const [screenDanmus, setScreenDanmus] = useState([])
  const [danmuEnabled, setDanmuEnabled] = useState(() => {
    try {
      const v = localStorage.getItem('jiameng_memo_danmu_enabled')
      return v == null ? true : v === '1'
    } catch (_) {
      return true
    }
  })
  const danmuQueueRef = useRef([])
  const danmuSeenRef = useRef(new Set())
  const danmuLaneRef = useRef(0)
  const danmuLaneNextAtRef = useRef([0, 0, 0, 0]) // 每條跑道下一次允許發射時間（ms）
  const danmuLaneSpeedCapRef = useRef([Infinity, Infinity, Infinity, Infinity]) // 每條跑道「後車不得更快」速度上限
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



  const loadKeywordRewardRules = () => {
    try {
      setKeywordRewardRules(getKeywordRewardRules())
    } catch (_) {
      setKeywordRewardRules([])
    }
  }

  const loadMessages = () => {
    getOrCreateGlobalTopic()
    // 交流區：只保留一天內容
    cleanExpiredMessages()
    const next = getGlobalMessages()
    // 避免資料沒變卻重設 state，導致使用者滑動時一直被觸發「自動捲到底」
    setMessages((prev) => {
      const a = Array.isArray(prev) ? prev : []
      const b = Array.isArray(next) ? next : []
      if (a.length === b.length) {
        const a0 = a[0]?.id
        const b0 = b[0]?.id
        const aLast = a[a.length - 1]?.id
        const bLast = b[b.length - 1]?.id
        if (a0 === b0 && aLast === bLast) return prev
      }
      return b
    })
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
    loadMessages()
    loadKeywordRewardRules()
    loadDanmus()
    checkDanmuItem()
    loadInventory()
  }, [currentUser])

  // 進入交流區就視為已查看對話框（公佈欄已移至首頁）
  useEffect(() => {
    if (!currentUser) return
    touchLastSeen(currentUser, 'memo_chat')
  }, [currentUser])

  // 交流區：記住捲動位置，避免切換分頁回來跳到最上面
  useEffect(() => {
    const el = chatScrollRef.current
    // 第一次進來：若沒有歷史紀錄，直接捲到底
    try {
      const saved = sessionStorage.getItem(CHAT_SCROLL_KEY)
      if (!saved) {
        // 等 DOM 內容出來後再捲到底
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
        }, 0)
      }
    } catch (_) {}

    return () => {
      const el2 = chatScrollRef.current
      if (!el2) return
      try {
        const dist = el2.scrollHeight - el2.scrollTop - el2.clientHeight
        const nearBottom = dist <= 140
        sessionStorage.setItem(CHAT_SCROLL_KEY, JSON.stringify({ top: el2.scrollTop, nearBottom, savedAt: Date.now() }))
      } catch (_) {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  
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

    const el = chatScrollRef.current
    const threshold = 120
    const dist = el ? (el.scrollHeight - el.scrollTop - el.clientHeight) : 0
    const nearBottom = !el ? true : dist <= threshold

    // 切回交流區：優先恢復上次捲動位置（只做一次）
    if (!chatScrollRestoredRef.current && el) {
      chatScrollRestoredRef.current = true
      try {
        const saved = sessionStorage.getItem(CHAT_SCROLL_KEY)
        if (saved) {
          const s = JSON.parse(saved)
          // 若上次在底部，回來就維持底部；否則回到原位置
          setTimeout(() => {
            if (!chatScrollRef.current) return
            if (s?.nearBottom) messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
            else chatScrollRef.current.scrollTop = Math.max(0, Number(s?.top) || 0)
          }, 0)
        }
      } catch (_) {}
    }

    // 以「當下真實捲動位置」為準，避免 stickToBottom state 因重渲染/高度變化而誤判
    if (forceScrollNextRef.current || nearBottom) {
      forceScrollNextRef.current = false
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
    }
  }, [messages, isChatCollapsed])

  // 即時同步：交流區、彈幕、道具、用戶、排行榜等變更時重讀（公佈欄在首頁）
  const refetchMemo = () => {
    loadMessages()
    loadKeywordRewardRules()
    setDanmus(getActiveDanmus())
    checkDanmuItem()
    loadInventory()
    setLeaderboardItems(getLeaderboardItems())
  }
  useRealtimeKeys(
    [
      'jiameng_memos',
      'jiameng_danmus',
      'jiameng_items',
      'jiameng_inventories',
      'jiameng_users',
      'jiameng_equipped_effects',
      'jiameng_effect_display_config',
      'jiameng_leaderboard_items',
      'jiameng_keyword_reward_rules',
      'jiameng_keyword_reward_claims'
    ],
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

  const scrollToBottom = () => {
    // 用 auto 避免「回彈感」；且只在必要時呼叫（發送訊息時）
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
  }

  const showKeywordNotice = (text) => {
    try {
      setKeywordRewardNotice(text || '')
      if (keywordRewardNoticeTimerRef.current) clearTimeout(keywordRewardNoticeTimerRef.current)
      keywordRewardNoticeTimerRef.current = setTimeout(() => setKeywordRewardNotice(''), 3000)
    } catch (_) {}
  }

  const applyKeywordRewardsForMessage = (text) => {
    const acc = String(currentUser || '').trim()
    if (!acc) return
    // 發放時以 localStorage 為準，避免 state 尚未同步造成「看得到規則但不發」
    const rules = getKeywordRewardRules()
    if (rules.length === 0) return

    const now = Date.now()
    // 全局防刷：短時間連發 / 每日總上限
    if (!canClaimGlobalKeywordReward(acc, now)) {
      // 只有在「確實命中任一條規則」時才提示，避免一般聊天也跳提示
      const hitAny = rules.some((r) => r?.enabled && matchKeywordReward(text, r))
      if (hitAny) showKeywordNotice('關鍵字獎勵：發送太快或今日領取已達上限（請稍後再試）')
      return
    }

    // 防刷：同一則訊息最多觸發 1 條規則（避免同時命中多個關鍵字狂刷）
    let awardedText = ''
    let blockedReason = ''
    for (const r of rules) {
      if (!r?.enabled) continue
      if (!matchKeywordReward(text, r)) continue
      if (!canClaimKeywordReward(acc, r, now)) {
        // 只記錄第一個命中的擋下原因（避免連續提示）
        if (!blockedReason) {
          const cd = Math.max(0, Math.floor(Number(r?.cooldownSec) || 0))
          const lim = Math.max(0, Math.floor(Number(r?.dailyLimit) || 0))
          blockedReason = cd > 0
            ? `關鍵字獎勵：「${r.keyword || ''}」冷卻中（${cd}s）`
            : (lim > 0 ? `關鍵字獎勵：「${r.keyword || ''}」今日領取已達上限（${lim} 次）` : '關鍵字獎勵：目前不可領取（防刷限制）')
        }
        continue
      }

      if (r.rewardType === 'coin') {
        const amt = Math.max(1, Math.floor(Number(r.coinAmount) || 1))
        const res = addWalletBalance(acc, amt)
        if (res?.success === false) {
          showKeywordNotice('關鍵字獎勵：發放失敗（錢包更新失敗）')
          return
        }
        addTransaction({
          type: 'keyword_reward',
          from: 'system',
          to: acc,
          amount: amt,
          description: `關鍵字獎勵：${r.keyword || ''}`
        })
        markKeywordRewardClaimed(acc, r.id, now)
        markGlobalKeywordRewardClaimed(acc, now)
        awardedText = `佳盟幣 +${amt}`
      } else {
        const itemId = String(r.itemId || '').trim()
        if (!itemId) continue
        const qty = Math.max(1, Math.floor(Number(r.quantity) || 1))
        // 驗證發放前後數量，避免「寫入被覆蓋/未成功」但 UI 沒提示
        const beforeQty = getItemQuantity(acc, itemId)
        const res = addItemToInventory(acc, itemId, qty)
        const afterQty = getItemQuantity(acc, itemId)
        if (res?.success === false || afterQty < beforeQty + qty) {
          showKeywordNotice('關鍵字獎勵：發放失敗（背包未更新，請稍後再試）')
          return
        }
        markKeywordRewardClaimed(acc, r.id, now)
        const item = getItem(itemId)
        markGlobalKeywordRewardClaimed(acc, now)
        awardedText = `${item?.name || itemId} x${qty}`
      }
      break
    }

    if (awardedText) {
      showKeywordNotice(`已獲得獎勵：${awardedText}`)
      // 背包顯示更新
      loadInventory()
      checkDanmuItem()
    } else if (blockedReason) {
      // 命中了關鍵字，但被冷卻/上限擋下
      showKeywordNotice(blockedReason)
    }
  }

  const handleSendMessage = (e) => {
    e.preventDefault()
    if (!messageContent.trim()) return
    forceScrollNextRef.current = true
    const text = messageContent.trim()
    const result = addGlobalMessage(text, author)
    if (result.success) {
      setMessageContent('')
      loadMessages()
      // 只有「送出訊息的人」在本機觸發獎勵，避免多人裝置同時重複發放
      applyKeywordRewardsForMessage(text)
      // 發送者自己：確保捲到底一次（避免等待 effect）
      setTimeout(scrollToBottom, 50)
    } else {
      alert(result.message || '發送消息失敗')
    }
  }

  const handleClearChatMessages = () => {
    if (userRole !== 'admin') return
    if (!window.confirm('確定要清除交流區「對話框」所有對話內容嗎？此操作會同步到所有裝置，且無法復原。')) return
    const r = clearGlobalMessages()
    if (r?.success) {
      // 立即清空 UI，避免看起來像沒清掉
      setMessages([])
      setMessageContent('')
      try { sessionStorage.removeItem(CHAT_SCROLL_KEY) } catch (_) {}
      try { chatScrollRestoredRef.current = false } catch (_) {}
      // 重新載入一次（確保與本地儲存一致）
      loadMessages()
      setTimeout(() => {
        try { messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }) } catch (_) {}
      }, 0)
      alert('已清除對話內容')
    } else {
      alert(r?.message || '清除失敗')
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
    // 只載入保留期內的活躍彈幕（保留期在 danmuStorage 內設定）
    const activeDanmus = getActiveDanmus()
    setDanmus(activeDanmus)
  }

  // 彈幕排隊播放：確保同時最多 15 條，新的會排隊逐一顯示
  useEffect(() => {
    if (!danmuEnabled) {
      // 關閉彈幕：停止排隊與顯示，並清空畫面（避免看起來還在跑）
      try {
        Object.values(danmuTimersRef.current || {}).forEach((t) => { try { clearTimeout(t) } catch (_) {} })
        danmuTimersRef.current = {}
      } catch (_) {}
      try { danmuQueueRef.current = [] } catch (_) {}
      try { danmuSeenRef.current = new Set() } catch (_) {}
      setScreenDanmus([])
      return
    }

    const MAX_ON_SCREEN = 16
    const LANES = 4 // 4 條跑道，最多 16 條（每 4 條加速一段）

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
          const slotIndex = next.length
          // 速度分段：1-4 正常、5-8 加速、9-12 再加速、13-16 更快（讓後面追上前面）
          const tier = Math.floor(slotIndex / 4) // 0..3
          const lane = slotIndex % LANES
          // 用 px 固定跑道位置，避免不同高度下跑出格子
          const topPosition = 10 + lane * 28 // 10/38/66/94
          const base = 12 // 秒
          const speedFactorWanted = 1 + tier * 0.35
          // 不要重疊：同一跑道「後面的彈幕」不能比前面更快，避免追上重疊
          const laneCap = (danmuLaneSpeedCapRef.current?.[lane] ?? Infinity)
          const speedFactor = Math.min(speedFactorWanted, laneCap)
          // 若這一條變慢了，後續同跑道也跟著不要更快
          danmuLaneSpeedCapRef.current[lane] = speedFactor

          const duration = Math.max(4.8, (base / speedFactor) + ((seed % 9) - 4) / 30)
          // 同跑道最小發射間距（秒）：避免同速也貼太近
          const minHeadwayMs = 1500
          const nowMs = Date.now()
          const laneNextAt = danmuLaneNextAtRef.current?.[lane] ?? 0
          const extraDelay = Math.max(0, laneNextAt - nowMs) / 1000
          const delay = extraDelay + (seed % 4) / 50 // 加一點點隨機，避免完全同步
          danmuLaneNextAtRef.current[lane] = Math.max(laneNextAt, nowMs) + minHeadwayMs
          const fontSize = 14 + (seed % 10) / 5 // 14 ~ 16px
          const animationName = safeAnimName(id)

          // 到期移除，空位再補下一條
          const ttlMs = Math.round((duration + delay) * 1000) + 200
          try {
            if (danmuTimersRef.current[id]) clearTimeout(danmuTimersRef.current[id])
            danmuTimersRef.current[id] = setTimeout(() => {
              setScreenDanmus((cur) => {
                const arr = Array.isArray(cur) ? cur : []
                const filtered = arr.filter((x) => String(x?.id || '') !== id)
                // 若此跑道已清空，解除速度上限，讓下一輪可以再次加速
                const stillHasSameLane = filtered.some((x) => (x?._anim?.lane ?? -1) === lane)
                if (!stillHasSameLane) {
                  danmuLaneSpeedCapRef.current[lane] = Infinity
                  danmuLaneNextAtRef.current[lane] = 0
                }
                return filtered
              })
              try { delete danmuTimersRef.current[id] } catch (_) {}
              setTimeout(() => drain(), 0)
            }, ttlMs)
          } catch (_) {}

          next.push({ ...d, _anim: { animationName, lane, topPosition, duration, delay, fontSize } })
        }
        return next
      })
    }

    drain()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [danmus, danmuEnabled])

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
        // 立即清空畫面上的彈幕（不等動畫/計時器自然結束），避免看起來像「沒清除」
        try {
          Object.values(danmuTimersRef.current || {}).forEach((t) => { try { clearTimeout(t) } catch (_) {} })
          danmuTimersRef.current = {}
        } catch (_) {}
        try { danmuQueueRef.current = [] } catch (_) {}
        try { danmuSeenRef.current = new Set() } catch (_) {}
        setScreenDanmus([])
        setDanmus([])

        loadDanmus()
        alert('已清除所有彈幕')
      } else {
        alert(result.message || '清除失敗')
      }
    }
  }

  const toggleDanmuEnabled = () => {
    setDanmuEnabled((prev) => {
      const next = !prev
      try { localStorage.setItem('jiameng_memo_danmu_enabled', next ? '1' : '0') } catch (_) {}
      return next
    })
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

      {/* 交流區：對話框 + 彈幕（公佈欄已移至首頁） */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 relative" style={{ overflow: 'hidden', position: 'relative' }}>
        
        {/* 彈幕動畫樣式 */}
        <style>{`
          /* 彈幕：使用 transform(translate3d) 動畫，GPU 友善，降低卡頓 */
          @keyframes danmuMove {
            from { transform: translate3d(110vw, 0, 0); }
            to { transform: translate3d(-160vw, 0, 0); }
          }
          
          .danmu-item {
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
            {userRole === 'admin' && (
              <button
                type="button"
                onClick={() => setShowKeywordRewardAdmin((v) => !v)}
                className="project-no-print bg-gray-700 hover:bg-gray-600 text-white text-xs px-3 py-1 rounded-lg transition-colors"
                title="設定交流區關鍵字自動發放獎勵"
              >
                關鍵字獎勵
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* 彈幕開關 */}
            <button
              type="button"
              onClick={toggleDanmuEnabled}
              className={`font-semibold px-3 py-2 rounded text-sm transition-colors border ${
                danmuEnabled
                  ? 'bg-gray-900 border-gray-600 text-gray-100 hover:bg-gray-800'
                  : 'bg-gray-900 border-gray-600 text-gray-400 hover:bg-gray-800'
              }`}
              title={danmuEnabled ? '關閉彈幕顯示' : '開啟彈幕顯示'}
            >
              {danmuEnabled ? '彈幕：開' : '彈幕：關'}
            </button>

            {/* 發彈幕按鈕 */}
            <button
              onClick={() => {
                if (!hasDanmuItem || danmuItemQuantity <= 0) {
                  alert('您沒有彈幕道具，無法發送彈幕！')
                  return
                }
                setShowDanmuInput(!showDanmuInput)
              }}
              disabled={!hasDanmuItem || danmuItemQuantity <= 0}
              className={`font-semibold px-4 py-2 rounded text-sm transition-colors flex items-center gap-2 border ${
                hasDanmuItem && danmuItemQuantity > 0
                  ? 'bg-yellow-400 hover:bg-yellow-500 text-gray-900 border-yellow-300'
                  : 'bg-gray-700 text-gray-400 cursor-not-allowed border-gray-600'
              }`}
            >
              <span>💬</span>
              <span>發彈幕</span>
            </button>
            
            {/* 管理員清除彈幕按鈕 */}
            {userRole === 'admin' && (
              <button
                onClick={handleClearAllDanmus}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded text-sm transition-colors border border-red-500"
              >
                清除彈幕
              </button>
            )}

            {/* 管理員清除對話內容 */}
            {userRole === 'admin' && (
              <button
                type="button"
                onClick={handleClearChatMessages}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded text-sm transition-colors border border-red-500"
                title="清除交流區對話框所有訊息"
              >
                清除對話
              </button>
            )}
          </div>
        </div>

        {/* 彈幕牆：固定在交流區這個區塊內（不覆蓋整頁） */}
        {danmuEnabled && (
          <div className="relative mb-4 h-32 sm:h-36 bg-gray-900/40 border border-gray-700 rounded-lg overflow-hidden pointer-events-none">
          {screenDanmus.map((danmu) => {
            const anim = danmu?._anim || {}
            const danmuId = `danmu-${danmu.id}`
            return (
              <div
                key={danmuId}
                className="absolute pointer-events-none whitespace-nowrap danmu-item"
                style={{
                  top: `${anim.topPosition ?? 10}px`,
                  left: 0,
                  transform: 'translate3d(110vw, 0, 0)',
                  animationName: 'danmuMove',
                  animationDuration: `${anim.duration ?? 12}s`,
                  animationTimingFunction: 'linear',
                  animationDelay: `${anim.delay ?? 0}s`,
                  animationFillMode: 'forwards',
                  willChange: 'transform',
                  backfaceVisibility: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  background: 'linear-gradient(135deg, rgba(232, 213, 183, 0.10) 0%, rgba(212, 175, 55, 0.06) 100%)',
                  backdropFilter: 'blur(6px)',
                  borderRadius: '16px',
                  border: '1px solid rgba(212, 175, 55, 0.22)',
                  boxShadow: '0 2px 10px rgba(0, 0, 0, 0.25)'
                }}
              >
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full"
                  style={{
                    background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.35) 0%, rgba(201, 169, 97, 0.25) 100%)',
                    border: '1px solid rgba(212, 175, 55, 0.45)',
                    color: '#D4AF37',
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.5px',
                    textShadow: '0 1px 2px rgba(0, 0, 0, 0.35)'
                  }}
                >
                  {getDisplayNameForAccount(danmu.author)}
                </span>
                <span
                  style={{
                    color: '#C9A961',
                    fontSize: '10px',
                    opacity: 0.6,
                    fontWeight: 300
                  }}
                >
                  ·
                </span>
                <span
                  style={{
                    color: '#F5F1E8',
                    fontSize: `${anim.fontSize ?? 14}px`,
                    fontWeight: 500,
                    letterSpacing: '0.2px',
                    textShadow: '0 2px 6px rgba(0, 0, 0, 0.45)',
                    lineHeight: '1.2'
                  }}
                >
                  {danmu.content}
                </span>
              </div>
            )
          })}
          </div>
        )}
        
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

        {/* 關鍵字獎勵提示（所有人可見自己的獲得提示） */}
        {keywordRewardNotice && (
          <div className="mb-3 text-sm text-green-300 bg-green-900/30 border border-green-700 rounded-lg px-3 py-2">
            {keywordRewardNotice}
          </div>
        )}

        {/* 管理員：關鍵字獎勵設定 */}
        {userRole === 'admin' && showKeywordRewardAdmin && (
          <div className="project-no-print mb-4 p-4 bg-gray-900 rounded-lg border border-gray-700">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="text-yellow-400 font-semibold">關鍵字獎勵設定</div>
              <button
                type="button"
                onClick={() => {
                  setEditingRuleId(null)
                  setRuleForm({
                    keyword: '',
                    match: 'includes',
                    ignoreCase: true,
                    rewardType: 'item',
                    itemId: 'danmu_item',
                    quantity: 1,
                    coinAmount: 10,
                    cooldownSec: 30,
                    enabled: true
                  })
                }}
                className="bg-yellow-400 hover:bg-yellow-500 text-gray-900 text-xs font-semibold px-3 py-1.5 rounded-lg"
              >
                + 新增規則
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-300 text-xs mb-1">關鍵字</label>
                <input
                  value={ruleForm.keyword}
                  onChange={(e) => setRuleForm((p) => ({ ...p, keyword: e.target.value }))}
                  placeholder='例如：我要拿彈幕'
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-300 text-xs mb-1">比對</label>
                  <select
                    value={ruleForm.match}
                    onChange={(e) => setRuleForm((p) => ({ ...p, match: e.target.value }))}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                  >
                    <option value="includes">包含</option>
                    <option value="equals">完全相同</option>
                  </select>
                </div>
                <div className="flex items-end gap-2">
                  <label className="flex items-center gap-2 text-gray-300 text-xs select-none">
                    <input
                      type="checkbox"
                      checked={!!ruleForm.ignoreCase}
                      onChange={(e) => setRuleForm((p) => ({ ...p, ignoreCase: e.target.checked }))}
                      className="w-4 h-4 accent-yellow-400"
                    />
                    不分大小寫
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-300 text-xs mb-1">獎勵類型</label>
                  <select
                    value={ruleForm.rewardType}
                    onChange={(e) => setRuleForm((p) => ({ ...p, rewardType: e.target.value }))}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                  >
                    <option value="item">道具</option>
                    <option value="coin">佳盟幣</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-300 text-xs mb-1">冷卻(秒)</label>
                  <input
                    type="number"
                    min="0"
                    value={ruleForm.cooldownSec}
                    onChange={(e) => setRuleForm((p) => ({ ...p, cooldownSec: e.target.value === '' ? '' : (parseInt(e.target.value) || 0) }))}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                  />
                </div>
              </div>
          <div>
            <label className="block text-gray-300 text-xs mb-1">每日上限(次)（0=不限）</label>
            <input
              type="number"
              min="0"
              value={ruleForm.dailyLimit}
              onChange={(e) => setRuleForm((p) => ({ ...p, dailyLimit: e.target.value === '' ? '' : (parseInt(e.target.value) || 0) }))}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
            />
            <div className="text-[11px] text-gray-500 mt-1">
              防刷：同一人同一條規則每天最多領取此上限；另有全局限制（短時間連發不給、每日總上限）。
            </div>
          </div>

              {ruleForm.rewardType === 'coin' ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-gray-300 text-xs mb-1">佳盟幣數量</label>
                    <input
                      type="number"
                      min="1"
                      value={ruleForm.coinAmount}
                      onChange={(e) => setRuleForm((p) => ({ ...p, coinAmount: e.target.value === '' ? '' : (parseInt(e.target.value) || 0) }))}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-gray-300 text-xs select-none">
                      <input
                        type="checkbox"
                        checked={!!ruleForm.enabled}
                        onChange={(e) => setRuleForm((p) => ({ ...p, enabled: e.target.checked }))}
                        className="w-4 h-4 accent-yellow-400"
                      />
                      啟用
                    </label>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-gray-300 text-xs mb-1">道具</label>
                    <select
                      value={ruleForm.itemId}
                      onChange={(e) => setRuleForm((p) => ({ ...p, itemId: e.target.value }))}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                    >
                      {(getItems() || []).map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.icon} {it.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-gray-300 text-xs mb-1">數量</label>
                      <input
                        type="number"
                        min="1"
                        value={ruleForm.quantity}
                        onChange={(e) => setRuleForm((p) => ({ ...p, quantity: e.target.value === '' ? '' : (parseInt(e.target.value) || 1) }))}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-gray-300 text-xs select-none">
                        <input
                          type="checkbox"
                          checked={!!ruleForm.enabled}
                          onChange={(e) => setRuleForm((p) => ({ ...p, enabled: e.target.checked }))}
                          className="w-4 h-4 accent-yellow-400"
                        />
                        啟用
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                onClick={() => {
                  const kw = String(ruleForm.keyword || '').trim()
                  if (!kw) { alert('請輸入關鍵字'); return }
                  if (ruleForm.rewardType === 'item' && !String(ruleForm.itemId || '').trim()) { alert('請選擇道具'); return }
                  const payload = { ...ruleForm, cooldownSec: parseInt(ruleForm.cooldownSec) || 0 }
                  if (editingRuleId) {
                    const r = updateKeywordRewardRule(editingRuleId, payload)
                    if (!r?.success) { alert(r?.message || '更新失敗'); return }
                    setEditingRuleId(null)
                  } else {
                    const r = addKeywordRewardRule(payload)
                    if (!r?.success) { alert(r?.message || '新增失敗'); return }
                  }
                  loadKeywordRewardRules()
                  setRuleForm({
                    keyword: '',
                    match: 'includes',
                    ignoreCase: true,
                    rewardType: 'item',
                    itemId: 'danmu_item',
                    quantity: 1,
                    coinAmount: 10,
                    cooldownSec: 30,
                    dailyLimit: 5,
                    enabled: true
                  })
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg text-sm"
              >
                {editingRuleId ? '保存規則' : '新增規則'}
              </button>
              {editingRuleId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingRuleId(null)
                    setRuleForm({
                      keyword: '',
                      match: 'includes',
                      ignoreCase: true,
                      rewardType: 'item',
                      itemId: 'danmu_item',
                      quantity: 1,
                      coinAmount: 10,
                      cooldownSec: 30,
                      dailyLimit: 5,
                      enabled: true
                    })
                  }}
                  className="bg-gray-700 hover:bg-gray-600 text-white font-semibold px-4 py-2 rounded-lg text-sm"
                >
                  取消編輯
                </button>
              )}
            </div>

            <div className="mt-4 border-t border-gray-700 pt-3">
              <div className="text-gray-300 text-sm mb-2">現有規則</div>
              {(Array.isArray(keywordRewardRules) ? keywordRewardRules : []).length === 0 ? (
                <div className="text-gray-500 text-sm">尚無規則</div>
              ) : (
                <div className="space-y-2">
                  {keywordRewardRules.map((r) => {
                    const item = r.rewardType === 'item' ? getItem(r.itemId) : null
                    const rewardText = r.rewardType === 'coin'
                      ? `佳盟幣 +${r.coinAmount || 0}`
                      : `${item?.name || r.itemId} x${r.quantity || 1}`
                    return (
                      <div key={r.id} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
                        <div className="text-sm text-gray-200 min-w-0">
                          <span className="text-yellow-300 font-semibold">「{r.keyword}」</span>
                          <span className="text-gray-400 ml-2">({r.match === 'equals' ? '完全相同' : '包含'}{r.ignoreCase === false ? '・區分大小寫' : ''})</span>
                          <span className="text-green-300 ml-2">{rewardText}</span>
                          {Number(r.cooldownSec) > 0 && <span className="text-gray-400 ml-2">冷卻 {r.cooldownSec}s</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              updateKeywordRewardRule(r.id, { enabled: !r.enabled })
                              loadKeywordRewardRules()
                            }}
                            className={`text-xs px-3 py-1 rounded-lg font-semibold ${r.enabled ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
                            title={r.enabled ? '點擊停用' : '點擊啟用'}
                          >
                            {r.enabled ? '啟用中' : '已停用'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingRuleId(r.id)
                              setRuleForm({
                                keyword: r.keyword || '',
                                match: r.match || 'includes',
                                ignoreCase: r.ignoreCase !== false,
                                rewardType: r.rewardType || 'item',
                                itemId: r.itemId || 'danmu_item',
                                quantity: r.quantity || 1,
                                coinAmount: r.coinAmount || 10,
                                cooldownSec: r.cooldownSec || 0,
                                dailyLimit: r.dailyLimit || 0,
                                enabled: r.enabled !== false
                              })
                            }}
                            className="text-xs px-3 py-1 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-semibold"
                          >
                            編輯
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!window.confirm(`確定要刪除關鍵字規則「${r.keyword}」嗎？`)) return
                              deleteKeywordRewardRule(r.id)
                              loadKeywordRewardRules()
                            }}
                            className="text-xs px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold"
                          >
                            刪除
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
