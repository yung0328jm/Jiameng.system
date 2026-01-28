// 公司活動篩選標籤存儲工具
import { syncKeyToSupabase } from './supabaseSync'
const ACTIVITY_FILTER_TAGS_STORAGE_KEY = 'jiameng_activity_filter_tags'

// 默認標籤配置
const DEFAULT_TAGS = [
  { id: 'all', label: '全部', imageUrl: '' },
  { id: 'planning', label: '規劃中', imageUrl: '' },
  { id: 'in-progress', label: '進行中', imageUrl: '' },
  { id: 'completed', label: '已完成', imageUrl: '' }
]

// 獲取所有篩選標籤
export const getActivityFilterTags = () => {
  try {
    const tags = localStorage.getItem(ACTIVITY_FILTER_TAGS_STORAGE_KEY)
    return tags ? JSON.parse(tags) : DEFAULT_TAGS
  } catch (error) {
    console.error('Error getting activity filter tags:', error)
    return DEFAULT_TAGS
  }
}

// 保存篩選標籤列表
export const saveActivityFilterTags = (tags) => {
  try {
    const val = JSON.stringify(tags)
    localStorage.setItem(ACTIVITY_FILTER_TAGS_STORAGE_KEY, val)
    syncKeyToSupabase(ACTIVITY_FILTER_TAGS_STORAGE_KEY, val)
    return { success: true }
  } catch (error) {
    console.error('Error saving activity filter tags:', error)
    return { success: false, message: '保存失敗' }
  }
}

// 更新單個標籤
export const updateActivityFilterTag = (id, updates) => {
  try {
    const tags = getActivityFilterTags()
    const index = tags.findIndex(tag => tag.id === id)
    if (index === -1) {
      return { success: false, message: '標籤不存在' }
    }
    tags[index] = { ...tags[index], ...updates }
    saveActivityFilterTags(tags)
    return { success: true }
  } catch (error) {
    console.error('Error updating activity filter tag:', error)
    return { success: false, message: '更新失敗' }
  }
}
