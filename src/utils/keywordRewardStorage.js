import { syncKeyToSupabase } from './supabaseSync'

const RULES_KEY = 'jiameng_keyword_reward_rules'
const CLAIMS_KEY = 'jiameng_keyword_reward_claims'

const safeParse = (raw, fallback) => {
  try {
    const v = raw ? JSON.parse(raw) : fallback
    return v ?? fallback
  } catch (_) {
    return fallback
  }
}

const persist = (key, data) => {
  const val = JSON.stringify(data)
  localStorage.setItem(key, val)
  syncKeyToSupabase(key, val)
}

export const getKeywordRewardRules = () => {
  const list = safeParse(localStorage.getItem(RULES_KEY), [])
  return Array.isArray(list) ? list : []
}

export const saveKeywordRewardRules = (rules) => {
  persist(RULES_KEY, Array.isArray(rules) ? rules : [])
}

export const addKeywordRewardRule = (rule) => {
  const list = getKeywordRewardRules()
  const item = {
    id: rule?.id || `kwr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    keyword: String(rule?.keyword || '').trim(),
    match: rule?.match === 'equals' ? 'equals' : 'includes', // includes | equals
    ignoreCase: rule?.ignoreCase !== false, // default true
    rewardType: rule?.rewardType === 'coin' ? 'coin' : 'item', // item | coin
    itemId: String(rule?.itemId || '').trim(),
    quantity: Math.max(1, Math.floor(Number(rule?.quantity) || 1)),
    coinAmount: Math.max(1, Math.floor(Number(rule?.coinAmount) || 1)),
    cooldownSec: Math.max(0, Math.floor(Number(rule?.cooldownSec) || 0)),
    // 防刷：每人每天最多可領取次數（0 = 不限制）
    dailyLimit: Math.max(0, Math.floor(Number(rule?.dailyLimit) || 0)),
    enabled: rule?.enabled !== false,
    createdAt: new Date().toISOString()
  }
  list.push(item)
  saveKeywordRewardRules(list)
  return { success: true, item }
}

export const updateKeywordRewardRule = (id, updates) => {
  const list = getKeywordRewardRules()
  const idx = list.findIndex((r) => r.id === id)
  if (idx === -1) return { success: false, message: '規則不存在' }
  const prev = list[idx] || {}
  const next = {
    ...prev,
    ...updates,
    keyword: updates?.keyword != null ? String(updates.keyword || '').trim() : prev.keyword,
    match: updates?.match === 'equals' ? 'equals' : updates?.match === 'includes' ? 'includes' : prev.match,
    ignoreCase: updates?.ignoreCase != null ? Boolean(updates.ignoreCase) : prev.ignoreCase,
    rewardType: updates?.rewardType === 'coin' ? 'coin' : updates?.rewardType === 'item' ? 'item' : prev.rewardType,
    itemId: updates?.itemId != null ? String(updates.itemId || '').trim() : prev.itemId,
    quantity: updates?.quantity != null ? Math.max(1, Math.floor(Number(updates.quantity) || 1)) : prev.quantity,
    coinAmount: updates?.coinAmount != null ? Math.max(1, Math.floor(Number(updates.coinAmount) || 1)) : prev.coinAmount,
    cooldownSec: updates?.cooldownSec != null ? Math.max(0, Math.floor(Number(updates.cooldownSec) || 0)) : prev.cooldownSec,
    dailyLimit: updates?.dailyLimit != null ? Math.max(0, Math.floor(Number(updates.dailyLimit) || 0)) : prev.dailyLimit,
    enabled: updates?.enabled != null ? Boolean(updates.enabled) : prev.enabled,
    updatedAt: new Date().toISOString()
  }
  list[idx] = next
  saveKeywordRewardRules(list)
  return { success: true, item: next }
}

export const deleteKeywordRewardRule = (id) => {
  const list = getKeywordRewardRules().filter((r) => r.id !== id)
  saveKeywordRewardRules(list)
  return { success: true }
}

export const getKeywordRewardClaims = () => {
  // 兼容舊格式：
  // - 舊：{ "<account>::<ruleId>": lastClaimAtMs }
  // - 新：{ "<account>::<ruleId>": { lastAt, day, dayCount } }
  const obj = safeParse(localStorage.getItem(CLAIMS_KEY), {})
  return obj && typeof obj === 'object' ? obj : {}
}

export const saveKeywordRewardClaims = (claims) => {
  persist(CLAIMS_KEY, claims && typeof claims === 'object' ? claims : {})
}

export const getClaimKey = (account, ruleId) => `${String(account || '').trim()}::${String(ruleId || '').trim()}`

const getLocalYMD = (ms = Date.now()) => {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const normalizeClaim = (raw, nowMs) => {
  if (raw == null) return { lastAt: 0, day: getLocalYMD(nowMs), dayCount: 0 }
  if (typeof raw === 'number') return { lastAt: Number(raw) || 0, day: getLocalYMD(nowMs), dayCount: 0 }
  if (typeof raw === 'object') {
    return {
      lastAt: Number(raw.lastAt || 0),
      day: String(raw.day || getLocalYMD(nowMs)),
      dayCount: Math.max(0, Math.floor(Number(raw.dayCount) || 0))
    }
  }
  return { lastAt: 0, day: getLocalYMD(nowMs), dayCount: 0 }
}

// 全局防刷（硬限制）
export const GLOBAL_MIN_INTERVAL_SEC = 3         // 同一人 3 秒內連發不給獎勵
export const GLOBAL_DAILY_LIMIT = 20             // 同一人每天最多獲得 20 次關鍵字獎勵
const ANY_RULE_ID = '__any__'
const DAILY_RULE_ID = '__daily__'

export const canClaimGlobalKeywordReward = (account, nowMs = Date.now(), opts = {}) => {
  const acc = String(account || '').trim()
  if (!acc) return false
  const claims = getKeywordRewardClaims()
  const today = getLocalYMD(nowMs)
  const minIntervalMs = Math.max(0, Math.floor(Number(opts.minIntervalSec ?? GLOBAL_MIN_INTERVAL_SEC))) * 1000
  const dailyLimit = Math.max(1, Math.floor(Number(opts.dailyLimit ?? GLOBAL_DAILY_LIMIT)))

  const anyKey = getClaimKey(acc, ANY_RULE_ID)
  const any = normalizeClaim(claims?.[anyKey], nowMs)
  if (minIntervalMs && (nowMs - any.lastAt) < minIntervalMs) return false

  const dayKey = getClaimKey(acc, DAILY_RULE_ID)
  const dayRec = normalizeClaim(claims?.[dayKey], nowMs)
  const dayCount = (dayRec.day === today) ? dayRec.dayCount : 0
  return dayCount < dailyLimit
}

export const markGlobalKeywordRewardClaimed = (account, nowMs = Date.now()) => {
  const acc = String(account || '').trim()
  if (!acc) return
  const claims = getKeywordRewardClaims()
  const today = getLocalYMD(nowMs)

  const anyKey = getClaimKey(acc, ANY_RULE_ID)
  const any = normalizeClaim(claims?.[anyKey], nowMs)
  any.lastAt = nowMs
  any.day = today
  // any.dayCount 不使用
  claims[anyKey] = any

  const dayKey = getClaimKey(acc, DAILY_RULE_ID)
  const dayRec = normalizeClaim(claims?.[dayKey], nowMs)
  if (dayRec.day !== today) {
    dayRec.day = today
    dayRec.dayCount = 0
  }
  dayRec.lastAt = nowMs
  dayRec.dayCount = Math.max(0, Math.floor(dayRec.dayCount || 0)) + 1
  claims[dayKey] = dayRec

  saveKeywordRewardClaims(claims)
}

export const canClaimKeywordReward = (account, rule, nowMs = Date.now()) => {
  const acc = String(account || '').trim()
  if (!acc) return false
  if (!rule?.enabled) return false
  const keyword = String(rule?.keyword || '').trim()
  if (!keyword) return false

  const claims = getKeywordRewardClaims()
  const k = getClaimKey(acc, rule.id)
  const rec = normalizeClaim(claims?.[k], nowMs)
  const last = Number(rec.lastAt || 0)
  const cd = Math.max(0, Math.floor(Number(rule?.cooldownSec) || 0)) * 1000
  if (cd && (nowMs - last) < cd) return false

  // 每日上限（可設定）
  const today = getLocalYMD(nowMs)
  const limit = Math.max(0, Math.floor(Number(rule?.dailyLimit) || 0))
  if (limit > 0) {
    const dayCount = (rec.day === today) ? rec.dayCount : 0
    if (dayCount >= limit) return false
  }
  return true
}

export const markKeywordRewardClaimed = (account, ruleId, nowMs = Date.now()) => {
  const acc = String(account || '').trim()
  const rid = String(ruleId || '').trim()
  if (!acc || !rid) return
  const claims = getKeywordRewardClaims()
  const today = getLocalYMD(nowMs)
  const k = getClaimKey(acc, rid)
  const rec = normalizeClaim(claims?.[k], nowMs)
  if (rec.day !== today) {
    rec.day = today
    rec.dayCount = 0
  }
  rec.lastAt = nowMs
  rec.dayCount = Math.max(0, Math.floor(rec.dayCount || 0)) + 1
  claims[k] = rec
  saveKeywordRewardClaims(claims)
}

export const matchKeywordReward = (text, rule) => {
  const t = String(text || '')
  const keyword = String(rule?.keyword || '').trim()
  if (!keyword) return false
  if (rule?.ignoreCase !== false) {
    const a = t.toLowerCase()
    const b = keyword.toLowerCase()
    return rule?.match === 'equals' ? (a.trim() === b) : a.includes(b)
  }
  return rule?.match === 'equals' ? (t.trim() === keyword) : t.includes(keyword)
}

