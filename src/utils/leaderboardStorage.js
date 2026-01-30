// 排行榜項目存儲工具
import { syncKeyToSupabase } from './supabaseSync'
import { getItems, deleteItem, ITEM_TYPES } from './itemStorage'
import { removeItemIdsFromAllInventories } from './inventoryStorage'
import { cleanupEquippedEffectsByItemIds } from './effectStorage'
const LEADERBOARD_STORAGE_KEY = 'jiameng_leaderboard_items'
const LEADERBOARD_UI_STORAGE_KEY = 'jiameng_leaderboard_ui'
const MANUAL_RANKINGS_STORAGE_KEY = 'jiameng_manual_rankings'

const persistManualRankings = (data) => {
  const val = JSON.stringify(data || {})
  localStorage.setItem(MANUAL_RANKINGS_STORAGE_KEY, val)
  syncKeyToSupabase(MANUAL_RANKINGS_STORAGE_KEY, val)
}

const deleteManualRankingsForLeaderboard = (leaderboardItemId) => {
  try {
    const allRankings = localStorage.getItem(MANUAL_RANKINGS_STORAGE_KEY)
    const data = allRankings ? JSON.parse(allRankings) : {}
    if (data && Object.prototype.hasOwnProperty.call(data, leaderboardItemId)) {
      delete data[leaderboardItemId]
      persistManualRankings(data)
    }
  } catch (e) {
    console.warn('deleteManualRankingsForLeaderboard failed', e)
  }
}

const cleanupLeaderboardRewardItems = (leaderboardIds) => {
  const idSet = new Set((Array.isArray(leaderboardIds) ? leaderboardIds : []).map((x) => String(x)))
  if (idSet.size === 0) return { success: true, removedItems: 0 }
  const items = getItems()
  const specialItems = items.filter(
    (i) => idSet.has(String(i?.leaderboardId || '')) &&
      (i?.type === ITEM_TYPES.TITLE || i?.type === ITEM_TYPES.NAME_EFFECT || i?.type === ITEM_TYPES.MESSAGE_EFFECT)
  )
  const specialIds = new Set(specialItems.map((i) => String(i.id)))
  if (specialIds.size === 0) return { success: true, removedItems: 0 }

  // 先卸下所有人裝備，再移除背包，再刪除道具定義
  cleanupEquippedEffectsByItemIds(specialIds)
  removeItemIdsFromAllInventories(specialIds)
  specialItems.forEach((it) => { try { deleteItem(it.id) } catch (_) {} })
  return { success: true, removedItems: specialIds.size }
}

// 獲取所有排行榜項目（保證回傳陣列，避免 .map is not a function）
export const getLeaderboardItems = () => {
  try {
    const items = localStorage.getItem(LEADERBOARD_STORAGE_KEY)
    const parsed = items ? JSON.parse(items) : []
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.error('Error getting leaderboard items:', error)
    return []
  }
}

// 保存排行榜項目
export const saveLeaderboardItems = (items) => {
  try {
    const val = JSON.stringify(items)
    localStorage.setItem(LEADERBOARD_STORAGE_KEY, val)
    syncKeyToSupabase(LEADERBOARD_STORAGE_KEY, val)
    return { success: true }
  } catch (error) {
    console.error('Error saving leaderboard items:', error)
    return { success: false, message: '保存失敗' }
  }
}

// 添加排行榜項目
export const addLeaderboardItem = (item) => {
  try {
    const items = getLeaderboardItems()
    const newItem = {
      ...item,
      id: item.id || Date.now().toString(),
      createdAt: item.createdAt || new Date().toISOString()
    }
    items.push(newItem)
    saveLeaderboardItems(items)
    return { success: true, item: newItem }
  } catch (error) {
    console.error('Error adding leaderboard item:', error)
    return { success: false, message: '添加失敗' }
  }
}

// 更新排行榜項目
export const updateLeaderboardItem = (id, updates) => {
  try {
    const items = getLeaderboardItems()
    const index = items.findIndex(item => item.id === id)
    if (index === -1) {
      return { success: false, message: '項目不存在' }
    }
    items[index] = { ...items[index], ...updates, updatedAt: new Date().toISOString() }
    saveLeaderboardItems(items)
    return { success: true }
  } catch (error) {
    console.error('Error updating leaderboard item:', error)
    return { success: false, message: '更新失敗' }
  }
}

