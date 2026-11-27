import { getCurrentUser } from './authStorage'
import { getEquippedEffects, setFishSlots, setFishSlotExpansions } from './effectStorage'
import { getUserInventory } from './inventoryStorage'
import { getItem, ITEM_TYPES } from './itemStorage'

export const DEFAULT_FISH_SLOTS = 2
export const MAX_FISH_SLOTS = 50

/** Typical adult size in cm (betta TL, ray disc, arowana/arapaima TL). */
export const FISH_ADULT_CM = {
  betta: 7,
  guppy: 5,
  arowana: 75,
  arowana_blue: 75,
  ray_crown: 45,
  ray_albino: 45,
  gar: 90,
  genghis: 90,
  koi_platinum: 50,
  redtail_cat: 120,
  arapaima: 200,
  turtle_slider: 25,
  turtle_pig: 55,
  turtle_map: 18
}

/** Typical fry / pup / hatchling size in cm. */
export const FISH_FRY_CM = {
  betta: 1.8,
  guppy: 0.9,
  arowana: 18,
  arowana_blue: 18,
  ray_crown: 14,
  ray_albino: 14,
  gar: 16,
  genghis: 12,
  koi_platinum: 4,
  redtail_cat: 22,
  arapaima: 28,
  turtle_slider: 3.2,
  turtle_pig: 5.5,
  turtle_map: 2.8
}

export function speciesAdultScale(speciesKey) {
  const adult = FISH_ADULT_CM[speciesKey] || FISH_ADULT_CM.betta
  const raw = Math.pow(adult / FISH_ADULT_CM.betta, 0.36)
  return Math.min(2.2, Math.max(0.92, raw))
}

/** Water-column band: top / upperMid / mid / lowerMid / bottom. */
export const FISH_SWIM_LAYER = {
  arowana: 'top',
  arowana_blue: 'top',
  betta: 'upperMid',
  guppy: 'upperMid',
  gar: 'upperMid',
  arapaima: 'upperMid',
  turtle_slider: 'upperMid',
  genghis: 'mid',
  turtle_map: 'mid',
  koi_platinum: 'lowerMid',
  turtle_pig: 'lowerMid',
  redtail_cat: 'bottom',
  ray_crown: 'bottom',
  ray_albino: 'bottom'
}

export function speciesSwimLayer(speciesKey) {
  return FISH_SWIM_LAYER[speciesKey] || 'mid'
}

export const FISH_PACKS = {
  betta: {
    key: 'betta',
    wide: false,
    a: '/images/betta-a.png',
    b: '/images/betta-b.png'
  },
  guppy: {
    key: 'guppy',
    wide: false,
    a: '/images/guppy-a.png',
    b: '/images/guppy-b.png'
  },
  gar: {
    key: 'gar',
    wide: true,
    a: '/images/gar-a.png',
    b: '/images/gar-b.png'
  },
  genghis: {
    key: 'genghis',
    wide: true,
    shape: 'shark',
    a: '/images/genghis-a.png',
    b: '/images/genghis-b.png'
  },
  koi_platinum: {
    key: 'koi_platinum',
    wide: true,
    shape: 'koi',
    a: '/images/koi-platinum-a.png',
    b: '/images/koi-platinum-b.png'
  },
  redtail_cat: {
    key: 'redtail_cat',
    wide: true,
    shape: 'giant',
    a: '/images/redtail-cat-a.png',
    b: '/images/redtail-cat-b.png'
  },
  arowana: {
    key: 'arowana',
    wide: true,
    a: '/images/arowana-a.png',
    b: '/images/arowana-b.png'
  },
  arowana_blue: {
    key: 'arowana_blue',
    wide: true,
    a: '/images/arowana-blue-a.png',
    b: '/images/arowana-blue-b.png'
  },
  ray_crown: {
    key: 'ray_crown',
    wide: false,
    shape: 'ray',
    a: '/images/ray-crown-a.png',
    b: '/images/ray-crown-b.png'
  },
  ray_albino: {
    key: 'ray_albino',
    wide: false,
    shape: 'ray',
    a: '/images/ray-albino-a.png',
    b: '/images/ray-albino-b.png'
  },
  arapaima: {
    key: 'arapaima',
    wide: true,
    shape: 'giant',
    a: '/images/arapaima-a.png',
    b: '/images/arapaima-b.png'
  },
  turtle_slider: {
    key: 'turtle_slider',
    wide: false,
    shape: 'turtle',
    a: '/images/turtle-slider-a.png',
    b: '/images/turtle-slider-b.png'
  },
  turtle_pig: {
    key: 'turtle_pig',
    wide: false,
    shape: 'turtle',
    a: '/images/turtle-pig-a.png',
    b: '/images/turtle-pig-b.png'
  },
  turtle_map: {
    key: 'turtle_map',
    wide: false,
    shape: 'turtle',
    a: '/images/turtle-map-a.png',
    b: '/images/turtle-map-b.png'
  }
}

