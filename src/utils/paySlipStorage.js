// 勞務報酬單：每人薪資參數（日薪、加班時薪、未滿時薪）
import { syncKeyToSupabase } from './supabaseSync'

const PAY_RATES_STORAGE_KEY = 'jiameng_pay_rates'

/** @typedef {{ dailyRate: number, overtimeHourRate: number, underHourRate: number, updatedAt?: string }} PayRate */

const round2 = (x) => Math.round(Number(x) * 100) / 100

/** 取得所有人員薪資設定 { [personName]: PayRate } */
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

/** 取得單一人員薪資；找不到回傳預設值 */
export function getPayRate(personName) {
  const all = getAllPayRates()
  const r = all?.[String(personName || '').trim()]
  if (!r) return { dailyRate: 0, overtimeHourRate: 0, underHourRate: 0 }
  return {
    dailyRate: Number(r.dailyRate) || 0,
    overtimeHourRate: Number(r.overtimeHourRate) || 0,
    underHourRate: Number(r.underHourRate) || 0,
    updatedAt: r.updatedAt || ''
  }
}

/** 儲存單一人員薪資 */
export function setPayRate(personName, rate) {
  const name = String(personName || '').trim()
  if (!name) return { success: false, message: '人員名稱不可空白' }
  const all = getAllPayRates()
  all[name] = {
    dailyRate: round2(rate?.dailyRate),
    overtimeHourRate: round2(rate?.overtimeHourRate),
    underHourRate: round2(rate?.underHourRate),
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

/** 由日薪自動推算加班時薪（1.5 倍）與未滿時薪 */
export function suggestRatesFromDaily(dailyRate) {
  const d = Number(dailyRate) || 0
  if (d <= 0) return { dailyRate: 0, overtimeHourRate: 0, underHourRate: 0 }
  const hourly = d / 8
  return {
    dailyRate: round2(d),
    overtimeHourRate: round2(hourly * 1.5),
    underHourRate: round2(hourly)
  }
}

/**
 * 依出工統計與薪資設定計算薪資
 * @param {{ fullDays: number, overtimeHours: number, underHours: number }} stats
 * @param {{ dailyRate: number, overtimeHourRate: number, underHourRate: number }} rate
 */
export function calcPayAmount(stats, rate) {
  const days = Number(stats?.fullDays) || 0
  const ot = Number(stats?.overtimeHours) || 0
  const uh = Number(stats?.underHours) || 0
  const dr = Number(rate?.dailyRate) || 0
  const or = Number(rate?.overtimeHourRate) || 0
  const ur = Number(rate?.underHourRate) || 0
  const dayAmount = round2(days * dr)
  const overtimeAmount = round2(ot * or)
  const underAmount = round2(uh * ur)
  return {
    dayAmount,
    overtimeAmount,
    underAmount,
    total: round2(dayAmount + overtimeAmount + underAmount)
  }
}

export const PAY_RATES_STORAGE_KEYS = [PAY_RATES_STORAGE_KEY]
