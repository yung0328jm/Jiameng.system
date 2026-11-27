// 背包系統存儲工具
import { syncKeyToSupabase } from './supabaseSync'
import { FISH_POTION_WORM_ID, FISH_SLOT_EXPAND_ITEM_ID } from './itemStorage'
const INVENTORY_STORAGE_KEY = 'jiameng_inventories'

function remapRetiredItemId(id) {
  const s = String(id || '')
  if (s === FISH_SLOT_EXPAND_ITEM_ID || s === 'fish_slot_expand') return FISH_POTION_WORM_ID
  return s
}

function tsOf(v) {
  return Date.parse(String(v || '')) || 0
}

function matchingUserKeys(inventories, username) {
  const want = String(username || '').trim()
  if (!want) return []
  return Object.keys(inventories || {}).filter((k) => String(k).trim() === want)
}

export function remapInventoryRows(list) {
  const map = new Map()
  ;(Array.isArray(list) ? list : []).forEach((row) => {
    const itemId = remapRetiredItemId(row?.itemId)
    if (!itemId) return
    const qty = Math.max(0, Number(row?.quantity) || 0)
    if (qty <= 0 && !row?.qtyAt) return
    const prev = map.get(itemId)
    if (!prev) {
      map.set(itemId, { ...row, itemId, quantity: qty })
      return
    }
    const pt = tsOf(prev.qtyAt)
    const rt = tsOf(row.qtyAt)
    if (rt > pt || (rt === pt && qty <= (Number(prev.quantity) || 0))) {
      map.set(itemId, {
        ...prev,
        ...row,
        itemId,
        quantity: qty,
        obtainedAt: row?.obtainedAt || prev.obtainedAt,
        qtyAt: row?.qtyAt || prev.qtyAt
      })
    }
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
    const keys = matchingUserKeys(inventories, username)
    const rows = keys.flatMap((k) => (Array.isArray(inventories[k]) ? inventories[k] : []))
    const arr = remapInventoryRows(rows)
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
    
    const userKey = matchingUserKeys(inventories, username)[0] || String(username || '').trim()
    if (!userKey) return { success: false, message: '帳號無效' }
    if (!inventories[userKey]) {
      inventories[userKey] = []
    }
    
    const itemId = remapRetiredItemId(rawItemId)
    if (!itemId) return { success: false, message: '道具無效' }
    inventories[userKey] = remapInventoryRows(inventories[userKey])
    const existingItem = inventories[userKey].find(item => item.itemId === itemId)
    const now = new Date().toISOString()
    if (existingItem) {
      existingItem.quantity += quantity
      existingItem.qtyAt = now
    } else {
      inventories[userKey].push({
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
    
    const keys = matchingUserKeys(inventories, username)
    if (!keys.length) {
      return { success: false, message: '背包為空' }
    }

    const itemId = remapRetiredItemId(rawItemId)
    const now = new Date().toISOString()
    let found = false
    keys.forEach((userKey) => {
      inventories[userKey] = remapInventoryRows(inventories[userKey])
      const itemIndex = inventories[userKey].findIndex(item => item.itemId === itemId)
      if (itemIndex === -1) return
      found = true
      const item = inventories[userKey][itemIndex]
      if (item.quantity <= quantity) {
        item.quantity = 0
        item.qtyAt = now
      } else {
        item.quantity -= quantity
        item.qtyAt = now
      }
    })
    if (!found) {
      return { success: false, message: '道具不存在' }
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
    const now = new Date().toISOString()
    Object.keys(inventories || {}).forEach((username) => {
      const arr = Array.isArray(inventories[username]) ? inventories[username] : []
      let hit = false
      const next = arr.map((inv) => {
        const id = remapRetiredItemId(inv?.itemId)
        if (!ids.has(inv?.itemId) && !ids.has(id)) return inv
        hit = true
        return { ...inv, itemId: id || inv?.itemId, quantity: 0, qtyAt: now }
      })
      if (hit) {
        inventories[username] = next
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
