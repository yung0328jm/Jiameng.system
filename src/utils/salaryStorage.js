// 薪資明細：依用戶、年月儲存，供個人績效頁面顯示
const SALARY_DETAILS_KEY = 'jiameng_salary_details'

export const getSalaryDetailsAll = () => {
  try {
    const data = localStorage.getItem(SALARY_DETAILS_KEY)
    return data ? JSON.parse(data) : []
  } catch (e) {
    console.error('getSalaryDetailsAll:', e)
    return []
  }
}

/** 取得某用戶某年月的薪資明細；yearMonth 格式 YYYY-MM */
export const getSalaryDetails = (userId, yearMonth) => {
  const list = getSalaryDetailsAll()
  const uid = String(userId || '').trim()
  const ym = String(yearMonth || '').trim()
  const found = list.find((r) => String(r?.userId || '').trim() === uid && String(r?.yearMonth || '').trim() === ym)
  return found || null
}

/** 儲存/更新某用戶某年月的薪資明細；items: [{ label, amount }], total: 總額, note: 備註 */
export const saveSalaryDetails = ({ userId, yearMonth, items, total, note }) => {
  try {
    const list = getSalaryDetailsAll()
    const uid = String(userId || '').trim()
    const ym = String(yearMonth || '').trim()
    const rest = list.filter((r) => String(r?.userId || '') !== uid || String(r?.yearMonth || '') !== ym)
    rest.push({
      userId: uid,
      yearMonth: ym,
      items: Array.isArray(items) ? items : [],
      total: total != null ? Number(total) : null,
      note: note != null ? String(note) : '',
      updatedAt: new Date().toISOString()
    })
    localStorage.setItem(SALARY_DETAILS_KEY, JSON.stringify(rest))
    return { success: true }
  } catch (e) {
    console.error('saveSalaryDetails:', e)
    return { success: false, message: '儲存失敗' }
  }
}
