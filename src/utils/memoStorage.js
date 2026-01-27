// 交流區存储工具
import { syncKeyToSupabase } from './supabaseSync'
const MEMO_STORAGE_KEY = 'jiameng_memos'

// 获取所有话题
export const getTopics = () => {
  try {
    const data = localStorage.getItem(MEMO_STORAGE_KEY)
    return data ? JSON.parse(data) : []
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
    const val = JSON.stringify(topics)
    localStorage.setItem(MEMO_STORAGE_KEY, val)
    syncKeyToSupabase(MEMO_STORAGE_KEY, val)
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
    const topics = getTopics()
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
    const val = JSON.stringify(topics)
    localStorage.setItem(MEMO_STORAGE_KEY, val)
    syncKeyToSupabase(MEMO_STORAGE_KEY, val)
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
    const val = JSON.stringify(filtered)
    localStorage.setItem(MEMO_STORAGE_KEY, val)
    syncKeyToSupabase(MEMO_STORAGE_KEY, val)
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
    const val = JSON.stringify(topics)
    localStorage.setItem(MEMO_STORAGE_KEY, val)
    syncKeyToSupabase(MEMO_STORAGE_KEY, val)
    return { success: true }
  } catch (error) {
    console.error('Error updating topic title:', error)
    return { success: false, message: '更新話題失敗' }
  }
}
