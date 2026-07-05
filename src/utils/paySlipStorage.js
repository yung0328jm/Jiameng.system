// 勞務報酬單儲存：每人薪資參數與每月獎金
import { syncKeyToSupabase } from './supabaseSync'

const PAY_RATES_STORAGE_KEY = 'jiameng_pay_rates'
const PAY_BONUS_STORAGE_KEY = 'jiameng_pay_bonuses'

/** 當日已核准緊急入場時數達此門檻（含）才計夜間誤餐雜支費 */
export const NIGHT_MEAL_OT_THRESHOLD_HOURS = 3

export const DEFAULT_PAY_RATE = {
  dailyRate: 0,
  overtimeMultiplier: 1.35,
  mealAllowancePerDay: 130,
  nightMealAllowancePerDay: 130,
  insuranceSubsidyPerDay: 60
}

const round2 = (x) => Math.round(Number(x) * 100) / 100

const isYearMonthKey = (key) => /^\d{4}-\d{2}$/.test(String(key || '').trim())

function isLegacyPersonRateRecord(val) {
  return !!val && typeof val === 'object' && (
    'dailyRate' in val ||
    'overtimeMultiplier' in val ||
    'mealAllowancePerDay' in val ||
    'nightMealAllowancePerDay' in val ||
    'insuranceSubsidyPerDay' in val
  )
}

function normalizePayRateRecord(raw) {
  if (!isLegacyPersonRateRecord(raw)) return { ...DEFAULT_PAY_RATE }
  return {
    dailyRate: Number.isFinite(Number(raw.dailyRate)) ? Number(raw.dailyRate) : DEFAULT_PAY_RATE.dailyRate,
    overtimeMultiplier: Number.isFinite(Number(raw.overtimeMultiplier))
      ? Number(raw.overtimeMultiplier)
      : DEFAULT_PAY_RATE.overtimeMultiplier,
    mealAllowancePerDay: Number.isFinite(Number(raw.mealAllowancePerDay))
      ? Number(raw.mealAllowancePerDay)
      : DEFAULT_PAY_RATE.mealAllowancePerDay,
    nightMealAllowancePerDay: Number.isFinite(Number(raw.nightMealAllowancePerDay))
      ? Number(raw.nightMealAllowancePerDay)
      : DEFAULT_PAY_RATE.nightMealAllowancePerDay,
    insuranceSubsidyPerDay: Number.isFinite(Number(raw.insuranceSubsidyPerDay))
      ? Number(raw.insuranceSubsidyPerDay)
      : DEFAULT_PAY_RATE.insuranceSubsidyPerDay,
    updatedAt: raw.updatedAt || ''
  }
}

function getPriorMonthRateRecord(all, personName, yearMonth) {
  const ym = String(yearMonth || '').trim()
  if (!ym) return null
  const months = Object.keys(all || {})
    .filter(isYearMonthKey)
    .filter((m) => m < ym)
    .sort()
    .reverse()
  for (const m of months) {
    const rec = all?.[m]?.[personName]
    if (isLegacyPersonRateRecord(rec)) return rec
  }
  return null
}

function getLegacyPersonRateRecord(all, personName) {
  const rec = all?.[personName]
  return isLegacyPersonRateRecord(rec) ? rec : null
}

/* ===== 薪資參數（依月份儲存） ===== */

