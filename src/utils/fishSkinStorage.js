import { getCurrentUser } from './authStorage'
import { getEquippedEffects, setFishSlots, setFishSlotExpansions } from './effectStorage'
import { getUserInventory } from './inventoryStorage'
import { getItem, ITEM_TYPES } from './itemStorage'

export const DEFAULT_FISH_SLOTS = 2
export const MAX_FISH_SLOTS = 6

export const FISH_PACKS = {
  betta: {
    key: 'betta',
    wide: false,
    a: '/images/betta-a.png',
    b: '/images/betta-b.png'
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
  if (!username) return DEFAULT_FISH_SLOTS
  return Math.min(MAX_FISH_SLOTS, DEFAULT_FISH_SLOTS + getAppliedFishSlotExpansions(username).length)
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
  const next = slots.slice()
  next.splice(idx, 1)
  return setFishSlots(username, next)
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
