// 測試記錄存儲工具
import { syncKeyToSupabase } from './supabaseSync'
const TEST_RECORD_STORAGE_KEY = 'jiameng_leaderboard_test_records'

// 獲取所有測試記錄
export const getAllTestRecords = () => {
  try {
    const records = localStorage.getItem(TEST_RECORD_STORAGE_KEY)
    return records ? JSON.parse(records) : {}
  } catch (error) {
    console.error('Error getting test records:', error)
    return {}
  }
}

// 獲取特定排行榜項目的測試記錄
export const getTestRecords = (leaderboardItemId) => {
  try {
    const allRecords = getAllTestRecords()
    return allRecords[leaderboardItemId] || []
  } catch (error) {
    console.error('Error getting test records:', error)
    return []
  }
}

// 保存測試記錄
export const saveTestRecords = (leaderboardItemId, records) => {
  try {
    const allRecords = getAllTestRecords()
    allRecords[leaderboardItemId] = records
    const val = JSON.stringify(allRecords)
    localStorage.setItem(TEST_RECORD_STORAGE_KEY, val)
    syncKeyToSupabase(TEST_RECORD_STORAGE_KEY, val)
    return { success: true }
  } catch (error) {
    console.error('Error saving test records:', error)
    return { success: false, message: '保存失敗' }
  }
}

// 添加測試記錄
export const addTestRecord = (leaderboardItemId, rankings) => {
  try {
    const records = getTestRecords(leaderboardItemId)
    const newRecord = {
      id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
      testDate: new Date().toISOString(),
      rankings: rankings.map(r => ({
        rank: r.rank,
        name: r.name,
        time: r.time || '',
        quantity: r.quantity || ''
      })),
      createdAt: new Date().toISOString()
    }
    records.push(newRecord)
    // 按測試日期降序排列（最新的在前）
    records.sort((a, b) => new Date(b.testDate) - new Date(a.testDate))
    saveTestRecords(leaderboardItemId, records)
    return { success: true, record: newRecord }
  } catch (error) {
    console.error('Error adding test record:', error)
    return { success: false, message: '添加失敗' }
  }
}

// 刪除測試記錄
export const deleteTestRecord = (leaderboardItemId, recordId) => {
  try {
    const records = getTestRecords(leaderboardItemId)
    const filtered = records.filter(r => r.id !== recordId)
    saveTestRecords(leaderboardItemId, filtered)
    return { success: true }
  } catch (error) {
    console.error('Error deleting test record:', error)
    return { success: false, message: '刪除失敗' }
  }
}
