// 下拉選單存储工具
import { syncKeyToSupabase } from './supabaseSync'
const DROPDOWN_STORAGE_KEY = 'jiameng_dropdown_options'

// 获取所有下拉選單选项（保證回傳陣列）
export const getDropdownOptions = () => {
  try {
    const raw = localStorage.getItem(DROPDOWN_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.error('Error getting dropdown options:', error)
    return []
  }
}

// 根据分类获取下拉選單选项
export const getDropdownOptionsByCategory = (category) => {
  try {
    const allOptions = getDropdownOptions()
    return allOptions.filter(opt => opt.category === category)
  } catch (error) {
    console.error('Error getting dropdown options by category:', error)
    return []
  }
}

// 保存下拉選單选项
export const saveDropdownOptions = (options) => {
  try {
    const val = JSON.stringify(options)
    localStorage.setItem(DROPDOWN_STORAGE_KEY, val)
    syncKeyToSupabase(DROPDOWN_STORAGE_KEY, val)
    return { success: true }
  } catch (error) {
    console.error('Error saving dropdown options:', error)
    return { success: false, message: '保存失敗' }
  }
}

// 添加下拉選單选项
export const addDropdownOption = (value, category, boundAccount = '') => {
  try {
    const options = getDropdownOptions()
    // 检查是否已存在
    if (options.some(opt => opt.value === value && opt.category === category)) {
      return { success: false, message: '該選項已存在' }
    }
    const newOption = {
      id: Date.now().toString(),
      value: value.trim(),
      category: category,
      boundAccount: boundAccount || '', // 綁定的用戶帳號
      createdAt: new Date().toISOString()
    }
    options.push(newOption)
    saveDropdownOptions(options)
    return { success: true, option: newOption }
  } catch (error) {
    console.error('Error adding dropdown option:', error)
    return { success: false, message: '添加失敗' }
  }
}

// 更新下拉選單选项
export const updateDropdownOption = (id, newValue, boundAccount = null) => {
  try {
    const options = getDropdownOptions()
    const index = options.findIndex(opt => opt.id === id)
    if (index === -1) {
      return { success: false, message: '選項不存在' }
    }
    options[index].value = newValue.trim()
    // 如果提供了 boundAccount，則更新綁定帳號（null 表示不更新）
    if (boundAccount !== null) {
      options[index].boundAccount = boundAccount || ''
    }
    saveDropdownOptions(options)
    return { success: true }
  } catch (error) {
    console.error('Error updating dropdown option:', error)
    return { success: false, message: '更新失敗' }
  }
}

// 删除下拉選單选项
export const deleteDropdownOption = (id) => {
  try {
    const options = getDropdownOptions()
    const filtered = options.filter(opt => opt.id !== id)
    saveDropdownOptions(filtered)
    return { success: true }
  } catch (error) {
    console.error('Error deleting dropdown option:', error)
    return { success: false, message: '刪除失敗' }
  }
}

// 根據下拉選單的顯示名稱（value）獲取綁定的帳號
// 如果沒有綁定帳號，則返回原來的名稱
export const getBoundAccountByValue = (value, category = 'participants') => {
  try {
    const options = getDropdownOptionsByCategory(category)
    const option = options.find(opt => opt.value === value)
    if (option && option.boundAccount) {
      return option.boundAccount
    }
    return value
  } catch (error) {
    console.error('Error getting bound account:', error)
    return value
  }
}

// 根據帳號取得「參與人員」「負責人」中綁定該帳號的顯示名稱
// 用於績效計算時比對行事曆的 participants / responsiblePerson（存的是顯示名稱）
export const getDisplayNamesForAccount = (account) => {
  try {
    const names = new Set([account]) // 含帳號本身
    const participants = getDropdownOptionsByCategory('participants')
    const responsiblePersons = getDropdownOptionsByCategory('responsible_persons')
    ;[...participants, ...responsiblePersons].forEach(opt => {
      if (opt.boundAccount === account && opt.value) {
        names.add(opt.value)
      }
    })
    return Array.from(names)
  } catch (error) {
    console.error('Error getting display names for account:', error)
    return account ? [account] : []
  }
}
