// 特效裝備系統存儲工具
import { syncKeyToSupabase } from './supabaseSync'
const EFFECT_STORAGE_KEY = 'jiameng_equipped_effects'

const persist = (effects) => {
  const val = JSON.stringify(effects)
  localStorage.setItem(EFFECT_STORAGE_KEY, val)
  syncKeyToSupabase(EFFECT_STORAGE_KEY, val)
}

// 獲取用戶裝備的特效
export const getEquippedEffects = (username) => {
  try {
    const data = localStorage.getItem(EFFECT_STORAGE_KEY)
    const effects = data ? JSON.parse(data) : {}
    return effects[username] || {
      nameEffect: null, // 裝備的名子特效道具ID
      messageEffect: null, // 裝備的發話特效道具ID
      title: null // 裝備的稱號道具ID
    }
  } catch (error) {
    console.error('Error getting equipped effects:', error)
    return {
      nameEffect: null,
      messageEffect: null,
      title: null
    }
  }
}

// 裝備特效道具
export const equipEffect = (username, itemId, effectType) => {
  try {
    const data = localStorage.getItem(EFFECT_STORAGE_KEY)
    const effects = data ? JSON.parse(data) : {}
    
    if (!effects[username]) {
      effects[username] = {
        nameEffect: null,
        messageEffect: null,
        title: null
      }
    }
    
    if (effectType === 'name') {
      effects[username].nameEffect = itemId
    } else if (effectType === 'message') {
      effects[username].messageEffect = itemId
    } else if (effectType === 'title') {
      effects[username].title = itemId
    }
    
    persist(effects)
    return { success: true }
  } catch (error) {
    console.error('Error equipping effect:', error)
    return { success: false, message: '裝備特效失敗' }
  }
}

// 卸下特效道具
export const unequipEffect = (username, effectType) => {
  try {
    const data = localStorage.getItem(EFFECT_STORAGE_KEY)
    const effects = data ? JSON.parse(data) : {}
    
    if (!effects[username]) {
      return { success: false, message: '沒有裝備特效' }
    }
    
    if (effectType === 'name') {
      effects[username].nameEffect = null
    } else if (effectType === 'message') {
      effects[username].messageEffect = null
    } else if (effectType === 'title') {
      effects[username].title = null
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
