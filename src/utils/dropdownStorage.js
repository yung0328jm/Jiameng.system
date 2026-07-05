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

/** 案場是否顯示於承攬商出工登記（須明確勾選） */
export const isContractorCheckInSite = (option) => option?.contractorCheckIn === true

export const setDropdownSiteContractorCheckIn = (id, enabled) => {
  try {
    const options = getDropdownOptions()
    const index = options.findIndex((opt) => opt.id === id)
    if (index === -1) return { success: false, message: '選項不存在' }
    options[index] = { ...options[index], contractorCheckIn: !!enabled }
    saveDropdownOptions(options)
    return { success: true }
  } catch (error) {
    console.error('Error setting contractor check-in site:', error)
    return { success: false, message: '更新失敗' }
  }
}

/** 啟用中案場（常用清單已勾選者）；用於訂餐、出工登記、入廠申請等所有案場選單 */
export const getContractorCheckInSiteNames = () => {
  const seen = new Set()
  const out = []
  ;(getDropdownOptionsByCategory('work_report_sites') || []).forEach((o) => {
    if (!isContractorCheckInSite(o)) return
    const v = String(o?.value || '').trim()
    if (!v || seen.has(v)) return
    seen.add(v)
    out.push(v)
  })
  return out.sort((a, b) => a.localeCompare(b, 'zh-Hant'))
}

/** @deprecated 請改用 getContractorCheckInSiteNames；保留別名供舊程式碼 */
export const getActiveSiteNames = getContractorCheckInSiteNames

// 調整某分類內的選項順序（依照 orderedIds 排列）
// 會保留其他分類的相對位置，只替換該分類在全量陣列中的順序
export const reorderDropdownOptionsByCategory = (category, orderedIds = []) => {
  try {
    const cat = String(category || '').trim()
    if (!cat) return { success: false, message: '缺少分類' }
    const ids = Array.isArray(orderedIds) ? orderedIds.map((x) => String(x || '').trim()).filter(Boolean) : []

    const options = getDropdownOptions()
    const catOptions = options.filter((opt) => opt && opt.category === cat)
    if (catOptions.length <= 1) return { success: true } // 不需要調整

    const map = new Map(catOptions.map((o) => [String(o.id), o]))
    const used = new Set()
    const reordered = []

    // 先依照傳入順序排列
    ids.forEach((id) => {
      const it = map.get(id)
      if (it && !used.has(id)) {
        reordered.push(it)
        used.add(id)
      }
    })
    // 再補齊沒有在 ids 內的（保持原順序）
    catOptions.forEach((it) => {
      const id = String(it.id)
      if (!used.has(id)) {
        reordered.push(it)
        used.add(id)
      }
    })

    // 用 reordered 逐一替換原本 options 中該分類的位置（保留其他分類順序）
    let idx = 0
    const merged = options.map((opt) => {
      if (opt && opt.category === cat) {
        const next = reordered[idx]
        idx += 1
        return next || opt
      }
      return opt
    })

    saveDropdownOptions(merged)
    return { success: true }
  } catch (error) {
    console.error('Error reordering dropdown options:', error)
    return { success: false, message: '排序失敗' }
  }
}

// 根據下拉選單的顯示名稱（value）獲取綁定的帳號
// 如果沒有綁定帳號，則返回原來的名稱
export const getBoundAccountByValue = (value, category = 'participants') => {
  try {
    const options = getDropdownOptionsByCategory(category)
    const needle = String(value || '').trim()
    const option = options.find((opt) => String(opt?.value || '').trim() === needle)
    if (option && option.boundAccount) {
      return option.boundAccount
    }
    return value
  } catch (error) {
    console.error('Error getting bound account:', error)
    return value
  }
}

/** 在所有分類的下拉選項中，依顯示名稱（value）找出已綁定的系統帳號（與排程／加班人員字串比對時雙方 trim） */
export const findBoundAccountForDisplayName = (displayName) => {
  const raw = String(displayName || '').trim()
  if (!raw) return ''
  try {
    const options = getDropdownOptions()
    const opt = options.find(
      (o) => String(o?.value || '').trim() === raw && String(o?.boundAccount || '').trim() !== ''
    )
    return opt ? String(opt.boundAccount).trim() : ''
  } catch (error) {
    console.error('Error finding bound account for display name:', error)
    return ''
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
