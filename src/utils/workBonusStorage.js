// 出工獎金制度：規則說明、多條件設定與進度計算
import { syncKeyToSupabase } from './supabaseSync'

const CONFIG_KEY = 'jiameng_work_bonus_config'
const RULES_KEY = 'jiameng_work_bonus_rules'

const round2 = (x) => Math.round(Number(x) * 100) / 100

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

/* ===== 規則說明與合併模式 ===== */

/** @typedef {'cumulative' | 'replace'} WorkBonusCombineMode */

function normalizeCombineMode(mode) {
  return mode === 'replace' ? 'replace' : 'cumulative'
}

function saveWorkBonusConfig(updates) {
  const prev = getWorkBonusConfig()
  const cfg = {
    description: prev.description,
    combineMode: prev.combineMode,
    ...updates,
    updatedAt: new Date().toISOString()
  }
  persist(CONFIG_KEY, cfg)
  return { success: true }
}

export function getWorkBonusConfig() {
  const cfg = safeParse(localStorage.getItem(CONFIG_KEY), {})
  return {
    description: String(cfg?.description || ''),
    combineMode: normalizeCombineMode(cfg?.combineMode),
    updatedAt: cfg?.updatedAt || ''
  }
}

export function setWorkBonusDescription(description) {
  return saveWorkBonusConfig({ description: String(description || '').trim() })
}

export function setWorkBonusCombineMode(mode) {
  return saveWorkBonusConfig({ combineMode: normalizeCombineMode(mode) })
}

export function getWorkBonusCombineModeLabel(mode) {
  return normalizeCombineMode(mode) === 'replace'
    ? '取代（同類型只取最高階，不同類型累加）'
    : '累加（同類型達成全部相加）'
}

/* ===== 獎金條件 ===== */

/** @typedef {'fixed' | 'overtime_rate'} WorkBonusRuleType */

/**
 * @typedef {Object} WorkBonusRule
 * @property {string} id
 * @property {string} label
 * @property {WorkBonusRuleType} type
 * @property {number} minWorkDays
 * @property {number} [amount]
 * @property {number} [overtimeRatePerHour]
 * @property {boolean} enabled
 * @property {number} sortOrder
 */

export function getWorkBonusRules() {
  const list = safeParse(localStorage.getItem(RULES_KEY), [])
  if (!Array.isArray(list)) return []
  return list
    .map((r) => normalizeRule(r))
    .filter(Boolean)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.label).localeCompare(String(b.label), 'zh-Hant'))
}

function normalizeRule(raw) {
  if (!raw || typeof raw !== 'object') return null
  const type = raw.type === 'overtime_rate' ? 'overtime_rate' : 'fixed'
  const minWorkDays = Math.max(1, Math.floor(Number(raw.minWorkDays) || 1))
  const label = String(raw.label || '').trim()
  if (!label) return null
  return {
    id: String(raw.id || `wbr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
    label,
    type,
    minWorkDays,
    amount: type === 'fixed' ? Math.max(0, round2(raw.amount)) : 0,
    overtimeRatePerHour: type === 'overtime_rate' ? Math.max(0, round2(raw.overtimeRatePerHour)) : 0,
    enabled: raw.enabled !== false,
    sortOrder: Math.floor(Number(raw.sortOrder) || 0),
    createdAt: raw.createdAt || '',
    updatedAt: raw.updatedAt || ''
  }
}

function saveRules(rules) {
  persist(RULES_KEY, Array.isArray(rules) ? rules : [])
}

export function addWorkBonusRule(rule) {
  const list = getWorkBonusRules()
  const item = normalizeRule({
    ...rule,
    id: rule?.id || `wbr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sortOrder: rule?.sortOrder != null ? rule.sortOrder : list.length,
    createdAt: new Date().toISOString()
  })
  if (!item) return { success: false, message: '請填寫獎金名稱' }
  list.push(item)
  saveRules(list)
  return { success: true, item }
}

export function updateWorkBonusRule(id, updates) {
  const list = getWorkBonusRules()
  const idx = list.findIndex((r) => r.id === id)
  if (idx === -1) return { success: false, message: '條件不存在' }
  const merged = normalizeRule({ ...list[idx], ...updates, id: list[idx].id, updatedAt: new Date().toISOString() })
  if (!merged) return { success: false, message: '資料不正確' }
  list[idx] = merged
  saveRules(list)
  return { success: true, item: merged }
}

