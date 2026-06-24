// 達成率調整規則配置存儲工具
import { syncKeyToSupabase } from './supabaseSync'
const COMPLETION_RATE_CONFIG_KEY = 'jiameng_completion_rate_config'

// 預設規則
const DEFAULT_RULES = [
  { id: '1', minRate: 100, maxRate: null, adjustment: 5, label: '≥100%' },
  { id: '2', minRate: 90, maxRate: 100, adjustment: 3, label: '90-100%' },
  { id: '3', minRate: 80, maxRate: 90, adjustment: 0, label: '80-90%' },
  { id: '4', minRate: 70, maxRate: 80, adjustment: -3, label: '70-80%' },
  { id: '5', minRate: 60, maxRate: 70, adjustment: -5, label: '60-70%' },
  { id: '6', minRate: 0, maxRate: 60, adjustment: -10, label: '<60%' }
]

// 獲取達成率調整規則
export const getCompletionRateRules = () => {
  try {
    const config = localStorage.getItem(COMPLETION_RATE_CONFIG_KEY)
    if (config) {
      const parsed = JSON.parse(config)
      return parsed.rules && parsed.rules.length > 0 ? parsed.rules : DEFAULT_RULES
    }
    return DEFAULT_RULES
  } catch (error) {
    console.error('Error getting completion rate rules:', error)
    return DEFAULT_RULES
  }
}

// 保存達成率調整規則
export const saveCompletionRateRules = (rules) => {
  try {
    const config = {
      rules: rules,
      updatedAt: new Date().toISOString()
    }
    const val = JSON.stringify(config)
    localStorage.setItem(COMPLETION_RATE_CONFIG_KEY, val)
    syncKeyToSupabase(COMPLETION_RATE_CONFIG_KEY, val)
    return { success: true }
  } catch (error) {
    console.error('Error saving completion rate rules:', error)
    return { success: false, message: '保存失敗' }
  }
}

// 根據完成率計算單條加減分（使用配置的規則）；區間為 min <= rate <= max（含邊界）
export const calculateCompletionRateAdjustment = (averageCompletionRate) => {
  const rules = getCompletionRateRules()
  // 按 minRate 降序排序（優先匹配較高的完成率，例如 ≥100% 先於 90-100%）
  const sortedRules = [...rules].sort((a, b) => (b.minRate || 0) - (a.minRate || 0))
  
  for (const rule of sortedRules) {
    const min = rule.minRate || 0
    const max = rule.maxRate
    
    // 90-100% 表示 90 <= rate <= 100（含 100）；≥100% 用 max === null 表示無上限
    if (averageCompletionRate >= min && (max === null || averageCompletionRate <= max)) {
      const adj = rule.adjustment
      return typeof adj === 'number' && !Number.isNaN(adj) ? adj : (parseFloat(adj) || 0)
    }
  }
  
  return 0
}
