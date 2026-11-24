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
  TITLE: 'title', // 稱號道具
  FISH_SKIN: 'fish_skin', // 水族外觀（每套用 1 隻只換 1 欄）
  FISH_SLOT: 'fish_slot' // 魚隻擴充欄（增加同時顯示的魚數量）
}

export const FISH_AROANA_ITEM_ID = 'fish_arowana'
export const FISH_AROANA_BLUE_ITEM_ID = 'fish_arowana_blue'
export const FISH_RAY_CROWN_ITEM_ID = 'fish_ray_crown'
export const FISH_RAY_ALBINO_ITEM_ID = 'fish_ray_albino'
export const FISH_SLOT_EXPAND_ITEM_ID = 'fish_slot_expand'

const AROWANA_SHOP_ITEM = {
  id: FISH_AROANA_ITEM_ID,
  name: '龍魚',
  type: 'fish_skin',
  fishKey: 'arowana',
  description: '每套用 1 隻只替換 1 欄魚；另一欄仍是預設鬥魚。可同時套用不同魚種。',
  icon: '🐉',
  image: '/images/arowana-a.png',
  price: 88,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

const AROWANA_BLUE_SHOP_ITEM = {
  id: FISH_AROANA_BLUE_ITEM_ID,
  name: '藍底過背',
  type: 'fish_skin',
  fishKey: 'arowana_blue',
  description: '藍底過背金龍。每套用 1 隻只替換 1 欄魚，可與其他魚種混搭。',
  icon: '🐉',
  image: '/images/arowana-blue-b.png',
  price: 98,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

const RAY_CROWN_SHOP_ITEM = {
  id: FISH_RAY_CROWN_ITEM_ID,
  name: '皇冠魟',
  type: 'fish_skin',
  fishKey: 'ray_crown',
  description: '皇冠魟。每套用 1 隻只替換 1 欄，可與其他魚種混搭。',
  icon: '🐟',
  image: '/images/ray-crown-a.png',
  price: 108,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

const RAY_ALBINO_SHOP_ITEM = {
  id: FISH_RAY_ALBINO_ITEM_ID,
  name: '黃冠白子魟',
  type: 'fish_skin',
  fishKey: 'ray_albino',
  description: '黃冠白子魟。每套用 1 隻只替換 1 欄，可與其他魚種混搭。',
  icon: '🐟',
  image: '/images/ray-albino-a.png',
  price: 118,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

const FISH_SLOT_SHOP_ITEM = {
  id: FISH_SLOT_EXPAND_ITEM_ID,
  name: '魚隻擴充欄',
  type: 'fish_slot',
  description: '購買後請到背包自行套用。每套用 1 個，畫面多游 1 隻魚（預設 2 隻，最多 6 隻）。',
  icon: '➕',
  price: 68,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

function seedFishSkinItems(items, { allowCloudWrite } = { allowCloudWrite: true }) {
  const list = Array.isArray(items) ? items : []
  const looksPlaceholder = list.length <= 1 && (!list[0] || String(list[0].id) === 'danmu_item')
  if (isSupabaseEnabled() && looksPlaceholder) return list
  const extras = []
  if (!list.some((it) => String(it?.id || '') === FISH_AROANA_ITEM_ID)) extras.push({ ...AROWANA_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_AROANA_BLUE_ITEM_ID)) extras.push({ ...AROWANA_BLUE_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_RAY_CROWN_ITEM_ID)) extras.push({ ...RAY_CROWN_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_RAY_ALBINO_ITEM_ID)) extras.push({ ...RAY_ALBINO_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_SLOT_EXPAND_ITEM_ID)) extras.push({ ...FISH_SLOT_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (extras.length === 0) return list
  const next = [...list, ...extras]
  try {
    const val = JSON.stringify(next)
    localStorage.setItem(ITEM_STORAGE_KEY, val)
    if (allowCloudWrite) syncKeyToSupabase(ITEM_STORAGE_KEY, val)
  } catch (_) {}
  return next
}

// 獲取所有道具定義（保證回傳陣列）
export const getItems = () => {
  try {
    const data = localStorage.getItem(ITEM_STORAGE_KEY)
    if (data) {
      const parsed = JSON.parse(data)
      return seedFishSkinItems(Array.isArray(parsed) ? parsed : [])
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
      return seedFishSkinItems(defaultItems, { allowCloudWrite: true })
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
    const desiredId = String(itemData?.id || '').trim()
    if (desiredId && items.some((it) => String(it?.id || '').trim() === desiredId)) {
      return { success: false, message: `道具 ID 已存在：${desiredId}` }
    }
    const newItem = {
      id: desiredId || `item_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      ...itemData,
      createdAt: itemData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
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
    items[itemIndex] = { ...items[itemIndex], ...updates, updatedAt: new Date().toISOString() }
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
