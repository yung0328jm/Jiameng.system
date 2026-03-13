// 車輛設定：下次保養里程、下次驗車日期、保養/驗車間隔（供車輛資訊頁使用）
const KEY = 'jiameng_vehicle_settings'

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

const FIELDS = ['lastMaintenanceMileage', 'lastInspectionDate', 'nextMaintenanceMileage', 'nextInspectionDate', 'maintenanceIntervalKm', 'inspectionIntervalDays']

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
    localStorage.setItem(KEY, JSON.stringify(all))
    return { success: true }
  } catch (e) {
    return { success: false, message: e?.message || '儲存失敗' }
  }
}
