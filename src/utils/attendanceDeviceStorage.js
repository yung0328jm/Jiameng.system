// 刷卡機設備配置存儲工具
import { syncKeyToSupabase } from './supabaseSync'
const ATTENDANCE_DEVICE_CONFIG_KEY = 'jiameng_attendance_device_config'

// 預設配置
const DEFAULT_CONFIG = {
  enabled: false,
  deviceIP: '',
  devicePort: '80',
  apiEndpoint: '/api/attendance', // 刷卡機API端點
  pollingInterval: 30, // 輪詢間隔（秒）
  workStartTime: '08:00',
  lastFetchTime: null, // 最後獲取時間
  lastRecordId: null // 最後處理的記錄ID（用於增量獲取）
}

// 獲取設備配置
export const getDeviceConfig = () => {
  try {
    const config = localStorage.getItem(ATTENDANCE_DEVICE_CONFIG_KEY)
    if (config) {
      return JSON.parse(config)
    }
    return DEFAULT_CONFIG
  } catch (error) {
    console.error('Error getting device config:', error)
    return DEFAULT_CONFIG
  }
}

// 保存設備配置
export const saveDeviceConfig = (config) => {
  try {
    const fullConfig = {
      ...DEFAULT_CONFIG,
      ...config,
      updatedAt: new Date().toISOString()
    }
    const val = JSON.stringify(fullConfig)
    localStorage.setItem(ATTENDANCE_DEVICE_CONFIG_KEY, val)
    syncKeyToSupabase(ATTENDANCE_DEVICE_CONFIG_KEY, val)
    return { success: true }
  } catch (error) {
    console.error('Error saving device config:', error)
    return { success: false, message: '保存失敗' }
  }
}

// 更新最後獲取時間和記錄ID
export const updateLastFetchInfo = (lastFetchTime, lastRecordId) => {
  try {
    const config = getDeviceConfig()
    config.lastFetchTime = lastFetchTime
    config.lastRecordId = lastRecordId
    return saveDeviceConfig(config)
  } catch (error) {
    console.error('Error updating last fetch info:', error)
    return { success: false }
  }
}
