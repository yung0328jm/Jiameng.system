// 搶紅包：設定紅包卡道具、每用戶上限，並記錄每人已領取數量
import { syncKeyToSupabase } from './supabaseSync'
import { addItemToInventory } from './inventoryStorage'

const CONFIG_KEY = 'jiameng_red_envelope_config'
const CLAIMS_KEY = 'jiameng_red_envelope_claims'

const safeParse = (raw, fallback) => {
  try {
    const v = raw ? JSON.parse(raw) : fallback
    return v ?? fallback
  } catch (_) {
    return fallback
  }
}

const defaultConfig = () => ({
  itemIds: [],          // 紅包卡道具 ID 陣列（可多選，發放時隨機抽一種）
  maxPerUser: 0,        // 每用戶最多可搶次數（0 = 關閉活動）
  minQtyPerGrab: 1,     // 每次搶紅包最少數量
  maxQtyPerGrab: 1      // 每次搶紅包最多數量
})

const normalizeItemIds = (val) => {
  if (Array.isArray(val)) return val.map((id) => String(id || '').trim()).filter(Boolean)
  if (val != null && val !== '') return [String(val).trim()]
  return []
}

/** 取得搶紅包設定 */
export const getRedEnvelopeConfig = () => {
  const raw = localStorage.getItem(CONFIG_KEY)
  const obj = safeParse(raw, null)
  if (!obj || typeof obj !== 'object') return defaultConfig()
  // 相容舊版單一 itemId
  const itemIds = Array.isArray(obj.itemIds) ? obj.itemIds : normalizeItemIds(obj.itemId)
  return {
    ...defaultConfig(),
    itemIds: itemIds.map((id) => String(id).trim()).filter(Boolean),
    maxPerUser: Math.max(0, Math.floor(Number(obj.maxPerUser) || 0)),
    minQtyPerGrab: Math.max(1, Math.floor(Number(obj.minQtyPerGrab) || 1)),
    maxQtyPerGrab: Math.max(1, Math.floor(Number(obj.maxQtyPerGrab) || 1))
  }
}

/** 儲存搶紅包設定（管理員） */
export const saveRedEnvelopeConfig = (config) => {
  const next = {
    ...defaultConfig(),
    itemIds: normalizeItemIds(config?.itemIds ?? config?.itemId),
    maxPerUser: Math.max(0, Math.floor(Number(config?.maxPerUser) ?? 0)),
    minQtyPerGrab: Math.max(1, Math.floor(Number(config?.minQtyPerGrab) ?? 1)),
    maxQtyPerGrab: Math.max(1, Math.floor(Number(config?.maxQtyPerGrab) ?? 1))
  }
  const val = JSON.stringify(next)
  localStorage.setItem(CONFIG_KEY, val)
  syncKeyToSupabase(CONFIG_KEY, val)
  return { success: true, config: next }
}

/** 取得今日日期字串 YYYY-MM-DD（本地） */
const getTodayDateString = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 取得所有用戶的已領取紀錄 { account: lastClaimDate } 或舊版 { account: number } */
export const getRedEnvelopeClaims = () => {
  const raw = localStorage.getItem(CLAIMS_KEY)
  const obj = safeParse(raw, {})
  return obj && typeof obj === 'object' ? obj : {}
}

const persistClaims = (claims) => {
  const val = JSON.stringify(claims || {})
  localStorage.setItem(CLAIMS_KEY, val)
  syncKeyToSupabase(CLAIMS_KEY, val)
}

/** 某用戶今日是否已搶過（一天只能搶一次）；舊版為數字則視為無日期、允許今日再領一次並寫入日期 */
export const hasRedEnvelopeClaimedToday = (account) => {
  const acc = String(account || '').trim()
  if (!acc) return false
  const claims = getRedEnvelopeClaims()
  const v = claims[acc]
  const today = getTodayDateString()
  if (v == null || v === '') return false
  if (typeof v === 'number') return false
  return String(v) === today
}

/** 某用戶今日已搶次數（0 或 1，供 UI 顯示「已領 1/1」） */
export const getRedEnvelopeClaimedCount = (account) => {
  return hasRedEnvelopeClaimedToday(account) ? 1 : 0
}

/** 搶紅包：一天只能搶一次，從已選道具中隨機抽一種發放 */
export const grabRedEnvelope = (account) => {
  const acc = String(account || '').trim()
  if (!acc) return { success: false, message: '請先登入' }

  const config = getRedEnvelopeConfig()
  const ids = Array.isArray(config.itemIds) ? config.itemIds.filter(Boolean) : []
  if (ids.length === 0) return { success: false, message: '管理員尚未設定紅包卡道具' }
  if (config.maxPerUser <= 0) return { success: false, message: '搶紅包活動尚未開放' }

  if (hasRedEnvelopeClaimedToday(acc)) {
    return { success: false, message: '今日已搶過，明天再來～' }
  }

  const minQty = config.minQtyPerGrab
  const maxQty = config.maxQtyPerGrab
  const qty = minQty >= maxQty ? minQty : minQty + Math.floor(Math.random() * (maxQty - minQty + 1))
  const itemId = ids[Math.floor(Math.random() * ids.length)]

  const res = addItemToInventory(acc, itemId, qty)
  if (!res.success) return { success: false, message: res.message || '發放失敗' }

  const claims = getRedEnvelopeClaims()
  claims[acc] = getTodayDateString()
  persistClaims(claims)

  return { success: true, message: `恭喜獲得 ${qty} 個紅包卡！`, quantity: qty, itemId }
}
