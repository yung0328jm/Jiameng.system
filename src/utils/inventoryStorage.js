// 背包系統存儲工具
import { syncKeyToSupabase } from './supabaseSync'
import { FISH_POTION_WORM_ID, FISH_SLOT_EXPAND_ITEM_ID } from './itemStorage'
const INVENTORY_STORAGE_KEY = 'jiameng_inventories'

function remapRetiredItemId(id) {
  const s = String(id || '')
  if (s === FISH_SLOT_EXPAND_ITEM_ID || s === 'fish_slot_expand') return FISH_POTION_WORM_ID
  return s
}

export function remapInventoryRows(list) {
  const map = new Map()
  ;(Array.isArray(list) ? list : []).forEach((row) => {
    const itemId = remapRetiredItemId(row?.itemId)
    if (!itemId) return
    const qty = Math.max(0, Number(row?.quantity) || 0)
    if (qty <= 0 && !row?.qtyAt) return
    const prev = map.get(itemId)
    map.set(itemId, {
      ...(prev || {}),
      ...row,
      itemId,
      quantity: (Number(prev?.quantity) || 0) + qty,
      obtainedAt: row?.obtainedAt || prev?.obtainedAt
    })
  })
  return Array.from(map.values())
}

const persistAll = (inventories) => {
  const val = JSON.stringify(inventories || {})
  localStorage.setItem(INVENTORY_STORAGE_KEY, val)
  syncKeyToSupabase(INVENTORY_STORAGE_KEY, val)
}

// 獲取用戶背包（保證回傳陣列）
export const getUserInventory = (username) => {
  try {
    const data = localStorage.getItem(INVENTORY_STORAGE_KEY)
    const inventories = data ? JSON.parse(data) : {}
    const arr = remapInventoryRows(inventories[username] || [])
    const raw = inventories[username]
    if (JSON.stringify(arr) !== JSON.stringify(Array.isArray(raw) ? raw : [])) {
      inventories[username] = arr
      persistAll(inventories)
    }
    return arr.filter((row) => (Number(row?.quantity) || 0) > 0)
  } catch (error) {
    console.error('Error getting user inventory:', error)
    return []
  }
}

export const countInventoryItem = (username, itemId) => {
  if (!username || !itemId) return 0
  const row = getUserInventory(username).find((item) => item.itemId === itemId)
  return Math.max(0, Number(row?.quantity) || 0)
}

// 添加道具到用戶背包
export const addItemToInventory = (username, rawItemId, quantity = 1) => {
  try {
    const data = localStorage.getItem(INVENTORY_STORAGE_KEY)
    const inventories = data ? JSON.parse(data) : {}
    
    if (!inventories[username]) {
      inventories[username] = []
    }
    
    const itemId = remapRetiredItemId(rawItemId)
    if (!itemId) return { success: false, message: '道具無效' }
    inventories[username] = remapInventoryRows(inventories[username])
    const existingItem = inventories[username].find(item => item.itemId === itemId)
    const now = new Date().toISOString()
    if (existingItem) {
      existingItem.quantity += quantity
      existingItem.qtyAt = now
    } else {
      inventories[username].push({
        itemId,
        quantity,
        obtainedAt: now,
        qtyAt: now
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
export const removeItemFromInventory = (username, rawItemId, quantity = 1) => {
  try {
    const data = localStorage.getItem(INVENTORY_STORAGE_KEY)
    const inventories = data ? JSON.parse(data) : {}
    
    if (!inventories[username]) {
      return { success: false, message: '背包為空' }
    }

    const itemId = remapRetiredItemId(rawItemId)
    inventories[username] = remapInventoryRows(inventories[username])
    const itemIndex = inventories[username].findIndex(item => item.itemId === itemId)
    if (itemIndex === -1) {
      return { success: false, message: '道具不存在' }
    }
    
    const item = inventories[username][itemIndex]
    const now = new Date().toISOString()
    if (item.quantity <= quantity) {
      if (String(itemId).startsWith('fish_potion_')) {
        item.quantity = 0
        item.qtyAt = now
      } else {
        inventories[username].splice(itemIndex, 1)
      }
    } else {
      item.quantity -= quantity
      item.qtyAt = now
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

// 從「所有用戶」背包移除指定道具 id（管理員/清理用）
// itemIds: string[] | Set<string>
export const removeItemIdsFromAllInventories = (itemIds) => {
  try {
    const ids = itemIds instanceof Set ? itemIds : new Set(Array.isArray(itemIds) ? itemIds : [])
    if (ids.size === 0) return { success: true, removedUsers: 0 }
    const inventories = getAllInventories()
    let removedUsers = 0
    let changed = false
    Object.keys(inventories || {}).forEach((username) => {
      const arr = Array.isArray(inventories[username]) ? inventories[username] : []
      const filtered = arr.filter((inv) => !ids.has(inv?.itemId))
      if (filtered.length !== arr.length) {
        inventories[username] = filtered
        removedUsers += 1
        changed = true
      }
    })
    if (changed) persistAll(inventories)
    return { success: true, removedUsers }
  } catch (error) {
    console.error('removeItemIdsFromAllInventories failed', error)
    return { success: false, message: '清理背包失敗' }
  }
}

// 清空所有用戶背包（管理員功能）
export const clearAllInventories = () => {
  try {
    persistAll({})
    return { success: true }
  } catch (error) {
    console.error('clearAllInventories failed', error)
    return { success: false, message: '清空背包失敗' }
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
