// 稱號配置存儲工具
import { syncKeyToSupabase } from './supabaseSync'
const TITLE_CONFIG_STORAGE_KEY = 'jiameng_title_config'

// 獲取稱號配置
export const getTitleConfig = () => {
  try {
    const config = localStorage.getItem(TITLE_CONFIG_STORAGE_KEY)
    if (config) {
      return JSON.parse(config)
    }
    // 返回默認配置
    return {
      firstPlace: '🏆 冠軍',
      secondPlace: '🥈 亞軍',
      thirdPlace: '🥉 季軍'
    }
  } catch (error) {
    console.error('Error getting title config:', error)
    return {
      firstPlace: '🏆 冠軍',
      secondPlace: '🥈 亞軍',
      thirdPlace: '🥉 季軍'
    }
  }
}

// 保存稱號配置
export const saveTitleConfig = (config) => {
  try {
    const val = JSON.stringify(config)
    localStorage.setItem(TITLE_CONFIG_STORAGE_KEY, val)
    syncKeyToSupabase(TITLE_CONFIG_STORAGE_KEY, val)
    return { success: true }
  } catch (error) {
    console.error('Error saving title config:', error)
    return { success: false, message: '保存失敗' }
  }
}

// 更新稱號配置
export const updateTitleConfig = (updates) => {
  try {
    const config = getTitleConfig()
    const newConfig = { ...config, ...updates }
    return saveTitleConfig(newConfig)
  } catch (error) {
    console.error('Error updating title config:', error)
    return { success: false, message: '更新失敗' }
  }
}