export function getOwnedItemQty(username, itemId) {
  if (!username || !itemId) return 0
  const row = getUserInventory(username).find((x) => String(x?.itemId || '') === String(itemId))
  return Math.max(0, Number(row?.quantity) || 0)
}

export function getOwnedFishSlotQty(username, itemId) {
  if (!username) return 0
  if (itemId) {
    const item = getItem(itemId)
    if (!item || item.type !== ITEM_TYPES.FISH_SLOT) return 0
    return getOwnedItemQty(username, itemId)
  }
  let extra = 0
  getUserInventory(username).forEach((row) => {
    const item = getItem(row?.itemId)
    if (item?.type === ITEM_TYPES.FISH_SLOT) extra += Math.max(0, Number(row?.quantity) || 0)
  })
  return extra
}

export function getAppliedFishSlotExpansions(username = getCurrentUser()) {
  if (!username) return []
  const used = {}
  const next = []
  const maxExtra = MAX_FISH_SLOTS - DEFAULT_FISH_SLOTS
  ;(getEquippedEffects(username).fishSlotExpansions || []).forEach((id) => {
    if (next.length >= maxExtra) return
    const itemId = String(id || '').trim()
    if (!itemId) return
    const item = getItem(itemId)
    if (!item || item.type !== ITEM_TYPES.FISH_SLOT) return
    used[itemId] = (used[itemId] || 0) + 1
    if (used[itemId] > getOwnedItemQty(username, itemId)) return
    next.push(itemId)
  })
  return next
}

export function countAppliedFishSlot(username, itemId) {
  return getAppliedFishSlotExpansions(username).filter((id) => String(id) === String(itemId)).length
}

export function getFishSlotCount(username = getCurrentUser()) {
  return MAX_FISH_SLOTS
}

function persistFishCapacity(username, expansions) {
  const maxExtra = MAX_FISH_SLOTS - DEFAULT_FISH_SLOTS
  const nextExp = (expansions || []).slice(0, maxExtra)
  const cap = DEFAULT_FISH_SLOTS + nextExp.length
  const skins = reconcileFishSlotsWithCap(username, getEquippedEffects(username).fishSlots, cap)
  const current = getEquippedEffects(username)
  setFishSlotExpansions(username, nextExp)
  if (JSON.stringify(current.fishSlots || []) !== JSON.stringify(skins)) {
    setFishSlots(username, skins)
  }
  return { success: true }
}

function reconcileFishSlotsWithCap(username, slots, cap) {
  const used = {}
  const next = []
  ;(Array.isArray(slots) ? slots : []).forEach((id) => {
    if (next.length >= cap) return
    const itemId = String(id || '').trim()
    if (!itemId) return
    const item = getItem(itemId)
    if (!item || item.type !== ITEM_TYPES.FISH_SKIN) return
    used[itemId] = (used[itemId] || 0) + 1
    if (used[itemId] > getOwnedItemQty(username, itemId)) return
    next.push(itemId)
  })
  return next
}

export function equipOneFishSlot(username, itemId) {
  if (!username || !itemId) return { success: false, message: '請先登入' }
  const item = getItem(itemId)
  if (!item || item.type !== ITEM_TYPES.FISH_SLOT) return { success: false, message: '不是魚隻擴充欄' }
  const applied = getAppliedFishSlotExpansions(username)
  if (countAppliedFishSlot(username, itemId) >= getOwnedItemQty(username, itemId)) {
    return { success: false, message: '持有數量不足，請先再購買擴充欄' }
  }
  if (applied.length >= MAX_FISH_SLOTS - DEFAULT_FISH_SLOTS) {
    return { success: false, message: `已達最多 ${MAX_FISH_SLOTS} 隻` }
  }
  persistFishCapacity(username, [...applied, itemId])
  return { success: true }
}

