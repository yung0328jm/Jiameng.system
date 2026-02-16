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

const ANNOUNCEMENT_LAST_WRITE_KEY = 'jiameng_announcements_last_write'
const ANNOUNCEMENT_GUARD_MS = 5000

// 保存公佈欄項目：先同步雲端再寫入本機，避免多人同時在線時本機寫入後被輪詢舊資料蓋回
export const saveAnnouncements = async (announcements) => {
  try {
    const list = Array.isArray(announcements) ? announcements : []
    const val = JSON.stringify(list)
    await syncKeyToSupabase(ANNOUNCEMENT_STORAGE_KEY, val)
    localStorage.setItem(ANNOUNCEMENT_STORAGE_KEY, val)
    try {
      localStorage.setItem(ANNOUNCEMENT_LAST_WRITE_KEY, String(Date.now()))
      setTimeout(() => {
        try { localStorage.removeItem(ANNOUNCEMENT_LAST_WRITE_KEY) } catch (_) {}
      }, ANNOUNCEMENT_GUARD_MS)
    } catch (_) {}
    return { success: true, data: list }
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
    return res.success ? { success: true, announcement: newAnnouncement, data: res.data } : res
  } catch (error) {
    console.error('Error adding announcement:', error)
    return { success: false, message: '新增失敗' }
  }
}

// 更新公佈欄項目（寫入 updatedAt 供多裝置合併時以較新者為準）
export const updateAnnouncement = async (id, updates) => {
  try {
    const announcements = getAnnouncements()
    const index = announcements.findIndex(a => a.id === id)
    if (index === -1) {
      return { success: false, message: '找不到公佈欄項目' }
    }
    announcements[index] = {
      ...announcements[index],
      ...updates,
      updatedAt: new Date().toISOString()
    }
    const res = await saveAnnouncements(announcements)
    return res.success ? { ...res, data: res.data } : res
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
    const res = await saveAnnouncements(filtered)
    return res.success ? { ...res, data: res.data } : res
  } catch (error) {
    console.error('Error deleting announcement:', error)
    return { success: false, message: '刪除失敗' }
  }
}
