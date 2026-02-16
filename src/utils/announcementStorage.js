// 公佈欄存儲工具
import { syncKeyToSupabase, fetchAnnouncementsFromSupabase } from './supabaseSync'
const ANNOUNCEMENT_STORAGE_KEY = 'jiameng_announcements'

const announcementTime = (a) => Math.max(
  Date.parse(a?.updatedAt || '') || 0,
  Date.parse(a?.createdAt || '') || 0
)

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

// 保存公佈欄項目：先與雲端合併再寫入，避免其他裝置的舊資料覆蓋新資料（資料回朔）
export const saveAnnouncements = async (announcements) => {
  try {
    const serverList = await fetchAnnouncementsFromSupabase()
    const byId = new Map()
    const add = (list) => {
      (Array.isArray(list) ? list : []).forEach((a) => {
        const id = String(a?.id || '').trim()
        if (!id) return
        const prev = byId.get(id)
        if (!prev) { byId.set(id, a); return }
        byId.set(id, announcementTime(a) >= announcementTime(prev) ? a : prev)
      })
    }
    add(serverList)
    add(announcements)
    const merged = Array.from(byId.values()).sort(
      (x, y) => announcementTime(y) - announcementTime(x)
    )
    const val = JSON.stringify(merged)
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