export function deleteWorkBonusRule(id) {
  const list = getWorkBonusRules().filter((r) => r.id !== id)
  saveRules(list)
  return { success: true }
}

/* ===== 進度計算 ===== */

function resolveCountingRuleIds(items, combineMode) {
  const achieved = items.filter((it) => it.achieved && (it.bonusAmount || 0) > 0)
  if (achieved.length === 0) return new Set()

  if (normalizeCombineMode(combineMode) === 'cumulative') {
    return new Set(achieved.map((it) => it.rule.id))
  }

  // 取代：僅在同類型（固定金額 / 加班加成）內取最高出工天數門檻；不同類型各自計算後累加
  const countingIds = new Set()
  const types = [...new Set(achieved.map((it) => it.rule.type))]
  types.forEach((type) => {
    const ofType = achieved.filter((it) => it.rule.type === type)
    const maxDays = Math.max(...ofType.map((it) => it.targetDays))
    ofType
      .filter((it) => it.targetDays === maxDays)
      .forEach((it) => countingIds.add(it.rule.id))
  })
  return countingIds
}

function calcTotalFromProgressItems(items, combineMode) {
  const countingIds = resolveCountingRuleIds(items, combineMode)
  return round2(
    items
      .filter((it) => countingIds.has(it.rule.id))
      .reduce((sum, it) => sum + (it.bonusAmount || 0), 0)
  )
}

/**
 * @param {{ fullDays: number, overtimeHours: number }} stats
 * @param {WorkBonusRule[]} [rules]
 * @param {{ combineMode?: WorkBonusCombineMode }} [options]
 */
export function calcPersonBonusProgress(stats, rules, options = {}) {
  const fullDays = Number(stats?.fullDays) || 0
  const overtimeHours = round2(Number(stats?.overtimeHours) || 0)
  const activeRules = (rules || getWorkBonusRules()).filter((r) => r.enabled)
  const combineMode = normalizeCombineMode(options.combineMode ?? getWorkBonusConfig().combineMode)

  const items = activeRules.map((rule) => {
    const targetDays = rule.minWorkDays
    const achieved = fullDays >= targetDays
    const progressPct = Math.min(100, Math.round((fullDays / targetDays) * 1000) / 10)
    const daysRemaining = Math.max(0, targetDays - fullDays)

    let bonusAmount = 0
    let projectedBonus = 0
    if (rule.type === 'fixed') {
      bonusAmount = achieved ? round2(rule.amount) : 0
      projectedBonus = round2(rule.amount)
    } else {
      bonusAmount = achieved ? round2(overtimeHours * rule.overtimeRatePerHour) : 0
      projectedBonus = round2(overtimeHours * rule.overtimeRatePerHour)
    }

    return {
      rule,
      currentDays: fullDays,
      targetDays,
      progressPct,
      daysRemaining,
      achieved,
      bonusAmount,
      projectedBonus,
      overtimeHours: rule.type === 'overtime_rate' ? overtimeHours : undefined
    }
  })

  const countingIds = resolveCountingRuleIds(items, combineMode)
  return items.map((it) => ({
    ...it,
    countsTowardTotal: countingIds.has(it.rule.id),
    superseded: it.achieved && !countingIds.has(it.rule.id)
  }))
}

export function calcPersonTotalBonus(stats, rules, options = {}) {
  const combineMode = normalizeCombineMode(options.combineMode ?? getWorkBonusConfig().combineMode)
  const items = calcPersonBonusProgress(stats, rules, { combineMode })
  return calcTotalFromProgressItems(items, combineMode)
}

export function describeWorkBonusRule(rule) {
  if (!rule) return ''
  if (rule.type === 'overtime_rate') {
    return `出工滿 ${rule.minWorkDays} 天，加班時數 × ${formatBonusMoney(rule.overtimeRatePerHour)} 元`
  }
  return `出工滿 ${rule.minWorkDays} 天，獎金 ${formatBonusMoney(rule.amount)} 元`
}

export function formatBonusMoney(n) {
  const x = Number(n) || 0
  return x.toLocaleString('zh-Hant-TW', { maximumFractionDigits: 2 })
}
