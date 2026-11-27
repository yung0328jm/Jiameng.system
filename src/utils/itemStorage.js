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
  FISH_SLOT: 'fish_slot', // 魚隻擴充欄（增加同時顯示的魚數量）
  FISH_POTION: 'fish_potion'
}

export const FISH_POTION_HEAT_ID = 'fish_potion_heat'
export const FISH_POTION_AFFECTION_ID = 'fish_potion_affection'
export const FISH_POTION_BIRTH_ID = 'fish_potion_birth'

export const FISH_AROANA_ITEM_ID = 'fish_arowana'
export const FISH_AROANA_BLUE_ITEM_ID = 'fish_arowana_blue'
export const FISH_RAY_CROWN_ITEM_ID = 'fish_ray_crown'
export const FISH_RAY_ALBINO_ITEM_ID = 'fish_ray_albino'
export const FISH_ARAPAIMA_ITEM_ID = 'fish_arapaima'
export const FISH_BETTA_ITEM_ID = 'fish_betta'
export const FISH_GUPPY_ITEM_ID = 'fish_guppy'
export const FISH_GAR_ITEM_ID = 'fish_gar'
export const FISH_GENGHIS_ITEM_ID = 'fish_genghis'
export const FISH_KOI_PLATINUM_ITEM_ID = 'fish_koi_platinum'
export const FISH_REDTAIL_CAT_ITEM_ID = 'fish_redtail_cat'
export const FISH_TURTLE_SLIDER_ITEM_ID = 'fish_turtle_slider'
export const FISH_TURTLE_PIG_ITEM_ID = 'fish_turtle_pig'
export const FISH_TURTLE_MAP_ITEM_ID = 'fish_turtle_map'
export const FISH_SLOT_EXPAND_ITEM_ID = 'fish_slot_expand'