// 刪除排行榜項目
export const deleteLeaderboardItem = (id, options = {}) => {
  try {
    const cleanupRewards = options?.cleanupRewards !== false
    const items = getLeaderboardItems()
    const filtered = items.filter(item => item.id !== id)
    saveLeaderboardItems(filtered)
    // 同時刪除該項目的手動排名數據
    deleteManualRankingsForLeaderboard(String(id))
    // 同時清理此榜的稱號/特效道具（避免刪榜後背包還留著）
    if (cleanupRewards) cleanupLeaderboardRewardItems([String(id)])
    return { success: true }
  } catch (error) {
    console.error('Error deleting leaderboard item:', error)
    return { success: false, message: '刪除失敗' }
  }
}

// 獲取排行榜UI配置
export const getLeaderboardUIConfig = () => {
  try {
    const config = localStorage.getItem(LEADERBOARD_UI_STORAGE_KEY)
    if (config) {
      return JSON.parse(config)
    }
    // 返回默認配置
    return {
      companyName: '佳盟事業群',
      subtitle: '業績',
      mainTitle: '排行榜',
      slogan1: '乘風破浪 披荊斬棘',
      slogan2: '感謝有你·一路同行',
      footerText: 'THANK YOU FOR TRAVELING WITH US',
      columnRank: '排名',
      columnDepartment: '部門',
      columnName: '姓名',
      columnTime: '時間',
      columnDaysOnList: '上榜天數',
      columnPerformance: '業績',
      defaultDepartment: '作業部',
      leaderboardTitle: '排行榜標題'
    }
  } catch (error) {
    console.error('Error getting leaderboard UI config:', error)
    return {
      companyName: '佳盟事業群',
      subtitle: '業績',
      mainTitle: '排行榜',
      slogan1: '乘風破浪 披荊斬棘',
      slogan2: '感謝有你·一路同行',
      footerText: 'THANK YOU FOR TRAVELING WITH US',
      columnRank: '排名',
      columnDepartment: '部門',
      columnName: '姓名',
      columnTime: '時間',
      columnDaysOnList: '上榜天數',
      columnPerformance: '業績',
      defaultDepartment: '作業部',
      leaderboardTitle: '排行榜標題'
    }
  }
}

// 保存排行榜UI配置
export const saveLeaderboardUIConfig = (config) => {
  try {
    const val = JSON.stringify(config)
    localStorage.setItem(LEADERBOARD_UI_STORAGE_KEY, val)
    syncKeyToSupabase(LEADERBOARD_UI_STORAGE_KEY, val)
    return { success: true }
  } catch (error) {
    console.error('Error saving leaderboard UI config:', error)
    return { success: false, message: '保存失敗' }
  }
}

// 初始化默認排行榜項目
export const initializeDefaultLeaderboardItems = () => {
  try {
    const items = getLeaderboardItems()
    if (items.length === 0) {
      const defaultItems = [
        {
          id: '1',
          name: '平均完成率',
          type: 'completionRate',
          workContent: '', // 空表示所有工作項目
          createdAt: new Date().toISOString()
        },
        {
          id: '2',
          name: '完成項目數',
          type: 'completedItems',
          workContent: '',
          createdAt: new Date().toISOString()
        },
        {
          id: '3',
          name: '工作項目總數',
          type: 'workItems',
          workContent: '',
          createdAt: new Date().toISOString()
        }
      ]
      saveLeaderboardItems(defaultItems)
      return { success: true }
    }
    return { success: false, message: '已有排行榜項目' }
  } catch (error) {
    console.error('Error initializing default leaderboard items:', error)
    return { success: false, message: '初始化失敗' }
  }
}

// 手動編輯的排名數據存儲

// 獲取指定排行榜項目的手動排名數據
export const getManualRankings = (leaderboardItemId) => {
  try {
    const allRankings = localStorage.getItem(MANUAL_RANKINGS_STORAGE_KEY)
    if (!allRankings) return []
    const data = JSON.parse(allRankings)
    return data[leaderboardItemId] || []
  } catch (error) {
    console.error('Error getting manual rankings:', error)
    return []
  }
}

