// 公佈欄存儲工具
import { syncKeyToSupabase } from './supabaseSync'
const ANNOUNCEMENT_STORAGE_KEY = 'jiameng_announcements'

// 獲取所有公佈欄項目
export const getAnnouncements = () => {
  try {
    const announcements = localStorage.getItem(ANNOUNCEMENT_STORAGE_KEY)
    return announcements ? JSON.parse(announcements) : []
  } catch (error) {
    console.error('Error getting announcements:', error)
    return []
  }
}

// 保存公佈欄項目（會等待同步至雲端，確保重新整理後能拿到最新資料）
export const saveAnnouncements = async (announcements) => {
  try {
    const val = JSON.stringify(announcements)
    localStorage.setItem(ANNOUNCEMENT_STORAGE_KEY, val)
    await syncKeyToSupabase(ANNOUNCEMENT_STORAGE_KEY, val)
    return { success: true }
  } catch (error) {
    console.error('Error saving announcements:', error)
    return { success: false, message: error?.message || '保存失敗' }
  }
}

// 新增公佈欄項目
export const addAnnouncement = async (announcement) => {
  try {
    const announcements = getAnnouncements()
    const newAnnouncement = {
      id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
      title: announcement.title || '',
      content: announcement.content || '',
      createdAt: new Date().toISOString(),
      createdBy: announcement.createdBy || '',
      priority: announcement.priority || 'normal', // normal, high, urgent
      ...announcement
    }
    announcements.unshift(newAnnouncement) // 最新的在前面
    const res = await saveAnnouncements(announcements)
    return res.success ? { success: true, announcement: newAnnouncement } : res
  } catch (error) {
    console.error('Error adding announcement:', error)
    return { success: false, message: '新增失敗' }
  }
}

// 更新公佈欄項目
export const updateAnnouncement = async (id, updates) => {
  try {
    const announcements = getAnnouncements()
    const index = announcements.findIndex(a => a.id === id)
    if (index === -1) {
      return { success: false, message: '找不到公佈欄項目' }
    }
    announcements[index] = { ...announcements[index], ...updates }
    return await saveAnnouncements(announcements)
  } catch (error) {
    console.error('Error updating announcement:', error)
    return { success: false, message: '更新失敗' }
  }
}

// 刪除公佈欄項目
export const deleteAnnouncement = async (id) => {
  try {
    const announcements = getAnnouncements()
    const filtered = announcements.filter(a => a.id !== id)
    return await saveAnnouncements(filtered)
  } catch (error) {
    console.error('Error deleting announcement:', error)
    return { success: false, message: '刪除失敗' }
  }
}
