// 名稱特效共用邏輯（名子特效、裝飾、稱號徽章、稱號文字），供行程回報、行事曆等顯示用戶名時套用
import { getItem, ITEM_TYPES } from './itemStorage'
import { getEquippedEffects } from './effectStorage'
import { getEffectDisplayConfig, getStyleForPreset, getDecorationForPreset, getDecorationById } from './effectDisplayStorage'

function getPresetIdByRank(leaderboard, kind, rank) {
  if (!leaderboard) return ''
  const r = String(rank)
  const key = kind === 'name' ? `nameEffectPresetIdRank${r}` : kind === 'message' ? `messageEffectPresetIdRank${r}` : `titleBadgePresetIdRank${r}`
  const fallback = kind === 'name' ? leaderboard.nameEffectPresetId : kind === 'message' ? leaderboard.messageEffectPresetId : leaderboard.titleBadgePresetId
  return (leaderboard[key] ?? fallback) ?? ''
}

/** 獲取用戶的名子特效樣式（僅第一名有名子特效）。username 為帳號；leaderboardItems 為 getLeaderboardItems() 回傳值 */
export function getNameEffectStyle(username, leaderboardItems = []) {
  const effects = getEquippedEffects(username)
  if (!effects.nameEffect) return null
  const effectItem = getItem(effects.nameEffect)
  if (!effectItem) return null
  const rank = effectItem.rank ?? 1
  if (rank !== 1) return null
  const leaderboardId = effectItem.leaderboardId || ''
  const leaderboard = leaderboardId ? leaderboardItems.find((l) => l.id === leaderboardId) : null
  const presetId = getPresetIdByRank(leaderboard, 'name', rank)
  return getStyleForPreset('name', presetId, rank) || null
}

/** 獲取名子旁裝飾（第 1、2、3 名皆可顯示） */
export function getDecorationForNameEffect(username, leaderboardItems = []) {
  const effects = getEquippedEffects(username)
  let leaderboardId = ''
  let rank = 1
  if (effects.nameEffect) {
    const effectItem = getItem(effects.nameEffect)
    if (effectItem) {
      leaderboardId = effectItem.leaderboardId || ''
      rank = effectItem.rank ?? 1
    }
  }
  if (!leaderboardId && effects.title) {
    const titleItem = getItem(effects.title)
    if (titleItem && titleItem.type === ITEM_TYPES.TITLE) {
      leaderboardId = titleItem.leaderboardId || ''
      rank = titleItem.rank ?? 1
    }
  }
  if (!leaderboardId) return null
  const leaderboard = leaderboardItems.find((l) => l.id === leaderboardId)
  const decoId = leaderboard?.[`decorationPresetIdRank${rank}`]
  if (decoId) {
    const deco = getDecorationById(decoId)
    if (deco) return deco
  }
  const presetId = getPresetIdByRank(leaderboard, 'name', rank)
  return getDecorationForPreset('name', presetId, rank)
}

/** 獲取稱號徽章樣式 */
export function getTitleBadgeStyle(username, leaderboardItems = []) {
  if (!username) {
    const config = getEffectDisplayConfig()
    return config.titleBadge ? { ...config.titleBadge } : {}
  }
  const effects = getEquippedEffects(username)
  if (!effects.title) {
    const config = getEffectDisplayConfig()
    return config.titleBadge ? { ...config.titleBadge } : {}
  }
  const titleItem = getItem(effects.title)
  if (!titleItem || titleItem.type !== ITEM_TYPES.TITLE) {
    const config = getEffectDisplayConfig()
    return config.titleBadge ? { ...config.titleBadge } : {}
  }
  const leaderboardId = titleItem.leaderboardId || ''
  const rank = titleItem.rank ?? 1
  const leaderboard = leaderboardId ? leaderboardItems.find((l) => l.id === leaderboardId) : null
  const presetId = getPresetIdByRank(leaderboard, 'title', rank)
  return getStyleForPreset('title', presetId, rank) || {}
}

/** 獲取用戶的稱號文字 */
export function getUserTitle(username) {
  const effects = getEquippedEffects(username)
  if (!effects.title) return null
  const titleItem = getItem(effects.title)
  if (!titleItem || titleItem.type !== ITEM_TYPES.TITLE) return null
  return titleItem.name || null
}