// 保存指定排行榜項目的手動排名數據
export const saveManualRankings = (leaderboardItemId, rankings) => {
  try {
    const allRankings = localStorage.getItem(MANUAL_RANKINGS_STORAGE_KEY)
    const data = allRankings ? JSON.parse(allRankings) : {}
    data[leaderboardItemId] = rankings
    const val = JSON.stringify(data)
    localStorage.setItem(MANUAL_RANKINGS_STORAGE_KEY, val)
    syncKeyToSupabase(MANUAL_RANKINGS_STORAGE_KEY, val)
    return { success: true }
  } catch (error) {
    console.error('Error saving manual rankings:', error)
    return { success: false, message: '保存失敗' }
  }
}

// 添加排名項目
export const addManualRanking = (leaderboardItemId, ranking) => {
  try {
    const rankings = getManualRankings(leaderboardItemId)
    const newRanking = {
      ...ranking,
      id: ranking.id || Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
      rank: ranking.rank || rankings.length + 1,
      createdAt: ranking.createdAt || new Date().toISOString()
    }
    rankings.push(newRanking)
    
    // 根據數量重新排序（數量多的排前面）
    rankings.sort((a, b) => {
      const qtyA = parseFloat(a.quantity) || 0
      const qtyB = parseFloat(b.quantity) || 0
      if (qtyB !== qtyA) {
        return qtyB - qtyA // 降序排列
      }
      // 如果數量相同，按排名排序
      return (a.rank || 0) - (b.rank || 0)
    })
    
    // 重新分配排名
    rankings.forEach((r, index) => {
      r.rank = index + 1
    })
    
    saveManualRankings(leaderboardItemId, rankings)
    return { success: true, ranking: newRanking }
  } catch (error) {
    console.error('Error adding manual ranking:', error)
    return { success: false, message: '添加失敗' }
  }
}

// 更新排名項目
export const updateManualRanking = (leaderboardItemId, rankingId, updates) => {
  try {
    const rankings = getManualRankings(leaderboardItemId)
    const index = rankings.findIndex(r => r.id === rankingId)
    if (index === -1) {
      return { success: false, message: '排名項目不存在' }
    }
    rankings[index] = { ...rankings[index], ...updates, updatedAt: new Date().toISOString() }
    
    // 根據數量重新排序（數量多的排前面）
    rankings.sort((a, b) => {
      const qtyA = parseFloat(a.quantity) || 0
      const qtyB = parseFloat(b.quantity) || 0
      if (qtyB !== qtyA) {
        return qtyB - qtyA // 降序排列
      }
      // 如果數量相同，按排名排序
      return (a.rank || 0) - (b.rank || 0)
    })
    
    // 重新分配排名
    rankings.forEach((r, idx) => {
      r.rank = idx + 1
    })
    
    saveManualRankings(leaderboardItemId, rankings)
    return { success: true }
  } catch (error) {
    console.error('Error updating manual ranking:', error)
    return { success: false, message: '更新失敗' }
  }
}

// 刪除排名項目
export const deleteManualRanking = (leaderboardItemId, rankingId) => {
  try {
    const rankings = getManualRankings(leaderboardItemId)
    const filtered = rankings.filter(r => r.id !== rankingId)
    // 重新編號
    filtered.forEach((r, index) => {
      r.rank = index + 1
    })
    saveManualRankings(leaderboardItemId, filtered)
    return { success: true }
  } catch (error) {
    console.error('Error deleting manual ranking:', error)
    return { success: false, message: '刪除失敗' }
  }
}

// 清空所有排行榜（並可選擇清理所有排行榜獎勵道具）
export const clearAllLeaderboards = (options = {}) => {
  try {
    const cleanupRewards = options?.cleanupRewards !== false
    const items = getLeaderboardItems()
    const ids = (Array.isArray(items) ? items : []).map((i) => String(i?.id || '')).filter(Boolean)
    if (cleanupRewards && ids.length > 0) cleanupLeaderboardRewardItems(ids)

    localStorage.removeItem(LEADERBOARD_STORAGE_KEY)
    localStorage.removeItem(MANUAL_RANKINGS_STORAGE_KEY)
    syncKeyToSupabase(LEADERBOARD_STORAGE_KEY, JSON.stringify([]))
    syncKeyToSupabase(MANUAL_RANKINGS_STORAGE_KEY, JSON.stringify({}))
    return { success: true }
  } catch (error) {
    console.error('clearAllLeaderboards failed', error)
    return { success: false, message: '清空失敗' }
  }
}
