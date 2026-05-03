// 車輛設定：下次保養里程、下次驗車日期、保養/驗車間隔（供車輛資訊頁使用）；同步給所有用戶，僅指定用戶可編輯
import { syncKeyToSupabase } from './supabaseSync'

const KEY = 'jiameng_vehicle_settings'
const EDITORS_KEY = 'jiameng_vehicle_settings_editors'
/** 從「車輛資訊」頁隱藏的車牌（不刪行事曆排程）；同步至 Supabase */
const HIDDEN_KEY = 'jiameng_vehicle_info_hidden'

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

/** 移除該車牌之保養／驗車設定（不影響行事曆排程）；同步至 Supabase */
export const deleteVehicleSettings = (vehicleKey) => {
  try {
    const key = String(vehicleKey || '').trim()
    if (!key) return { success: false, message: '車牌為必填' }
    const all = getAllVehicleSettings()
    if (!Object.prototype.hasOwnProperty.call(all, key)) {
      return { success: true }
    }
    const next = { ...all }
    delete next[key]
    const val = JSON.stringify(next)
    localStorage.setItem(KEY, val)
    syncKeyToSupabase(KEY, val)
    return { success: true }
  } catch (e) {
    return { success: false, message: e?.message || '刪除失敗' }
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

export const getVehicleHiddenPlatesList = () => {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY)
    const o = raw ? JSON.parse(raw) : {}
    const list = Array.isArray(o?.hiddenPlates) ? o.hiddenPlates : []
    return [...new Set(list.map((s) => String(s).trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'zh-Hant')
    )
  } catch {
    return []
  }
}

/** 不再於車輛資訊頁顯示該車牌（行事曆排程不受影響） */
export const hideVehicleFromVehicleInfoPage = (vehicleKey) => {
  try {
    const plate = String(vehicleKey || '').trim()
    if (!plate) return { success: false, message: '車牌為必填' }
    const current = new Set(getVehicleHiddenPlatesList())
    current.add(plate)
    const val = JSON.stringify({
      hiddenPlates: Array.from(current).sort((a, b) => a.localeCompare(b, 'zh-Hant'))
    })
    localStorage.setItem(HIDDEN_KEY, val)
    syncKeyToSupabase(HIDDEN_KEY, val)
    return { success: true }
  } catch (e) {
    return { success: false, message: e?.message || '儲存失敗' }
  }
}

export const unhideVehicleFromVehicleInfoPage = (vehicleKey) => {
  try {
    const plate = String(vehicleKey || '').trim()
    if (!plate) return { success: false, message: '車牌為必填' }
    const next = getVehicleHiddenPlatesList().filter((p) => p !== plate)
    const val = JSON.stringify({ hiddenPlates: next })
    localStorage.setItem(HIDDEN_KEY, val)
    syncKeyToSupabase(HIDDEN_KEY, val)
    return { success: true }
  } catch (e) {
    return { success: false, message: e?.message || '儲存失敗' }
  }
}
