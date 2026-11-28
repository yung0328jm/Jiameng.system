import { getCurrentUser } from './authStorage'
import { getEquippedEffects, setFishSlots, setFishSlotExpansions } from './effectStorage'
import { getUserInventory } from './inventoryStorage'
import {
  FISH_AROANA_BLUE_ITEM_ID,
  FISH_AROANA_ITEM_ID,
  FISH_ARAPAIMA_ITEM_ID,
  FISH_BETTA_ITEM_ID,
  FISH_GAR_ITEM_ID,
  FISH_GENGHIS_ITEM_ID,
  FISH_GUPPY_ITEM_ID,
  FISH_KOI_PLATINUM_ITEM_ID,
  FISH_RAY_ALBINO_ITEM_ID,
  FISH_RAY_CROWN_ITEM_ID,
  FISH_REDTAIL_CAT_ITEM_ID,
  FISH_TURTLE_MAP_ITEM_ID,
  FISH_TURTLE_PIG_ITEM_ID,
  FISH_TURTLE_SLIDER_ITEM_ID,
  ITEM_TYPES,
  getItem
} from './itemStorage'

export const DEFAULT_FISH_SLOTS = 2
export const MAX_FISH_SLOTS = 50

/** Front-glass tank used for on-screen scale (length × width × height, cm). */
export const TANK_CM = { length: 300, width: 150, height: 90 }

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

export function fishBodyAspect(shape, wide) {
  if (shape === 'turtle') return 0.72
  if (shape === 'ray') return 0.58
  if (shape === 'cichlid') return 0.56
  if (shape === 'shark') return 0.46
  if (shape === 'koi') return 0.5
  if (shape === 'giant') return 0.28
  if (wide) return 0.32
  return 0.52
}

/** Pixels per cm so the 300×90 cm front glass fits the current view. */
export function tankPxPerCm(viewW, viewH) {
  const w = Math.max(1, Number(viewW) || 1)
  const h = Math.max(1, Number(viewH) || 1)
  return Math.min(w / TANK_CM.length, h / TANK_CM.height)
}

export function fishScreenSize(lengthCm, viewW, viewH, shape, wide, girthRatio = 1) {
  const cm = Math.max(0.5, Number(lengthCm) || FISH_ADULT_CM.betta)
  const px = tankPxPerCm(viewW, viewH)
  const width = Math.max(8, Math.round(cm * px))
  const aspect = fishBodyAspect(shape, wide) * (Number(girthRatio) > 0 ? girthRatio : 1)
  let height = Math.max(5, Math.round(width * aspect))
  const maxH = Math.max(5, Math.round(TANK_CM.height * px * 0.92))
  if (height > maxH && height > 0) {
    const k = maxH / height
    return { width: Math.max(8, Math.round(width * k)), height: maxH }
  }
  return { width, height }
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

const FISH_ITEM_SPECIES = {
  [FISH_AROANA_ITEM_ID]: 'arowana',
  [FISH_AROANA_BLUE_ITEM_ID]: 'arowana_blue',
  [FISH_RAY_CROWN_ITEM_ID]: 'ray_crown',
  [FISH_RAY_ALBINO_ITEM_ID]: 'ray_albino',
  [FISH_ARAPAIMA_ITEM_ID]: 'arapaima',
  [FISH_BETTA_ITEM_ID]: 'betta',
  [FISH_GUPPY_ITEM_ID]: 'guppy',
  [FISH_GAR_ITEM_ID]: 'gar',
  [FISH_GENGHIS_ITEM_ID]: 'genghis',
  [FISH_KOI_PLATINUM_ITEM_ID]: 'koi_platinum',
  [FISH_REDTAIL_CAT_ITEM_ID]: 'redtail_cat',
  [FISH_TURTLE_SLIDER_ITEM_ID]: 'turtle_slider',
  [FISH_TURTLE_PIG_ITEM_ID]: 'turtle_pig',
  [FISH_TURTLE_MAP_ITEM_ID]: 'turtle_map'
}

function speciesFromItemId(itemId) {
  const id = String(itemId || '').trim()
  if (!id) return ''
  const item = getItem(id)
  if (item?.fishKey && FISH_PACKS[item.fishKey]) return item.fishKey
  if (FISH_ITEM_SPECIES[id] && FISH_PACKS[FISH_ITEM_SPECIES[id]]) return FISH_ITEM_SPECIES[id]
  return ''
}

function speciesFromNick(nick) {
  const s = String(nick || '')
  if (/藍底過背|過背金龍/.test(s)) return 'arowana_blue'
  if (/霸王龍|紅龍|金龍|銀龍|龍魚/.test(s) && !/鬥魚|孔雀/.test(s)) return 'arowana'
  return ''
}

export function speciesKeyFromRefs({ itemId, key, rec, bornSpecies, nick } = {}) {
  const fromItem = speciesFromItemId(itemId) || speciesFromItemId(rec?.itemId)
  if (fromItem) return fromItem
  const recSp = String(rec?.species || '').trim()
  if (recSp && FISH_PACKS[recSp] && recSp !== 'betta') return recSp
  const born = String(bornSpecies || '').trim()
  if (born && FISH_PACKS[born] && born !== 'betta') return born
  const stored = String(key || '').trim()
  if (stored && FISH_PACKS[stored] && stored !== 'betta') return stored
  const fromNick = speciesFromNick(nick)
  if (fromNick) return fromNick
  if (stored && FISH_PACKS[stored]) return stored
  if (recSp && FISH_PACKS[recSp]) return recSp
  if (born && FISH_PACKS[born]) return born
  return 'betta'
}

export function getFishSpeciesName(entry) {
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
  const item = entry?.itemId ? getItem(entry.itemId) : null
  const key = speciesKeyFromRefs({ itemId: entry?.itemId, key: entry?.key, rec: { itemId: entry?.itemId, species: entry?.key } })
  if (names[key]) return names[key]
  if (item?.name) return item.name
  return '魚'
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
