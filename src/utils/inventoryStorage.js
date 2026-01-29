// 背包系統存儲工具
import { syncKeyToSupabase } from './supabaseSync'
const INVENTORY_STORAGE_KEY = 'jiameng_inventories'

// 獲取用戶背包（保證回傳陣列）
export const getUserInventory = (username) => {
  try {
    const data = localStorage.getItem(INVENTORY_STORAGE_KEY)
    const inventories = data ? JSON.parse(data) : {}
    const arr = inventories[username] || []
    return Array.isArray(arr) ? arr : []
  } catch (error) {
    console.error('Error getting user inventory:', error)
    return []
  }
}

// 添加道具到用戶背包
export const addItemToInventory = (username, itemId, quantity = 1) => {
  try {
    const data = localStorage.getItem(INVENTORY_STORAGE_KEY)
    const inventories = data ? JSON.parse(data) : {}
    
    if (!inventories[username]) {
      inventories[username] = []
    }
    
    const existingItem = inventories[username].find(item => item.itemId === itemId)
    if (existingItem) {
      existingItem.quantity += quantity
    } else {
      inventories[username].push({
        itemId,
        quantity,
        obtainedAt: new Date().toISOString()
      })
    }
    
    const val = JSON.stringify(inventories)
    localStorage.setItem(INVENTORY_STORAGE_KEY, val)
    syncKeyToSupabase(INVENTORY_STORAGE_KEY, val)
    return { success: true }
  } catch (error) {
    console.error('Error adding item to inventory:', error)
    return { success: false, message: '添加道具失敗' }
  }
}

// 從用戶背包移除道具
export const removeItemFromInventory = (username, itemId, quantity = 1) => {
  try {
    const data = localStorage.getItem(INVENTORY_STORAGE_KEY)
    const inventories = data ? JSON.parse(data) : {}
    
    if (!inventories[username]) {
      return { success: false, message: '背包為空' }
    }
    
    const itemIndex = inventories[username].findIndex(item => item.itemId === itemId)
    if (itemIndex === -1) {
      return { success: false, message: '道具不存在' }
    }
    
    const item = inventories[username][itemIndex]
    if (item.quantity <= quantity) {
      inventories[username].splice(itemIndex, 1)
    } else {
      item.quantity -= quantity
    }
    
    const val = JSON.stringify(inventories)
    localStorage.setItem(INVENTORY_STORAGE_KEY, val)
    syncKeyToSupabase(INVENTORY_STORAGE_KEY, val)
    return { success: true }
  } catch (error) {
    console.error('Error removing item from inventory:', error)
    return { success: false, message: '移除道具失敗' }
  }
}

// 檢查用戶是否擁有道具
export const hasItem = (username, itemId) => {
  try {
    const inventory = getUserInventory(username)
    const item = inventory.find(i => i.itemId === itemId)
    return item && item.quantity > 0
  } catch (error) {
    console.error('Error checking item:', error)
    return false
  }
}

// 獲取用戶道具數量
export const getItemQuantity = (username, itemId) => {
  try {
    const inventory = getUserInventory(username)
    const item = inventory.find(i => i.itemId === itemId)
    return item ? item.quantity : 0
  } catch (error) {
    console.error('Error getting item quantity:', error)
    return 0
  }
}

// 使用道具（消耗一個）
export const useItem = (username, itemId) => {
  try {
    if (!hasItem(username, itemId)) {
      return { success: false, message: '道具不足' }
    }
    return removeItemFromInventory(username, itemId, 1)
  } catch (error) {
    console.error('Error using item:', error)
    return { success: false, message: '使用道具失敗' }
  }
}

// 獲取所有用戶的背包（管理員功能）
export const getAllInventories = () => {
  try {
    const data = localStorage.getItem(INVENTORY_STORAGE_KEY)
    return data ? JSON.parse(data) : {}
  } catch (error) {
    console.error('Error getting all inventories:', error)
    return {}
  }
}

// 檢查道具是否已裝備
export const isItemEquipped = (username, itemId) => {
  try {
    const { getEquippedEffects } = require('./effectStorage')
    const effects = getEquippedEffects(username)
    return effects.nameEffect === itemId || effects.messageEffect === itemId
  } catch (error) {
    console.error('Error checking if item is equipped:', error)
    return false
  }
}
