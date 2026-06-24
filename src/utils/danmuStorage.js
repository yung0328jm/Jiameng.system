// 彈幕系統存儲工具
import { syncKeyToSupabase } from './supabaseSync'
const DANMU_STORAGE_KEY = 'jiameng_danmus'

const persist = (data) => {
  const val = JSON.stringify(data)
  localStorage.setItem(DANMU_STORAGE_KEY, val)
  syncKeyToSupabase(DANMU_STORAGE_KEY, val)
}

// 獲取所有彈幕
export const getDanmus = () => {
  try {
    const data = localStorage.getItem(DANMU_STORAGE_KEY)
    const parsed = data ? JSON.parse(data) : []
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.error('Error getting danmus:', error)
    return []
  }
}

// 添加彈幕
export const addDanmu = (danmuData) => {
  try {
    const danmus = getDanmus()
    const newDanmu = {
      id: `danmu_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content: danmuData.content,
      author: danmuData.author,
      color: danmuData.color || '#FFFFFF',
      createdAt: new Date().toISOString(),
      isActive: true
    }
    danmus.push(newDanmu)
    // 只保留最近500條彈幕
    const recentDanmus = danmus.slice(-500)
    persist(recentDanmus)
    return { success: true, danmu: newDanmu }
  } catch (error) {
    console.error('Error adding danmu:', error)
    return { success: false, message: '發送彈幕失敗' }
  }
}

// 刪除彈幕（管理員功能）
export const deleteDanmu = (danmuId) => {
  try {
    const danmus = getDanmus()
    const filtered = danmus.filter(d => d.id !== danmuId)
    persist(filtered)
    return { success: true }
  } catch (error) {
    console.error('Error deleting danmu:', error)
    return { success: false, message: '刪除彈幕失敗' }
  }
}

// 清除所有彈幕（管理員功能）
export const clearAllDanmus = () => {
  try {
    // 需同步雲端，否則其他裝置/分頁看起來像「按鈕無效」
    persist([])
    return { success: true }
  } catch (error) {
    console.error('Error clearing danmus:', error)
    return { success: false, message: '清除彈幕失敗' }
  }
}

// 獲取活躍彈幕（用於顯示，只顯示24小時內的彈幕）
export const getActiveDanmus = () => {
  try {
    const danmus = getDanmus()
    const now = new Date()
    // 規則：為了讓每個人都有機會看過再消失，保留較長時間
    //（仍有上限 500 筆，避免無限增長）
    const days = 7
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000) // 7 天前
    
    return danmus.filter(d => {
      if (!d.isActive) return false
      
      // 檢查創建時間是否在保留期內
      const createdAt = new Date(d.createdAt)
      return createdAt >= cutoff
    })
  } catch (error) {
    console.error('Error getting active danmus:', error)
    return []
  }
}

// 清理過期彈幕（自動清理超過24小時的彈幕）
export const cleanExpiredDanmus = () => {
  try {
    const danmus = getDanmus()
    const now = new Date()
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    
    // 過濾掉超過24小時的彈幕
    const activeDanmus = danmus.filter(d => {
      const createdAt = new Date(d.createdAt)
      return createdAt >= twentyFourHoursAgo
    })
    
    persist(activeDanmus)
    return { success: true, removed: danmus.length - activeDanmus.length }
  } catch (error) {
    console.error('Error cleaning expired danmus:', error)
    return { success: false, message: '清理過期彈幕失敗' }
  }
}
