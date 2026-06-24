// 遲到績效評分配置存儲工具
import { syncKeyToSupabase } from './supabaseSync'
const LATE_PERFORMANCE_CONFIG_KEY = 'jiameng_late_performance_config'

// 預設規則（按遲到次數扣分）
const DEFAULT_RULES = [
  { id: '1', minCount: 0, maxCount: 0, adjustment: 0, label: '0次' },
  { id: '2', minCount: 1, maxCount: 3, adjustment: -2, label: '1-3次' },
  { id: '3', minCount: 4, maxCount: 6, adjustment: -5, label: '4-6次' },
  { id: '4', minCount: 7, maxCount: 10, adjustment: -8, label: '7-10次' },
  { id: '5', minCount: 11, maxCount: null, adjustment: -12, label: '≥11次' }
]

// 獲取遲到績效評分配置
export const getLatePerformanceConfig = () => {
  try {
    const config = localStorage.getItem(LATE_PERFORMANCE_CONFIG_KEY)
    if (config) {
      const parsed = JSON.parse(config)
      // 兼容舊格式，如果沒有新格式的字段，使用預設值
      if (parsed.latePenaltyPerTime === undefined) {
        parsed.latePenaltyPerTime = -2 // 預設遲到一次扣2分
      }
      if (parsed.noClockInPenaltyPerTime === undefined) {
        parsed.noClockInPenaltyPerTime = -2 // 預設未打卡一次扣2分
      }
      return parsed
    }
    return {
      rules: DEFAULT_RULES,
      type: 'count', // 'count' 按次數, 'minutes' 按分鐘數
      enabled: true,
      latePenaltyPerTime: -2, // 遲到一次扣幾分（負數）
      noClockInPenaltyPerTime: -2 // 未打卡一次扣幾分（負數）
    }
  } catch (error) {
    console.error('Error getting late performance config:', error)
    return {
      rules: DEFAULT_RULES,
      type: 'count',
      enabled: true,
      latePenaltyPerTime: -2,
      noClockInPenaltyPerTime: -2
    }
  }
}

// 保存遲到績效評分配置
export const saveLatePerformanceConfig = (config) => {
  try {
    const configToSave = {
      ...config,
      updatedAt: new Date().toISOString()
    }
    const val = JSON.stringify(configToSave)
    localStorage.setItem(LATE_PERFORMANCE_CONFIG_KEY, val)
    syncKeyToSupabase(LATE_PERFORMANCE_CONFIG_KEY, val)
    return { success: true }
  } catch (error) {
    console.error('Error saving late performance config:', error)
    return { success: false, message: '保存失敗' }
  }
}

// 根據遲到次數計算調整分數（簡化為固定扣分）
export const calculateLateCountAdjustment = (lateCount) => {
  const config = getLatePerformanceConfig()
  if (!config.enabled) return 0
  
  // 使用固定扣分：遲到次數 × 每次扣分
  const penaltyPerTime = config.latePenaltyPerTime || -2
  const result = lateCount * penaltyPerTime
  // 處理浮點數精度問題，保留最多2位小數
  return Math.round(result * 100) / 100
}

// 根據未打卡次數計算調整分數（簡化為固定扣分）
export const calculateNoClockInAdjustment = (noClockInCount) => {
  const config = getLatePerformanceConfig()
  if (!config.enabled) return 0
  
  // 使用固定扣分：未打卡次數 × 每次扣分
  const penaltyPerTime = config.noClockInPenaltyPerTime || -2
  const result = noClockInCount * penaltyPerTime
  // 處理浮點數精度問題，保留最多2位小數
  return Math.round(result * 100) / 100
}

// 根據遲到分鐘數計算調整分數
export const calculateLateMinutesAdjustment = (totalLateMinutes) => {
  const config = getLatePerformanceConfig()
  if (!config.enabled) return 0
  
  if (config.type === 'minutes') {
    const rules = config.rules || []
    // 按 minMinutes 降序排序
    const sortedRules = [...rules].sort((a, b) => (b.minMinutes || 0) - (a.minMinutes || 0))
    
    for (const rule of sortedRules) {
      const min = rule.minMinutes || 0
      const max = rule.maxMinutes
      
      if (totalLateMinutes >= min && (max === null || totalLateMinutes <= max)) {
        return rule.adjustment || 0
      }
    }
  }
  
  return 0
}
