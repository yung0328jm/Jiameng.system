// 特效裝備系統存儲工具
import { syncKeyToSupabase } from './supabaseSync'
import { REALTIME_UPDATE_EVENT } from './supabaseRealtime'
const EFFECT_STORAGE_KEY = 'jiameng_equipped_effects'

const emptyEquip = () => ({
  nameEffect: null,
  messageEffect: null,
  title: null,
  fish: null,
  fishSlots: [],
  fishSlotExpansions: []
})

const persist = (effects) => {
  const val = JSON.stringify(effects)
  localStorage.setItem(EFFECT_STORAGE_KEY, val)
  syncKeyToSupabase(EFFECT_STORAGE_KEY, val)
  try {
    window.dispatchEvent(new CustomEvent(REALTIME_UPDATE_EVENT, { detail: { key: EFFECT_STORAGE_KEY } }))
  } catch (_) {}
}

export const normalizeFishSlots = (userEffects) => {
  const raw = userEffects || {}
  if (Array.isArray(raw.fishSlots) && raw.fishSlots.length > 0) {
    return raw.fishSlots.map((id) => String(id || '').trim()).filter(Boolean)
  }
  if (raw.fish) return [String(raw.fish)]
  return []
}

export const normalizeFishSlotExpansions = (userEffects) => {
  const raw = userEffects || {}
  if (Array.isArray(raw.fishSlotExpansions)) {
    return raw.fishSlotExpansions.map((id) => String(id || '').trim()).filter(Boolean)
  }
  const n = Math.max(0, Number(raw.fishSlotExpansions) || 0)
  return n > 0 ? Array.from({ length: n }, () => 'fish_slot_expand') : []
}

const readAll = () => {
  try {
    const data = localStorage.getItem(EFFECT_STORAGE_KEY)
    return data ? JSON.parse(data) : {}
  } catch (_) {
    return {}
  }
}

// 獲取用戶裝備的特效
export const getEquippedEffects = (username) => {
  try {
    const effects = readAll()
    const merged = { ...emptyEquip(), ...(effects[username] || {}) }
    merged.fishSlots = normalizeFishSlots(merged)
    merged.fishSlotExpansions = normalizeFishSlotExpansions(merged)
    return merged
  } catch (error) {
    console.error('Error getting equipped effects:', error)
    return emptyEquip()
  }
}

const writeUser = (username, nextUser) => {
  const effects = readAll()
  effects[username] = nextUser
  persist(effects)
}

// 裝備特效道具
export const equipEffect = (username, itemId, effectType) => {
  try {
    const effects = readAll()
    
    if (!effects[username]) {
      effects[username] = emptyEquip()
    }
    
    if (effectType === 'name') {
      effects[username].nameEffect = itemId
    } else if (effectType === 'message') {
      effects[username].messageEffect = itemId
    } else if (effectType === 'title') {
      effects[username].title = itemId
    } else if (effectType === 'fish') {
      const slots = normalizeFishSlots(effects[username])
      slots.push(itemId)
      effects[username].fishSlots = slots
      effects[username].fish = null
    }
    
    persist(effects)
    return { success: true }
  } catch (error) {
    console.error('Error equipping effect:', error)
    return { success: false, message: '裝備特效失敗' }
  }
}

export const setFishSlots = (username, slots) => {
  try {
    const current = getEquippedEffects(username)
    writeUser(username, {
      ...current,
      fish: null,
      fishSlots: (Array.isArray(slots) ? slots : []).map((id) => String(id || '').trim()).filter(Boolean)
    })
    return { success: true }
  } catch (error) {
    console.error('Error setting fish slots:', error)
    return { success: false, message: '更新魚欄失敗' }
  }
}

export const setFishSlotExpansions = (username, expansions) => {
  try {
    const current = getEquippedEffects(username)
    writeUser(username, {
      ...current,
      fishSlotExpansions: (Array.isArray(expansions) ? expansions : []).map((id) => String(id || '').trim()).filter(Boolean)
    })
    return { success: true }
  } catch (error) {
    console.error('Error setting fish slot expansions:', error)
    return { success: false, message: '更新擴充欄失敗' }
  }
}

// 卸下特效道具
export const unequipEffect = (username, effectType) => {
  try {
    const effects = readAll()
    
    if (!effects[username]) {
      return { success: false, message: '沒有裝備特效' }
    }
    
    if (effectType === 'name') {
      effects[username].nameEffect = null
    } else if (effectType === 'message') {
      effects[username].messageEffect = null
    } else if (effectType === 'title') {
      effects[username].title = null
    } else if (effectType === 'fish') {
      effects[username].fish = null
      effects[username].fishSlots = []
    }
    
    persist(effects)
    return { success: true }
  } catch (error) {
    console.error('Error unequipping effect:', error)
    return { success: false, message: '卸下特效失敗' }
  }
}

// 獲取所有用戶的裝備特效（管理員功能）
export const getAllEquippedEffects = () => {
  try {
    const data = localStorage.getItem(EFFECT_STORAGE_KEY)
    return data ? JSON.parse(data) : {}
  } catch (error) {
    console.error('Error getting all equipped effects:', error)
    return {}
  }
}

// 清理所有用戶已裝備特效：若裝備的 itemId 在清單內，直接卸下（用於刪除排行榜連動）
// itemIds: string[] | Set<string>
export const cleanupEquippedEffectsByItemIds = (itemIds) => {
  try {
    const ids = itemIds instanceof Set ? itemIds : new Set(Array.isArray(itemIds) ? itemIds : [])
    if (ids.size === 0) return { success: true, cleanedUsers: 0 }
    const all = getAllEquippedEffects()
    let cleanedUsers = 0
    let changed = false
    Object.keys(all || {}).forEach((username) => {
      const e = all[username] || {}
      const next = { ...e }
      let touched = false
      if (next.nameEffect && ids.has(next.nameEffect)) { next.nameEffect = null; touched = true }
      if (next.messageEffect && ids.has(next.messageEffect)) { next.messageEffect = null; touched = true }
      if (next.title && ids.has(next.title)) { next.title = null; touched = true }
      if (next.fish && ids.has(next.fish)) { next.fish = null; touched = true }
      const slots = normalizeFishSlots(next)
      const filtered = slots.filter((id) => !ids.has(id))
      if (filtered.length !== slots.length) {
        next.fishSlots = filtered
        next.fish = null
        touched = true
      }
      const expansions = normalizeFishSlotExpansions(next)
      const filteredExp = expansions.filter((id) => !ids.has(id))
      if (filteredExp.length !== expansions.length) {
        next.fishSlotExpansions = filteredExp
        touched = true
      }
      if (touched) {
        all[username] = next
        cleanedUsers += 1
        changed = true
      }
    })
    if (changed) persist(all)
    return { success: true, cleanedUsers }
  } catch (error) {
    console.error('cleanupEquippedEffectsByItemIds failed', error)
    return { success: false, message: '清理裝備特效失敗' }
  }
}

// 清空所有用戶已裝備特效（管理員功能）
export const clearAllEquippedEffects = () => {
  try {
    persist({})
    return { success: true }
  } catch (error) {
    console.error('clearAllEquippedEffects failed', error)
    return { success: false, message: '清空已裝備特效失敗' }
  }
}
