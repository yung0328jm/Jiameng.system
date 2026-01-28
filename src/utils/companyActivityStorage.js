// 公司活動存儲工具
import { syncKeyToSupabase } from './supabaseSync'
const COMPANY_ACTIVITY_STORAGE_KEY = 'jiameng_company_activities'

// 獲取所有公司活動
export const getCompanyActivities = () => {
  try {
    const activities = localStorage.getItem(COMPANY_ACTIVITY_STORAGE_KEY)
    const list = activities ? JSON.parse(activities) : []
    // 確保每個活動有 signups 陣列
    return list.map(a => ({ ...a, signups: a.signups || [] }))
  } catch (error) {
    console.error('Error getting company activities:', error)
    return []
  }
}

// 保存公司活動列表
export const saveCompanyActivities = (activities) => {
  try {
    const val = JSON.stringify(activities)
    localStorage.setItem(COMPANY_ACTIVITY_STORAGE_KEY, val)
    syncKeyToSupabase(COMPANY_ACTIVITY_STORAGE_KEY, val)
    return { success: true }
  } catch (error) {
    console.error('Error saving company activities:', error)
    return { success: false, message: '保存失敗' }
  }
}

// 添加公司活動
export const addCompanyActivity = (activity) => {
  try {
    const activities = getCompanyActivities()
    const newActivity = {
      ...activity,
      id: activity.id || Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
      signups: activity.signups || [],
      createdAt: activity.createdAt || new Date().toISOString()
    }
    activities.push(newActivity)
    saveCompanyActivities(activities)
    return { success: true, activity: newActivity }
  } catch (error) {
    console.error('Error adding company activity:', error)
    return { success: false, message: '添加失敗' }
  }
}

// 更新公司活動
export const updateCompanyActivity = (id, updates) => {
  try {
    const activities = getCompanyActivities()
    const index = activities.findIndex(activity => activity.id === id)
    if (index === -1) {
      return { success: false, message: '活動不存在' }
    }
    const next = { ...activities[index], ...updates, updatedAt: new Date().toISOString() }
    if (!Array.isArray(next.signups)) next.signups = activities[index].signups || []
    activities[index] = next
    saveCompanyActivities(activities)
    return { success: true }
  } catch (error) {
    console.error('Error updating company activity:', error)
    return { success: false, message: '更新失敗' }
  }
}

// 刪除公司活動
export const deleteCompanyActivity = (id) => {
  try {
    const activities = getCompanyActivities()
    const filtered = activities.filter(activity => activity.id !== id)
    saveCompanyActivities(filtered)
    return { success: true }
  } catch (error) {
    console.error('Error deleting company activity:', error)
    return { success: false, message: '刪除失敗' }
  }
}

// 報名參加活動 { username, includeFamily, familyCount }
export const signUpForActivity = (activityId, payload) => {
  try {
    const activities = getCompanyActivities()
    const index = activities.findIndex(a => a.id === activityId)
    if (index === -1) return { success: false, message: '活動不存在' }
    const activity = activities[index]
    const signups = activity.signups || []
    if (signups.some(s => s.username === payload.username)) {
      return { success: false, message: '您已報名過此活動' }
    }
    signups.push({
      username: payload.username,
      includeFamily: !!payload.includeFamily,
      familyCount: Math.max(0, parseInt(payload.familyCount, 10) || 0),
      signedUpAt: new Date().toISOString()
    })
    activities[index] = { ...activity, signups }
    saveCompanyActivities(activities)
    return { success: true }
  } catch (error) {
    console.error('Error signing up for activity:', error)
    return { success: false, message: '報名失敗' }
  }
}

// 取消報名
export const cancelSignUp = (activityId, username) => {
  try {
    const activities = getCompanyActivities()
    const index = activities.findIndex(a => a.id === activityId)
    if (index === -1) return { success: false, message: '活動不存在' }
    const activity = activities[index]
    const signups = (activity.signups || []).filter(s => s.username !== username)
    activities[index] = { ...activity, signups }
    saveCompanyActivities(activities)
    return { success: true }
  } catch (error) {
    console.error('Error canceling sign up:', error)
    return { success: false, message: '取消報名失敗' }
  }
}