export function unequipOneFishSlot(username, itemId) {
  if (!username || !itemId) return { success: false, message: '請先登入' }
  const applied = getAppliedFishSlotExpansions(username)
  const idx = applied.lastIndexOf(itemId)
  if (idx < 0) return { success: false, message: '尚未套用此擴充欄' }
  const next = applied.slice()
  next.splice(idx, 1)
  persistFishCapacity(username, next)
  return { success: true }
}

function packFromItemId(itemId) {
  if (!itemId) return FISH_PACKS.betta
  const item = getItem(itemId)
  if (!item || item.type !== ITEM_TYPES.FISH_SKIN) return FISH_PACKS.betta
  return FISH_PACKS[item.fishKey] || FISH_PACKS.betta
}

export function reconcileFishSlots(username, slots) {
  return reconcileFishSlotsWithCap(username, slots, getFishSlotCount(username))
}

export function getEquippedFishSlots(username = getCurrentUser()) {
  if (!username) return []
  return reconcileFishSlots(username, getEquippedEffects(username).fishSlots)
}

export function countEquippedFishSkin(username, itemId) {
  return getEquippedFishSlots(username).filter((id) => String(id) === String(itemId)).length
}

export function equipOneFishSkin(username, itemId) {
  if (!username || !itemId) return { success: false, message: '請先登入' }
  const item = getItem(itemId)
  if (!item || item.type !== ITEM_TYPES.FISH_SKIN) return { success: false, message: '不是魚類外觀' }
  const cap = getFishSlotCount(username)
  const slots = getEquippedFishSlots(username)
  if (countEquippedFishSkin(username, itemId) >= getOwnedItemQty(username, itemId)) {
    return { success: false, message: '持有數量不足，請再購買一隻再套用' }
  }
  if (slots.length >= cap) {
    return { success: false, message: `目前只有 ${cap} 欄（預設 ${DEFAULT_FISH_SLOTS} 隻）。請在背包套用「魚隻擴充欄」或先卸下一隻。` }
  }
  return setFishSlots(username, [...slots, itemId])
}

export function unequipOneFishSkin(username, itemId) {
  if (!username || !itemId) return { success: false, message: '請先登入' }
  const slots = getEquippedFishSlots(username)
  const idx = slots.lastIndexOf(itemId)
  if (idx < 0) return { success: false, message: '尚未套用此魚種' }
  return unequipFishAtIndex(username, idx)
}

export function unequipFishAtIndex(username, index) {
  if (!username) return { success: false, message: '請先登入' }
  const slots = getEquippedFishSlots(username)
  const idx = Number(index)
  if (!Number.isInteger(idx) || idx < 0 || idx >= slots.length) {
    return { success: false, message: '尚未套用此魚種' }
  }
  const next = slots.slice()
  next.splice(idx, 1)
  const result = setFishSlots(username, next)
  if (result.success) result.removedIndex = idx
  return result
}

export function getFishSpeciesName(entry) {
  const itemId = entry?.itemId
  if (itemId) {
    const item = getItem(itemId)
    if (item?.name) return item.name
  }
  const names = {
    betta: '鬥魚',
    guppy: '孔雀魚',
    gar: '雀鱔',
    genghis: '成吉思汗',
    koi_platinum: '白金蝴蝶龍鯉',
    redtail_cat: '招財貓',
    arowana: '龍魚',
    arowana_blue: '藍底過背金龍',
    ray_crown: '皇冠魟',
    ray_albino: '黃冠白子魟',
    arapaima: '巨骨蛇魚',
    turtle_slider: '巴西龜',
    turtle_pig: '豬鼻龜',
    turtle_map: '地圖龜'
  }
  return names[entry?.key] || '魚'
}

export function getAmbientFishRoster(username = getCurrentUser()) {
  const cap = getFishSlotCount(username)
  const slots = username ? getEquippedFishSlots(username) : []
  return Array.from({ length: cap }, (_, i) => {
    const pack = packFromItemId(slots[i] || null)
    const variant = i % 2 === 0 ? 'a' : 'b'
    return {
      id: `fish-${i}`,
      itemId: slots[i] || null,
      key: pack.key,
      wide: pack.wide,
      shape: pack.shape || 'fish',
      src: variant === 'a' ? pack.a : pack.b,
      variant
    }
  })
}
