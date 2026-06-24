// 公司活動存儲工具
import { syncKeyToSupabase } from './supabaseSync'
const COMPANY_ACTIVITY_STORAGE_KEY = 'jiameng_company_activities'

// 獲取所有公司活動（含待審核，供管理員使用）
export const getCompanyActivities = () => {
  try {
    const activities = localStorage.getItem(COMPANY_ACTIVITY_STORAGE_KEY)
    const list = activities ? JSON.parse(activities) : []
    // 確保每個活動有 signups 陣列，舊資料無 approvalStatus 視為已通過
    return list.map(a => ({
      ...a,
      signups: a.signups || [],
      approvalStatus: a.approvalStatus ?? 'approved',
      createdBy: a.createdBy ?? ''
    }))
  } catch (error) {
    console.error('Error getting company activities:', error)
    return []
  }
}

// 依角色取得顯示用活動：一般用戶只看已審核通過的，管理員看全部
export const getCompanyActivitiesForDisplay = (role) => {
  const list = getCompanyActivities()
  if (role === 'admin') return list
  return list.filter(a => (a.approvalStatus ?? 'approved') === 'approved')
}

// 待審核活動數量（管理員未讀提醒用）
export const getPendingActivitiesCount = () => {
  return getCompanyActivities().filter(a => (a.approvalStatus ?? 'approved') === 'pending').length
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

// 添加公司活動。options: { isAdmin, createdBy }；非管理員新增時 approvalStatus 為 pending
export const addCompanyActivity = (activity, options = {}) => {
  try {
    const activities = getCompanyActivities()
    const isAdmin = options.isAdmin === true
    const createdBy = String(options.createdBy || '').trim()
    const newActivity = {
      ...activity,
      id: activity.id || Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
      signups: activity.signups || [],
      createdAt: activity.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy,
      approvalStatus: isAdmin ? 'approved' : 'pending'
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

// 管理員審核通過
export const approveCompanyActivity = (id) => {
  return updateCompanyActivity(id, { approvalStatus: 'approved' })
}

// 管理員拒絕（刪除或改為拒絕狀態；此處改為刪除待審活動，避免列表堆積）
export const rejectCompanyActivity = (id) => {
  return deleteCompanyActivity(id)
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
