// 薪資結構：預設項目與自動計算規則（本薪、加班費、績效、代扣、請假、勞健保等）
const SALARY_STRUCTURE_KEY = 'jiameng_salary_structure'

const DEFAULT_STRUCTURE = [
  { id: 'base', label: '本薪', type: 'manual', isDeduction: false, config: {} },
  { id: 'overtime', label: '加班費', type: 'auto_overtime', isDeduction: false, config: { hourlyRate: 200 } },
  { id: 'performance', label: '績效獎金', type: 'manual', isDeduction: false, config: {} },
  { id: 'deduction', label: '代扣', type: 'manual', isDeduction: true, config: {} },
  { id: 'leave', label: '請假扣款', type: 'auto_leave', isDeduction: true, config: { deductionPerDay: 500 } },
  { id: 'insurance', label: '勞健保', type: 'manual', isDeduction: true, config: {} }
]

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
