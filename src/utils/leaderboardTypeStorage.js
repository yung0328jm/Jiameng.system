// 排行榜類型：供「載入類型」到編輯排行榜時套用（第一/二/三名稱號 + 名子/發話/稱號特效）
import { syncKeyToSupabase } from './supabaseSync'
const LEADERBOARD_TYPE_STORAGE_KEY = 'jiameng_leaderboard_types'

const persist = (list) => {
  const val = JSON.stringify(list)
  localStorage.setItem(LEADERBOARD_TYPE_STORAGE_KEY, val)
  syncKeyToSupabase(LEADERBOARD_TYPE_STORAGE_KEY, val)
}

export const getLeaderboardTypes = () => {
  try {
    const raw = localStorage.getItem(LEADERBOARD_TYPE_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (e) {
    console.error('getLeaderboardTypes:', e)
    return []
  }
}

// 依名次取得單一 presetId（優先 Rank1/2/3，無則用舊的統一欄位）
export const getPresetIdByRank = (type, effectKind, rank) => {
  const r = String(rank)
  const key = effectKind === 'name' ? `nameEffectPresetIdRank${r}` : effectKind === 'message' ? `messageEffectPresetIdRank${r}` : `titleBadgePresetIdRank${r}`
  const fallback = effectKind === 'name' ? type.nameEffectPresetId : effectKind === 'message' ? type.messageEffectPresetId : type.titleBadgePresetId
  return (type[key] ?? fallback) ?? ''
}

export const addLeaderboardType = (type) => {
  try {
    const list = getLeaderboardTypes()
    const newItem = {
      id: type.id || `type_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: type.name || '未命名類型',
      titleFirstPlace: type.titleFirstPlace ?? '',
      titleSecondPlace: type.titleSecondPlace ?? '',
      titleThirdPlace: type.titleThirdPlace ?? '',
      nameEffectPresetId: type.nameEffectPresetId ?? '',
      messageEffectPresetId: type.messageEffectPresetId ?? '',
      titleBadgePresetId: type.titleBadgePresetId ?? '',
      nameEffectPresetIdRank1: type.nameEffectPresetIdRank1 ?? '', nameEffectPresetIdRank2: type.nameEffectPresetIdRank2 ?? '', nameEffectPresetIdRank3: type.nameEffectPresetIdRank3 ?? '',
      messageEffectPresetIdRank1: type.messageEffectPresetIdRank1 ?? '', messageEffectPresetIdRank2: type.messageEffectPresetIdRank2 ?? '', messageEffectPresetIdRank3: type.messageEffectPresetIdRank3 ?? '',
      titleBadgePresetIdRank1: type.titleBadgePresetIdRank1 ?? '', titleBadgePresetIdRank2: type.titleBadgePresetIdRank2 ?? '', titleBadgePresetIdRank3: type.titleBadgePresetIdRank3 ?? '',
      decorationPresetIdRank1: type.decorationPresetIdRank1 ?? '', decorationPresetIdRank2: type.decorationPresetIdRank2 ?? '', decorationPresetIdRank3: type.decorationPresetIdRank3 ?? '',
      createdAt: new Date().toISOString()
    }
    list.push(newItem)
    persist(list)
    return { success: true, item: newItem }
  } catch (e) {
    console.error('addLeaderboardType:', e)
    return { success: false, message: '新增失敗' }
  }
}

export const updateLeaderboardType = (id, updates) => {
  try {
    const list = getLeaderboardTypes()
    const idx = list.findIndex((t) => t.id === id)
    if (idx === -1) return { success: false, message: '類型不存在' }
    list[idx] = { ...list[idx], ...updates, updatedAt: new Date().toISOString() }
    persist(list)
    return { success: true }
  } catch (e) {
    console.error('updateLeaderboardType:', e)
    return { success: false, message: '更新失敗' }
  }
}

export const deleteLeaderboardType = (id) => {
  try {
    const list = getLeaderboardTypes().filter((t) => t.id !== id)
    localStorage.setItem(LEADERBOARD_TYPE_STORAGE_KEY, JSON.stringify(list))
    return { success: true }
  } catch (e) {
    console.error('deleteLeaderboardType:', e)
    return { success: false, message: '刪除失敗' }
  }
}
