// 整月去處報表：管理員手動覆寫單格顯示文字（不依行事曆時可補登或修正）
export const MONTHLY_LOCATION_OVERRIDES_KEY = 'jiameng_monthly_location_overrides'
const STORAGE_KEY = MONTHLY_LOCATION_OVERRIDES_KEY

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`
}

function cellKey(name, dateStr) {
  return `${String(name || '').trim()}|${String(dateStr || '').slice(0, 10)}`
}

export function getMonthlyOverrides(year, month) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const all = raw ? JSON.parse(raw) : {}
    const key = monthKey(year, month)
    const monthData = all[key]
    return monthData && typeof monthData === 'object' ? { ...monthData } : {}
  } catch (_) {
    return {}
  }
}

/** 設定某格顯示文字；傳空字串則刪除覆寫（恢復行事曆自動） */
export function setMonthlyCellOverride(year, month, name, dateStr, text) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const all = raw ? JSON.parse(raw) : {}
    const key = monthKey(year, month)
    if (!all[key] || typeof all[key] !== 'object') all[key] = {}
    const ck = cellKey(name, dateStr)
    const t = String(text ?? '').trim()
    if (!t) {
      delete all[key][ck]
      if (Object.keys(all[key]).length === 0) delete all[key]
    } else {
      all[key][ck] = t
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
    return { success: true }
  } catch (e) {
    console.error(e)
    return { success: false }
  }
}

/** 取得該月份所有曾手動出現過的姓名（含僅手動新增的行） */
export function getOverrideNamesForMonth(year, month) {
  const overrides = getMonthlyOverrides(year, month)
  const names = new Set()
  Object.keys(overrides).forEach((k) => {
    const pipe = k.indexOf('|')
    if (pipe > 0) names.add(k.slice(0, pipe))
  })
  return [...names]
}
