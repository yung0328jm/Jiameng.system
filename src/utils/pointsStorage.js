// 佳盟分存儲與佳盟幣↔佳盟分兌換比例
import { syncKeyToSupabase } from './supabaseSync'

const POINTS_STORAGE_KEY = 'jiameng_points'
const EXCHANGE_CONFIG_KEY = 'jiameng_coin_points_exchange'

const defaultExchangeConfig = {
  coinToPoints: 10,   // 1 佳盟幣 = 10 佳盟分
  pointsToCoin: 0.1   // 1 佳盟分 = 0.1 佳盟幣（可設為 1/coinToPoints）
}

const persistPoints = (points) => {
  const val = JSON.stringify(points || {})
  localStorage.setItem(POINTS_STORAGE_KEY, val)
  syncKeyToSupabase(POINTS_STORAGE_KEY, val)
}

// 取得兌換比例設定
export const getExchangeConfig = () => {
  try {
    const raw = localStorage.getItem(EXCHANGE_CONFIG_KEY)
    if (!raw) return { ...defaultExchangeConfig }
    const parsed = JSON.parse(raw)
    return {
      coinToPoints: Number(parsed.coinToPoints) || defaultExchangeConfig.coinToPoints,
      pointsToCoin: Number(parsed.pointsToCoin) || defaultExchangeConfig.pointsToCoin
    }
  } catch (_) {
    return { ...defaultExchangeConfig }
  }
}

// 儲存兌換比例（管理員）
export const saveExchangeConfig = (config) => {
  try {
    const next = {
      coinToPoints: Math.max(0.0001, Number(config.coinToPoints) || 1),
      pointsToCoin: Math.max(0.0001, Number(config.pointsToCoin) || 0.1)
    }
    const val = JSON.stringify(next)
    localStorage.setItem(EXCHANGE_CONFIG_KEY, val)
    syncKeyToSupabase(EXCHANGE_CONFIG_KEY, val)
    return { success: true, data: next }
  } catch (e) {
    return { success: false, message: e?.message || '保存失敗' }
  }
}

// 取得用戶佳盟分餘額
export const getPointsBalance = (username) => {
  try {
    const data = localStorage.getItem(POINTS_STORAGE_KEY)
    const points = data ? JSON.parse(data) : {}
    return points[username] || 0
  } catch (_) {
    return 0
  }
}

// 設定用戶佳盟分餘額
export const setPointsBalance = (username, balance) => {
  try {
    const data = localStorage.getItem(POINTS_STORAGE_KEY)
    const points = data ? JSON.parse(data) : {}
    points[username] = Math.max(0, balance)
    persistPoints(points)
    return { success: true }
  } catch (e) {
    return { success: false, message: '設置佳盟分失敗' }
  }
}

// 增加佳盟分
export const addPointsBalance = (username, amount) => {
  if (amount < 0) return { success: false, message: '數量必須為正' }
  const current = getPointsBalance(username)
  return setPointsBalance(username, current + amount)
}

// 減少佳盟分
export const subtractPointsBalance = (username, amount) => {
  if (amount < 0) return { success: false, message: '數量必須為正' }
  const current = getPointsBalance(username)
  if (current < amount) return { success: false, message: '佳盟分不足' }
  return setPointsBalance(username, current - amount)
}
