// 道具系統存儲工具
import { syncKeyToSupabase } from './supabaseSync'
import { isSupabaseEnabled } from './supabaseClient'
const ITEM_STORAGE_KEY = 'jiameng_items'
const ITEM_BACKUP_KEY = 'jiameng_items_backup'

// 預定義道具類型
export const ITEM_TYPES = {
  DANMU: 'danmu', // 彈幕道具
  NAME_EFFECT: 'name_effect', // 名子特效道具
  MESSAGE_EFFECT: 'message_effect', // 發話特效道具
  TITLE: 'title' // 稱號道具
}

// 獲取所有道具定義（保證回傳陣列）
export const getItems = () => {
  try {
    const data = localStorage.getItem(ITEM_STORAGE_KEY)
    if (data) {
      const parsed = JSON.parse(data)
      return Array.isArray(parsed) ? parsed : []
    }
    // 初始化默認道具
    const defaultItems = [
      {
        id: 'danmu_item',
        name: '彈幕道具',
        type: ITEM_TYPES.DANMU,
        description: '使用後可以發送彈幕',
        icon: '💬',
        price: 10, // 佳盟幣價格
        createdAt: new Date().toISOString()
      }
    ]
    const val = JSON.stringify(defaultItems)
    localStorage.setItem(ITEM_STORAGE_KEY, val)
    // Supabase 模式下，避免在「尚未完成雲端同步」前用預設值覆蓋雲端資料
    // 只有在非 Supabase 模式才主動把預設道具寫回雲端
    if (!isSupabaseEnabled()) {
      syncKeyToSupabase(ITEM_STORAGE_KEY, val)
    }
    return defaultItems
  } catch (error) {
    console.error('Error getting items:', error)
    return []
  }
}

// 獲取特定道具
export const getItem = (itemId) => {
  try {
    const items = getItems()
    return items.find(item => item.id === itemId) || null
  } catch (error) {
    console.error('Error getting item:', error)
    return null
  }
}

const backupItemsSnapshot = (items) => {
  try {
    const payload = {
      savedAt: new Date().toISOString(),
      items: Array.isArray(items) ? items : []
    }
    const val = JSON.stringify(payload)
    localStorage.setItem(ITEM_BACKUP_KEY, val)
    syncKeyToSupabase(ITEM_BACKUP_KEY, val)
  } catch (e) {
    console.warn('backupItemsSnapshot failed', e)
  }
}

// 創建新道具（管理員功能）
export const createItem = (itemData) => {
  try {
    const prev = getItems()
    backupItemsSnapshot(prev)
    const items = Array.isArray(prev) ? [...prev] : []
    const newItem = {
      id: itemData.id || `item_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      ...itemData,
      createdAt: new Date().toISOString()
    }
    items.push(newItem)
    const val = JSON.stringify(items)
    localStorage.setItem(ITEM_STORAGE_KEY, val)
    syncKeyToSupabase(ITEM_STORAGE_KEY, val)
    return { success: true, item: newItem }
  } catch (error) {
    console.error('Error creating item:', error)
    return { success: false, message: '創建道具失敗' }
  }
}

// 更新道具（管理員功能）
export const updateItem = (itemId, updates) => {
  try {
    const prev = getItems()
    backupItemsSnapshot(prev)
    const items = Array.isArray(prev) ? [...prev] : []
    const itemIndex = items.findIndex(item => item.id === itemId)
    if (itemIndex === -1) {
      return { success: false, message: '道具不存在' }
    }
    items[itemIndex] = { ...items[itemIndex], ...updates }
    const val = JSON.stringify(items)
    localStorage.setItem(ITEM_STORAGE_KEY, val)
    syncKeyToSupabase(ITEM_STORAGE_KEY, val)
    return { success: true, item: items[itemIndex] }
  } catch (error) {
    console.error('Error updating item:', error)
    return { success: false, message: '更新道具失敗' }
  }
}

// 刪除道具（管理員功能）
export const deleteItem = (itemId) => {
  try {
    const prev = getItems()
    backupItemsSnapshot(prev)
    const items = Array.isArray(prev) ? [...prev] : []
    const filtered = items.filter(item => item.id !== itemId)
    const val = JSON.stringify(filtered)
    localStorage.setItem(ITEM_STORAGE_KEY, val)
    syncKeyToSupabase(ITEM_STORAGE_KEY, val)
    return { success: true }
  } catch (error) {
    console.error('Error deleting item:', error)
    return { success: false, message: '刪除道具失敗' }
  }
}

/** 批次覆寫整份道具（會先做備份，再同步雲端） */
export const setItems = (items) => {
  try {
    const prev = getItems()
    backupItemsSnapshot(prev)
    const next = Array.isArray(items) ? items : []
    const val = JSON.stringify(next)
    localStorage.setItem(ITEM_STORAGE_KEY, val)
    syncKeyToSupabase(ITEM_STORAGE_KEY, val)
    return { success: true, count: next.length }
  } catch (e) {
    console.error('setItems failed', e)
    return { success: false, message: '更新道具清單失敗' }
  }
}
