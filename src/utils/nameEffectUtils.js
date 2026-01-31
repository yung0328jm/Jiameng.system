// 名稱特效共用邏輯（名子特效、裝飾、稱號徽章、稱號文字），供行程回報、行事曆等顯示用戶名時套用
import { getItem, ITEM_TYPES } from './itemStorage'
import { getEquippedEffects, unequipEffect } from './effectStorage'
import { hasItem } from './inventoryStorage'
import { getEffectDisplayConfig, getStyleForPreset, getDecorationForPreset, getDecorationById } from './effectDisplayStorage'

function getPresetIdByRank(leaderboard, kind, rank) {
  if (!leaderboard) return ''
  const r = String(rank)
  const key = kind === 'name' ? `nameEffectPresetIdRank${r}` : kind === 'message' ? `messageEffectPresetIdRank${r}` : `titleBadgePresetIdRank${r}`
  const fallback = kind === 'name' ? leaderboard.nameEffectPresetId : kind === 'message' ? leaderboard.messageEffectPresetId : leaderboard.titleBadgePresetId
  return (leaderboard[key] ?? fallback) ?? ''
}

function isLeaderboardActive(leaderboardItems, leaderboardId) {
  if (!leaderboardId) return true
  return (Array.isArray(leaderboardItems) ? leaderboardItems : []).some((l) => l && l.id === leaderboardId)
}

/**
 * 取得「仍有效」的已裝備道具：若已被回收 / 道具已刪除 / 排行榜已移除，會自動卸下，避免畫面還掛著。
 */
function getValidEquippedItem(username, slot, leaderboardItems, expectedType = null) {
  if (!username) return null
  const effects = getEquippedEffects(username)
  const itemId =
    slot === 'name' ? effects?.nameEffect :
      slot === 'message' ? effects?.messageEffect :
        slot === 'title' ? effects?.title :
          null
  if (!itemId) return null

  const item = getItem(itemId)
  if (!item) {
    try { unequipEffect(username, slot) } catch (_) {}
    return null
  }
  if (expectedType && item.type !== expectedType) {
    try { unequipEffect(username, slot) } catch (_) {}
    return null
  }
  // 背包已回收/沒有此道具：自動卸下（避免繼續顯示特效）
  try {
    if (!hasItem(username, itemId)) {
      unequipEffect(username, slot)
      return null
    }
  } catch (_) {}
  // 排行榜已刪除：若道具是「依賴排行榜設定」的舊模式（沒有 presetId），就應失效並卸下。
  // 新模式（固定 ID 特效道具）：道具自帶 presetId，不依賴排行榜是否存在，故不在此卸下。
  if (item.leaderboardId && !item.presetId && !isLeaderboardActive(leaderboardItems, item.leaderboardId)) {
    try { unequipEffect(username, slot) } catch (_) {}
    return null
  }

  return item
}

/** 獲取用戶的名子特效樣式（僅第一名有名子特效）。username 為帳號；leaderboardItems 為 getLeaderboardItems() 回傳值 */
export function getNameEffectStyle(username, leaderboardItems = []) {
  const effectItem = getValidEquippedItem(username, 'name', leaderboardItems, ITEM_TYPES.NAME_EFFECT)
  if (!effectItem) return null
  const rank = effectItem.rank ?? 1
  if (rank !== 1) return null
  const presetId = (effectItem.presetId || '').trim()
    ? String(effectItem.presetId).trim()
    : (() => {
      const leaderboardId = effectItem.leaderboardId || ''
      const leaderboard = leaderboardId ? leaderboardItems.find((l) => l.id === leaderboardId) : null
      return getPresetIdByRank(leaderboard, 'name', rank)
    })()
  return getStyleForPreset('name', presetId, rank) || null
}

/** 獲取名子旁裝飾（第 1、2、3 名皆可顯示） */
export function getDecorationForNameEffect(username, leaderboardItems = []) {
  const nameItem = getValidEquippedItem(username, 'name', leaderboardItems, ITEM_TYPES.NAME_EFFECT)
  if (nameItem) {
    const decoId = String(nameItem.decorationPresetId || '').trim()
    if (decoId) {
      const deco = getDecorationById(decoId)
      if (deco) return deco
    }
  }

  let leaderboardId = ''
  let rank = 1
  if (nameItem) {
    leaderboardId = nameItem.leaderboardId || ''
    rank = nameItem.rank ?? 1
  } else {
    const titleItem = getValidEquippedItem(username, 'title', leaderboardItems, ITEM_TYPES.TITLE)
    if (titleItem) {
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
  const titleItem = getValidEquippedItem(username, 'title', leaderboardItems, ITEM_TYPES.TITLE)
  if (!titleItem) {
    const config = getEffectDisplayConfig()
    return config.titleBadge ? { ...config.titleBadge } : {}
  }
  const leaderboardId = titleItem.leaderboardId || ''
  const rank = titleItem.rank ?? 1
  const presetId = (titleItem.presetId || '').trim()
    ? String(titleItem.presetId).trim()
    : (() => {
      const leaderboard = leaderboardId ? leaderboardItems.find((l) => l.id === leaderboardId) : null
      return getPresetIdByRank(leaderboard, 'title', rank)
    })()
  return getStyleForPreset('title', presetId, rank) || {}
}

/** 獲取用戶的稱號文字 */
export function getUserTitle(username) {
  const titleItem = getValidEquippedItem(username, 'title', [], ITEM_TYPES.TITLE)
  if (!titleItem) return null
  return titleItem.name || null
}
