// 每日簽到儲存：獎勵設定（每日 1–31 格）、使用者簽到紀錄
import { syncKeyToSupabase } from './supabaseSync'
const REWARD_CONFIG_KEY = 'jiameng_checkin_rewards'
const CHECKIN_RECORDS_KEY = 'jiameng_checkin_records'

// 預設單日獎勵
const defaultDayReward = (day) => ({
  rewardType: 'jiameng_coin',
  rewardAmount: Math.min(10 + day, 50),
  rewardDescription: `${10 + Math.min(day, 40)} 佳盟幣`
})

// 取得整月（1–31 格）獎勵設定
export const getRewardConfig = () => {
  try {
    const data = localStorage.getItem(REWARD_CONFIG_KEY)
    if (data) {
      const parsed = JSON.parse(data)
      const days = {}
      for (let d = 1; d <= 31; d++) {
        days[d] = parsed.days?.[d] || defaultDayReward(d)
      }
      return { days }
    }
    const defaultConfig = { days: {} }
    for (let d = 1; d <= 31; d++) defaultConfig.days[d] = defaultDayReward(d)
    return defaultConfig
  } catch (e) {
    console.error('getRewardConfig error', e)
    const defaultConfig = { days: {} }
    for (let d = 1; d <= 31; d++) defaultConfig.days[d] = defaultDayReward(d)
    return defaultConfig
  }
}

// 儲存獎勵設定（管理員）
export const setRewardConfig = (config) => {
  try {
    const next = { days: { ...(config.days || {}) } }
    for (let d = 1; d <= 31; d++) {
      if (!next.days[d]) next.days[d] = defaultDayReward(d)
    }
    const val = JSON.stringify(next)
    localStorage.setItem(REWARD_CONFIG_KEY, val)
    syncKeyToSupabase(REWARD_CONFIG_KEY, val)
    return { success: true }
  } catch (e) {
    console.error('setRewardConfig error', e)
    return { success: false, message: '儲存失敗' }
  }
}

// 取得某使用者所有簽到日期 { 'YYYY-MM-DD': true }
export const getCheckInRecords = (username) => {
  try {
    const data = localStorage.getItem(CHECKIN_RECORDS_KEY)
    const all = data ? JSON.parse(data) : {}
    return all[username] || {}
  } catch (e) {
    console.error('getCheckInRecords error', e)
    return {}
  }
}

// 是否已在某日簽到
export const hasCheckedIn = (username, dateStr) => {
  const records = getCheckInRecords(username)
  return !!records[dateStr]
}

// 簽到：寫入紀錄並回傳該日獎勵設定（由頁面負責發放佳盟幣/道具與寫入交易紀錄）
export const performCheckIn = (username, dateStr) => {
  try {
    const records = getCheckInRecords(username)
    if (records[dateStr]) {
      return { success: false, message: '當日已簽到過' }
    }
    const day = parseInt(dateStr.split('-')[2], 10)
    if (day < 1 || day > 31) {
      return { success: false, message: '日期無效' }
    }
    const config = getRewardConfig()
    const reward = config.days[day] || defaultDayReward(day)

    const data = localStorage.getItem(CHECKIN_RECORDS_KEY)
    const all = data ? JSON.parse(data) : {}
    if (!all[username]) all[username] = {}
    all[username][dateStr] = true
    const val = JSON.stringify(all)
    localStorage.setItem(CHECKIN_RECORDS_KEY, val)
    syncKeyToSupabase(CHECKIN_RECORDS_KEY, val)

    return { success: true, reward, day }
  } catch (e) {
    console.error('performCheckIn error', e)
    return { success: false, message: '簽到失敗' }
  }
}
