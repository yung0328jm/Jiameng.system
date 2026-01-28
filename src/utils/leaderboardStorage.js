// 排行榜項目存儲工具
import { syncKeyToSupabase } from './supabaseSync'
const LEADERBOARD_STORAGE_KEY = 'jiameng_leaderboard_items'
const LEADERBOARD_UI_STORAGE_KEY = 'jiameng_leaderboard_ui'

// 獲取所有排行榜項目
export const getLeaderboardItems = () => {
  try {
    const items = localStorage.getItem(LEADERBOARD_STORAGE_KEY)
    return items ? JSON.parse(items) : []
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
export const deleteLeaderboardItem = (id) => {
  try {
    const items = getLeaderboardItems()
    const filtered = items.filter(item => item.id !== id)
    saveLeaderboardItems(filtered)
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
const MANUAL_RANKINGS_STORAGE_KEY = 'jiameng_manual_rankings'

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
