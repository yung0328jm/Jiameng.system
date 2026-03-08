// 薪資結構：預設項目與自動計算規則（本薪、加班費、績效、代扣、請假、勞健保等）
const SALARY_STRUCTURE_KEY = 'jiameng_salary_structure'

// defaultAmount：手動項目的預設/建議金額（填寫此月薪資時可自動帶入）
const DEFAULT_STRUCTURE = [
  { id: 'base', label: '本薪', type: 'manual', isDeduction: false, config: {}, defaultAmount: undefined },
  { id: 'overtime', label: '加班費', type: 'auto_overtime', isDeduction: false, config: { hourlyRate: 200 }, defaultAmount: undefined },
  { id: 'performance', label: '績效獎金', type: 'manual', isDeduction: false, config: {}, defaultAmount: undefined },
  { id: 'deduction', label: '代扣', type: 'manual', isDeduction: true, config: {}, defaultAmount: undefined },
  { id: 'leave', label: '請假扣款', type: 'auto_leave', isDeduction: true, config: { deductionPerDay: 500 }, defaultAmount: undefined },
  { id: 'insurance', label: '勞健保', type: 'manual', isDeduction: true, config: {}, defaultAmount: undefined }
]

/** 取得預設薪資結構（本薪、加班費、績效、代扣、請假扣款、勞健保），可供還原使用 */
export const getDefaultSalaryStructure = () => DEFAULT_STRUCTURE.map((s) => ({ ...s, config: { ...(s.config || {}) } }))

export const getSalaryStructure = () => {
  try {
    const data = localStorage.getItem(SALARY_STRUCTURE_KEY)
    if (!data) return DEFAULT_STRUCTURE
    const parsed = JSON.parse(data)
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_STRUCTURE
  } catch (e) {
    console.error('getSalaryStructure:', e)
    return DEFAULT_STRUCTURE
  }
}

export const saveSalaryStructure = (structure) => {
  try {
    const list = Array.isArray(structure) ? structure : DEFAULT_STRUCTURE
    localStorage.setItem(SALARY_STRUCTURE_KEY, JSON.stringify(list))
    return { success: true }
  } catch (e) {
    console.error('saveSalaryStructure:', e)
    return { success: false, message: '儲存失敗' }
  }
}
