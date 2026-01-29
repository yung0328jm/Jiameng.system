// 交流區存储工具
import { syncKeyToSupabase } from './supabaseSync'
const MEMO_STORAGE_KEY = 'jiameng_memos'
const ONE_DAY_MS = 24 * 60 * 60 * 1000

const persist = (topics) => {
  const val = JSON.stringify(topics)
  localStorage.setItem(MEMO_STORAGE_KEY, val)
  syncKeyToSupabase(MEMO_STORAGE_KEY, val)
}

const pruneTopicMessages = (topics) => {
  const now = Date.now()
  const cutoff = now - ONE_DAY_MS
  let changed = false
  const next = (Array.isArray(topics) ? topics : []).map((t) => {
    const msgs = Array.isArray(t?.messages) ? t.messages : []
    const filtered = msgs.filter((m) => {
      // 沒有 createdAt 的舊資料：先保留，避免誤刪
      if (!m?.createdAt) return true
      const ts = Date.parse(m.createdAt)
      if (Number.isNaN(ts)) return true
      return ts >= cutoff
    })
    if (filtered.length !== msgs.length) changed = true
    return { ...t, messages: filtered }
  })
  return { next, changed }
}

// 获取所有话题
export const getTopics = () => {
  try {
    const data = localStorage.getItem(MEMO_STORAGE_KEY)
    const parsed = data ? JSON.parse(data) : []
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.error('Error getting topics:', error)
    return []
  }
}

// 创建新话题
export const createTopic = (topicTitle) => {
  try {
    const topics = getTopics()
    const newTopic = {
      id: Date.now().toString(),
      title: topicTitle,
      createdAt: new Date().toISOString(),
      messages: []
    }
    topics.push(newTopic)
    persist(topics)
    return { success: true, topic: newTopic }
  } catch (error) {
    console.error('Error creating topic:', error)
    return { success: false, message: '創建話題失敗' }
  }
}

// 获取话题的消息
export const getTopicMessages = (topicId) => {
  try {
    const topics = getTopics()
    const topic = topics.find(t => t.id === topicId)
    return topic ? topic.messages : []
  } catch (error) {
    console.error('Error getting topic messages:', error)
    return []
  }
}

// 添加消息到话题
export const addMessage = (topicId, messageContent, author = '使用者') => {
  try {
    // 先清理超過 24 小時的訊息，避免資料持續膨脹
    const topicsRaw = getTopics()
    const { next: topicsPruned, changed } = pruneTopicMessages(topicsRaw)
    const topics = topicsPruned
    const topicIndex = topics.findIndex(t => t.id === topicId)
    if (topicIndex === -1) {
      return { success: false, message: '話題不存在' }
    }
    
    const newMessage = {
      id: Date.now().toString(),
      content: messageContent,
      author: author,
      createdAt: new Date().toISOString()
    }
    
    topics[topicIndex].messages.push(newMessage)
    // 若 prune 有變更，或新增了訊息，都需要寫回
    persist(topics)
    return { success: true, message: newMessage }
  } catch (error) {
    console.error('Error adding message:', error)
    return { success: false, message: '發送消息失敗' }
  }
}

// 删除话题
export const deleteTopic = (topicId) => {
  try {
    const topics = getTopics()
    const filtered = topics.filter(t => t.id !== topicId)
    persist(filtered)
    return { success: true }
  } catch (error) {
    console.error('Error deleting topic:', error)
    return { success: false, message: '刪除話題失敗' }
  }
}

// 更新话题标题
export const updateTopicTitle = (topicId, newTitle) => {
  try {
    const topics = getTopics()
    const topicIndex = topics.findIndex(t => t.id === topicId)
    if (topicIndex === -1) {
      return { success: false, message: '話題不存在' }
    }
    
    topics[topicIndex].title = newTitle
    persist(topics)
    return { success: true }
  } catch (error) {
    console.error('Error updating topic title:', error)
    return { success: false, message: '更新話題失敗' }
  }
}

// 單一對話框：取得或建立全域話題，所有用戶發話都在此
const GLOBAL_TOPIC_ID = 'global'

export const getOrCreateGlobalTopic = () => {
  const topics = getTopics()
  let globalTopic = topics.find(t => t.id === GLOBAL_TOPIC_ID)
  if (!globalTopic) {
    globalTopic = {
      id: GLOBAL_TOPIC_ID,
      title: '對話框',
      createdAt: new Date().toISOString(),
      messages: []
    }
    topics.push(globalTopic)
    persist(topics)
  }
  return globalTopic
}

// 清理超過 24 小時的交流區訊息（所有 topics 皆適用；主要針對 global 對話框）
export const cleanExpiredMessages = () => {
  try {
    const topics = getTopics()
    const { next, changed } = pruneTopicMessages(topics)
    if (changed) persist(next)
    return { success: true, changed }
  } catch (e) {
    console.error('cleanExpiredMessages error:', e)
    return { success: false, changed: false }
  }
}

export const getGlobalMessages = () => {
  // 讀取前先清理一天以前的訊息
  cleanExpiredMessages()
  const topic = getOrCreateGlobalTopic()
  const msgs = Array.isArray(topic.messages) ? topic.messages : []
  return msgs
}

export const addGlobalMessage = (messageContent, author = '使用者') => {
  getOrCreateGlobalTopic()
  // 新增前先清理一天以前的訊息
  cleanExpiredMessages()
  return addMessage(GLOBAL_TOPIC_ID, messageContent, author)
}