export function getAllPayRates() {
  try {
    const raw = localStorage.getItem(PAY_RATES_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (e) {
    console.error('Error reading pay rates:', e)
    return {}
  }
}

/** 供錄影模式等用途：彙整所有曾設定過費用參數的人名 */
export function getAllPayRatePersonNames() {
  const all = getAllPayRates()
  const names = new Set()
  Object.entries(all).forEach(([key, val]) => {
    if (isYearMonthKey(key) && val && typeof val === 'object') {
      Object.keys(val).forEach((name) => names.add(name))
      return
    }
    if (isLegacyPersonRateRecord(val)) names.add(key)
  })
  return [...names]
}

/**
 * @returns {'month' | 'prior' | 'legacy' | 'default'}
 */
export function getPayRateSource(personName, yearMonth) {
  const name = String(personName || '').trim()
  const ym = String(yearMonth || '').trim()
  const all = getAllPayRates()
  if (!name) return 'default'
  if (ym && isLegacyPersonRateRecord(all?.[ym]?.[name])) return 'month'
  if (ym && getPriorMonthRateRecord(all, name, ym)) return 'prior'
  if (getLegacyPersonRateRecord(all, name)) return 'legacy'
  return 'default'
}

export function hasPayRateForMonth(personName, yearMonth) {
  const name = String(personName || '').trim()
  const ym = String(yearMonth || '').trim()
  if (!name || !ym) return false
  return isLegacyPersonRateRecord(getAllPayRates()?.[ym]?.[name])
}

export function getPayRate(personName, yearMonth) {
  const name = String(personName || '').trim()
  const ym = String(yearMonth || '').trim()
  const all = getAllPayRates()
  if (!name) return { ...DEFAULT_PAY_RATE }

  if (ym && isLegacyPersonRateRecord(all?.[ym]?.[name])) {
    return normalizePayRateRecord(all[ym][name])
  }

  const prior = ym ? getPriorMonthRateRecord(all, name, ym) : null
  if (prior) return normalizePayRateRecord(prior)

  const legacy = getLegacyPersonRateRecord(all, name)
  if (legacy) return normalizePayRateRecord(legacy)

  return { ...DEFAULT_PAY_RATE }
}

export function setPayRate(personName, yearMonth, rate) {
  const name = String(personName || '').trim()
  const ym = String(yearMonth || '').trim()
  if (!name) return { success: false, message: '人員名稱不可空白' }
  if (!ym) return { success: false, message: '月份不可空白' }
  const all = getAllPayRates()
  if (!all[ym] || typeof all[ym] !== 'object') all[ym] = {}
  all[ym][name] = {
    dailyRate: round2(rate?.dailyRate),
    overtimeMultiplier: round2(rate?.overtimeMultiplier),
    mealAllowancePerDay: round2(rate?.mealAllowancePerDay),
    nightMealAllowancePerDay: round2(rate?.nightMealAllowancePerDay),
    insuranceSubsidyPerDay: round2(rate?.insuranceSubsidyPerDay),
    updatedAt: new Date().toISOString()
  }
  try {
    const val = JSON.stringify(all)
    localStorage.setItem(PAY_RATES_STORAGE_KEY, val)
    syncKeyToSupabase(PAY_RATES_STORAGE_KEY, val)
    return { success: true }
  } catch (e) {
    console.error('Error saving pay rate:', e)
    return { success: false, message: '儲存失敗' }
  }
}

/* ===== 每月獎金（手動輸入部分，與出工獎金制度自動計算相加） ===== */

export function getAllBonuses() {
  try {
    const raw = localStorage.getItem(PAY_BONUS_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (e) {
    console.error('Error reading bonuses:', e)
    return {}
  }
}

export function getBonus(personName, yearMonth) {
  const name = String(personName || '').trim()
  const ym = String(yearMonth || '').trim()
  if (!name || !ym) return 0
  const all = getAllBonuses()
  const v = Number(all?.[ym]?.[name])
  return Number.isFinite(v) ? v : 0
}

export function setBonus(personName, yearMonth, amount) {
  const name = String(personName || '').trim()
  const ym = String(yearMonth || '').trim()
  if (!name || !ym) return { success: false, message: '參數不正確' }
  const all = getAllBonuses()
  if (!all[ym] || typeof all[ym] !== 'object') all[ym] = {}
  const n = Number(amount) || 0
  if (n === 0) {
    delete all[ym][name]
    if (Object.keys(all[ym]).length === 0) delete all[ym]
  } else {
    all[ym][name] = round2(n)
  }
  try {
    const val = JSON.stringify(all)
    localStorage.setItem(PAY_BONUS_STORAGE_KEY, val)
    syncKeyToSupabase(PAY_BONUS_STORAGE_KEY, val)
    return { success: true }
  } catch (e) {
    console.error('Error saving bonus:', e)
    return { success: false, message: '儲存失敗' }
  }
}

export function getManualBonus(personName, yearMonth) {
  return getBonus(personName, yearMonth)
}

export function setManualBonus(personName, yearMonth, amount) {
  return setBonus(personName, yearMonth, amount)
}

export function calcTotalPayBonus(autoBonus, manualBonus) {
  return round2((Number(autoBonus) || 0) + (Number(manualBonus) || 0))
}

/* ===== 計算 ===== */

/**
 * @param {{ fullDays: number, overtimeHours: number, underHours: number, nightMealQualifyingDays?: number }} stats
 * @param {{ dailyRate: number, overtimeMultiplier: number, mealAllowancePerDay: number, nightMealAllowancePerDay?: number, insuranceSubsidyPerDay: number }} rate
 * @param {number} [bonus=0]
 */
export function calcPayAmount(stats, rate, bonus = 0) {
  const days = Number(stats?.fullDays) || 0
  const ot = Number(stats?.overtimeHours) || 0
  const uh = Number(stats?.underHours) || 0

  const dailyRate = Number(rate?.dailyRate) || 0
  const otMul = Number(rate?.overtimeMultiplier) || 0
  const mealPerDay = Number(rate?.mealAllowancePerDay) || 0
  const nightMealPerDay = Number(rate?.nightMealAllowancePerDay) || 0
  const insurancePerDay = Number(rate?.insuranceSubsidyPerDay) || 0
  const nightMealDays = Number(stats?.nightMealQualifyingDays) || 0
  const hourly = dailyRate / 8

  const dayAmount = round2(days * dailyRate)
  const underAmount = round2(uh * hourly)
  const overtimeAmount = round2(ot * hourly * otMul)
  const mealAmount = round2(days * mealPerDay + uh * (mealPerDay / 8))
  const nightMealAmount = round2(nightMealDays * nightMealPerDay)
  const insuranceAmount = round2(days * insurancePerDay + uh * (insurancePerDay / 8))
  const bonusAmount = round2(Number(bonus) || 0)

  return {
    dayAmount,
    underAmount,
    overtimeAmount,
    mealAmount,
    nightMealAmount,
    nightMealQualifyingDays: nightMealDays,
    insuranceAmount,
    bonusAmount,
    total: round2(
      dayAmount +
        underAmount +
        overtimeAmount +
        mealAmount +
        nightMealAmount +
        insuranceAmount +
        bonusAmount
    )
  }
}