const AROWANA_SHOP_ITEM = {
  id: FISH_AROANA_ITEM_ID,
  name: '龍魚',
  type: 'fish_skin',
  fishKey: 'arowana',
  description: '每套用 1 隻只替換 1 欄魚，可與其他魚種混搭。',
  icon: '🐉',
  image: '/images/arowana-a.png',
  price: 40,
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
  price: 45,
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
  price: 35,
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
  price: 45,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

const ARAPAIMA_SHOP_ITEM = {
  id: FISH_ARAPAIMA_ITEM_ID,
  name: '巨骨蛇魚',
  type: 'fish_skin',
  fishKey: 'arapaima',
  description: '巨骨蛇魚，體型比一般魚種更大。每套用 1 隻只替換 1 欄。',
  icon: '🐟',
  image: '/images/arapaima-a.png',
  price: 70,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

const BETTA_SHOP_ITEM = {
  id: FISH_BETTA_ITEM_ID,
  name: '鬥魚',
  type: 'fish_skin',
  fishKey: 'betta',
  description: '暹羅鬥魚。每套用 1 隻只替換 1 欄，可與其他魚種混搭。',
  icon: '🐟',
  image: '/images/betta-a.png',
  price: 10,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

const GUPPY_SHOP_ITEM = {
  id: FISH_GUPPY_ITEM_ID,
  name: '孔雀魚',
  type: 'fish_skin',
  fishKey: 'guppy',
  description: '小型孔雀魚。每套用 1 隻只替換 1 欄，可與其他魚種混搭。',
  icon: '🐟',
  image: '/images/guppy-a.png',
  price: 6,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

const GAR_SHOP_ITEM = {
  id: FISH_GAR_ITEM_ID,
  name: '雀鱔',
  type: 'fish_skin',
  fishKey: 'gar',
  description: '顎雀鱔／雀鱔，長體型。每套用 1 隻只替換 1 欄。',
  icon: '🐟',
  image: '/images/gar-a.png',
  price: 40,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

const GENGHIS_SHOP_ITEM = {
  id: FISH_GENGHIS_ITEM_ID,
  name: '成吉思汗',
  type: 'fish_skin',
  fishKey: 'genghis',
  description: '成吉思汗（巨鯊鯰）。每套用 1 隻只替換 1 欄，可與其他魚種混搭。',
  icon: '🐟',
  image: '/images/genghis-a.png',
  price: 30,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

const KOI_PLATINUM_SHOP_ITEM = {
  id: FISH_KOI_PLATINUM_ITEM_ID,
  name: '白金蝴蝶龍鯉',
  type: 'fish_skin',
  fishKey: 'koi_platinum',
  description: '白金蝴蝶龍鯉（長鰭錦鯉）。每套用 1 隻只替換 1 欄，可與其他魚種混搭。',
  icon: '🐟',
  image: '/images/koi-platinum-a.png',
  price: 25,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

const REDTAIL_CAT_SHOP_ITEM = {
  id: FISH_REDTAIL_CAT_ITEM_ID,
  name: '招財貓',
  type: 'fish_skin',
  fishKey: 'redtail_cat',
  description: '紅尾招財貓，體型較大。每套用 1 隻只替換 1 欄。',
  icon: '🐟',
  image: '/images/redtail-cat-a.png',
  price: 30,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

const TURTLE_SLIDER_SHOP_ITEM = {
  id: FISH_TURTLE_SLIDER_ITEM_ID,
  name: '巴西龜',
  type: 'fish_skin',
  fishKey: 'turtle_slider',
  description: '巴西彩龜。每套用 1 隻只替換 1 欄，可與其他水族混搭。',
  icon: '🐢',
  image: '/images/turtle-slider-a.png',
  price: 15,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

const TURTLE_PIG_SHOP_ITEM = {
  id: FISH_TURTLE_PIG_ITEM_ID,
  name: '豬鼻龜',
  type: 'fish_skin',
  fishKey: 'turtle_pig',
  description: '豬鼻龜。每套用 1 隻只替換 1 欄。',
  icon: '🐢',
  image: '/images/turtle-pig-a.png',
  price: 60,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

const TURTLE_MAP_SHOP_ITEM = {
  id: FISH_TURTLE_MAP_ITEM_ID,
  name: '地圖龜',
  type: 'fish_skin',
  fishKey: 'turtle_map',
  description: '地圖龜。每套用 1 隻只替換 1 欄。',
  icon: '🐢',
  image: '/images/turtle-map-a.png',
  price: 18,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

const FISH_SLOT_SHOP_ITEM = {
  id: FISH_SLOT_EXPAND_ITEM_ID,
  name: '魚隻擴充欄',
  type: 'fish_slot',
  description: '購買後請到背包自行套用。每套用 1 個，畫面多游 1 隻魚（預設 2 隻，最多 50 隻）。',
  icon: '➕',
  price: 68,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

const FISH_POTION_HEAT_ITEM = {
  id: FISH_POTION_HEAT_ID,
  name: '發情藥水',
  type: 'fish_potion',
  potion: 'heat',
  description: '給自己的母魚使用，立刻結束產後冷卻，可再與同缸公魚交配。請點畫面上自己的母魚。',
  icon: '💗',
  price: 12,
  category: '水族藥水',
  createdAt: new Date().toISOString()
}

const FISH_POTION_AFFECTION_ITEM = {
  id: FISH_POTION_AFFECTION_ID,
  name: '好感藥水',
  type: 'fish_potion',
  potion: 'affection',
  description: '給自己的母魚使用，立刻懷孕。魚缸裡必須有同品種一公一母同時巡遊。請點畫面上自己的母魚。',
  icon: '💞',
  price: 18,
  category: '水族藥水',
  createdAt: new Date().toISOString()
}

const FISH_POTION_BIRTH_ITEM = {
  id: FISH_POTION_BIRTH_ID,
  name: '催生藥水',
  type: 'fish_potion',
  potion: 'birth',
  description: '給懷孕中的母魚使用，立刻產下魚苗，不必等懷孕期結束。魚苗進寵物格，不占魚缸欄位。請點畫面上自己的母魚。',
  icon: '🫧',
  price: 22,
  category: '水族藥水',
  createdAt: new Date().toISOString()
}

const FISH_PRICE_SEED = 20261127
const FISH_SHOP_CATALOG = {
  [FISH_AROANA_ITEM_ID]: AROWANA_SHOP_ITEM,
  [FISH_AROANA_BLUE_ITEM_ID]: AROWANA_BLUE_SHOP_ITEM,
  [FISH_RAY_CROWN_ITEM_ID]: RAY_CROWN_SHOP_ITEM,
  [FISH_RAY_ALBINO_ITEM_ID]: RAY_ALBINO_SHOP_ITEM,
  [FISH_ARAPAIMA_ITEM_ID]: ARAPAIMA_SHOP_ITEM,
  [FISH_BETTA_ITEM_ID]: BETTA_SHOP_ITEM,
  [FISH_GUPPY_ITEM_ID]: GUPPY_SHOP_ITEM,
  [FISH_GAR_ITEM_ID]: GAR_SHOP_ITEM,
  [FISH_GENGHIS_ITEM_ID]: GENGHIS_SHOP_ITEM,
  [FISH_KOI_PLATINUM_ITEM_ID]: KOI_PLATINUM_SHOP_ITEM,
  [FISH_REDTAIL_CAT_ITEM_ID]: REDTAIL_CAT_SHOP_ITEM,
  [FISH_TURTLE_SLIDER_ITEM_ID]: TURTLE_SLIDER_SHOP_ITEM,
  [FISH_TURTLE_PIG_ITEM_ID]: TURTLE_PIG_SHOP_ITEM,
  [FISH_TURTLE_MAP_ITEM_ID]: TURTLE_MAP_SHOP_ITEM
}

const RETIRED_ITEM_IDS = new Set(['fish_duckbill'])

function seedFishSkinItems(items, { allowCloudWrite } = { allowCloudWrite: true }) {
  const raw = Array.isArray(items) ? items : []
  const list = raw.filter((it) => !RETIRED_ITEM_IDS.has(String(it?.id || '')))
  const pruned = list.length !== raw.length
  const looksPlaceholder = list.length <= 1 && (!list[0] || String(list[0].id) === 'danmu_item')
  if (isSupabaseEnabled() && looksPlaceholder) return list
  const extras = []
  if (!list.some((it) => String(it?.id || '') === FISH_AROANA_ITEM_ID)) extras.push({ ...AROWANA_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_AROANA_BLUE_ITEM_ID)) extras.push({ ...AROWANA_BLUE_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_RAY_CROWN_ITEM_ID)) extras.push({ ...RAY_CROWN_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_RAY_ALBINO_ITEM_ID)) extras.push({ ...RAY_ALBINO_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_ARAPAIMA_ITEM_ID)) extras.push({ ...ARAPAIMA_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_BETTA_ITEM_ID)) extras.push({ ...BETTA_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_GUPPY_ITEM_ID)) extras.push({ ...GUPPY_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_GAR_ITEM_ID)) extras.push({ ...GAR_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_GENGHIS_ITEM_ID)) extras.push({ ...GENGHIS_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_KOI_PLATINUM_ITEM_ID)) extras.push({ ...KOI_PLATINUM_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_REDTAIL_CAT_ITEM_ID)) extras.push({ ...REDTAIL_CAT_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_TURTLE_SLIDER_ITEM_ID)) extras.push({ ...TURTLE_SLIDER_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_TURTLE_PIG_ITEM_ID)) extras.push({ ...TURTLE_PIG_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_TURTLE_MAP_ITEM_ID)) extras.push({ ...TURTLE_MAP_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_SLOT_EXPAND_ITEM_ID)) extras.push({ ...FISH_SLOT_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_POTION_HEAT_ID)) extras.push({ ...FISH_POTION_HEAT_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_POTION_AFFECTION_ID)) extras.push({ ...FISH_POTION_AFFECTION_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_POTION_BIRTH_ID)) extras.push({ ...FISH_POTION_BIRTH_ITEM, createdAt: new Date().toISOString() })
  const slotWanted = FISH_SLOT_SHOP_ITEM.description
  const birthWanted = FISH_POTION_BIRTH_ITEM.description
  const patched = list.map((it) => {
    const id = String(it?.id || '')
    let next = it
    if (id === FISH_SLOT_EXPAND_ITEM_ID && String(it?.description || '') !== slotWanted) {
      next = { ...next, description: slotWanted }
    }
    if (id === FISH_POTION_BIRTH_ID && String(it?.description || '') !== birthWanted) {
      next = { ...next, description: birthWanted }
    }
    const catalog = FISH_SHOP_CATALOG[id]
    if (catalog && Number(it?.priceSeedVer) !== FISH_PRICE_SEED) {
      next = { ...next, price: catalog.price, priceSeedVer: FISH_PRICE_SEED }
    }
    return next
  })
  const descChanged = patched.some((it, i) => it !== list[i])
  if (extras.length === 0 && !pruned && !descChanged) return list
  const next = [...patched, ...extras]
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
        price: 10, // 毓承幣價格
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
