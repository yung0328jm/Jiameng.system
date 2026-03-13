// 車輛設定：下次保養里程、下次驗車日期、保養/驗車間隔（供車輛資訊頁使用）；同步給所有用戶，僅指定用戶可編輯
import { syncKeyToSupabase } from './supabaseSync'

const KEY = 'jiameng_vehicle_settings'
const EDITORS_KEY = 'jiameng_vehicle_settings_editors'

export const getVehicleSettings = (vehicleKey) => {
  try {
    const raw = localStorage.getItem(KEY)
    const all = raw ? JSON.parse(raw) : {}
    const key = String(vehicleKey || '').trim()
    return key ? (all[key] || {}) : {}
  } catch {
    return {}
  }
}

export const getAllVehicleSettings = () => {
  try {
    const raw = localStorage.getItem(KEY)
    const all = raw ? JSON.parse(raw) : {}
    return typeof all === 'object' && all !== null ? all : {}
  } catch {
    return {}
  }
}

const FIELDS = ['lastMaintenanceMileage', 'lastInspectionDate', 'nextMaintenanceMileage', 'nextInspectionDate', 'maintenanceIntervalKm', 'inspectionIntervalMonths']

export const saveVehicleSettings = (vehicleKey, data) => {
  try {
    const key = String(vehicleKey || '').trim()
    if (!key) return { success: false, message: '車牌為必填' }
    const all = getAllVehicleSettings()
    const prev = all[key] || {}
    const next = { ...prev }
    FIELDS.forEach((f) => {
      if (data && Object.prototype.hasOwnProperty.call(data, f)) next[f] = data[f] ?? ''
    })
    all[key] = next
    const val = JSON.stringify(all)
    localStorage.setItem(KEY, val)
    syncKeyToSupabase(KEY, val)
    return { success: true }
  } catch (e) {
    return { success: false, message: e?.message || '儲存失敗' }
  }
}

/** 可編輯車輛設定的帳號列表（同步給所有用戶）；僅這些帳號可編輯保養/驗車與勾選本次已經驗車 */
export const getVehicleSettingsEditors = () => {
  try {
    const raw = localStorage.getItem(EDITORS_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    const list = Array.isArray(parsed?.allowedAccounts) ? parsed.allowedAccounts : []
    return { allowedAccounts: list }
  } catch {
    return { allowedAccounts: [] }
  }
}

export const saveVehicleSettingsEditors = (payload) => {
  try {
    const next = { allowedAccounts: Array.isArray(payload?.allowedAccounts) ? payload.allowedAccounts : [] }
    const val = JSON.stringify(next)
    localStorage.setItem(EDITORS_KEY, val)
    syncKeyToSupabase(EDITORS_KEY, val)
    return { success: true }
  } catch (e) {
    return { success: false, message: e?.message || '儲存失敗' }
  }
}
