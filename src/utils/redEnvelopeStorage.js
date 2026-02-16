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

/** 取得所有用戶的已領取紀錄 { account: totalClaimed } */
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

/** 某用戶目前已搶次數（依次數計，每次搶隨機發一種道具） */
export const getRedEnvelopeClaimedCount = (account) => {
  const acc = String(account || '').trim()
  if (!acc) return 0
  const claims = getRedEnvelopeClaims()
  const n = Number(claims[acc])
  return Number.isNaN(n) ? 0 : Math.max(0, Math.floor(n))
}

/** 搶紅包：若未達上限則從已選道具中隨機抽一種發放 */
export const grabRedEnvelope = (account) => {
  const acc = String(account || '').trim()
  if (!acc) return { success: false, message: '請先登入' }

  const config = getRedEnvelopeConfig()
  const ids = Array.isArray(config.itemIds) ? config.itemIds.filter(Boolean) : []
  if (ids.length === 0) return { success: false, message: '管理員尚未設定紅包卡道具' }
  if (config.maxPerUser <= 0) return { success: false, message: '搶紅包活動尚未開放' }

  const claimed = getRedEnvelopeClaimedCount(acc)
  if (claimed >= config.maxPerUser) {
    return { success: false, message: `已達本活動上限（${config.maxPerUser} 次），下次請早` }
  }

  const minQty = config.minQtyPerGrab
  const maxQty = config.maxQtyPerGrab
  const qty = minQty >= maxQty ? minQty : minQty + Math.floor(Math.random() * (maxQty - minQty + 1))
  const itemId = ids[Math.floor(Math.random() * ids.length)]

  const res = addItemToInventory(acc, itemId, qty)
  if (!res.success) return { success: false, message: res.message || '發放失敗' }

  const claims = getRedEnvelopeClaims()
  claims[acc] = (Number(claims[acc]) || 0) + 1
  persistClaims(claims)

  return { success: true, message: `恭喜獲得 ${qty} 個紅包卡！`, quantity: qty, itemId }
}
