// 專案缺失追蹤存储工具
import { syncKeyToSupabase } from './supabaseSync'
const DEFICIENCY_STORAGE_KEY = 'jiameng_project_deficiencies'

const persist = (deficiencies) => {
  const val = JSON.stringify(deficiencies)
  localStorage.setItem(DEFICIENCY_STORAGE_KEY, val)
  syncKeyToSupabase(DEFICIENCY_STORAGE_KEY, val)
}

// 获取所有缺失记录（可選：按專案ID篩選）
export const getDeficiencies = (projectId = null) => {
  try {
    const deficiencies = localStorage.getItem(DEFICIENCY_STORAGE_KEY)
    const all = deficiencies ? JSON.parse(deficiencies) : []
    if (projectId) {
      return all.filter(d => d.projectId === projectId)
    }
    return all
  } catch (error) {
    console.error('Error getting deficiencies:', error)
    return []
  }
}

// 保存缺失记录（表格格式）
export const saveDeficiency = (deficiency) => {
  try {
    const deficiencies = getDeficiencies()
    const newDeficiency = {
      ...deficiency,
      id: deficiency.id || Date.now().toString(),
      rowNumber: deficiency.rowNumber || (deficiencies.length + 1),
      createdAt: deficiency.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    const index = deficiencies.findIndex(d => d.id === newDeficiency.id)
    if (index !== -1) {
      deficiencies[index] = newDeficiency
    } else {
      deficiencies.push(newDeficiency)
    }
    persist(deficiencies)
    return { success: true, deficiency: newDeficiency }
  } catch (error) {
    console.error('Error saving deficiency:', error)
    return { success: false, message: '保存失敗' }
  }
}

// 批量保存缺失记录（可選：按專案ID）
export const saveAllDeficiencies = (deficiencies, projectId = null) => {
  try {
    if (projectId) {
      // 只更新該專案的記錄
      const all = getDeficiencies()
      const others = all.filter(d => d.projectId !== projectId)
      const updated = [...others, ...deficiencies]
      persist(updated)
    } else {
      persist(deficiencies)
    }
    return { success: true }
  } catch (error) {
    console.error('Error saving all deficiencies:', error)
    return { success: false, message: '保存失敗' }
  }
}

// 删除專案的所有缺失记录
export const deleteDeficienciesByProject = (projectId) => {
  try {
    const all = getDeficiencies()
    const filtered = all.filter(d => d.projectId !== projectId)
    persist(filtered)
    return { success: true }
  } catch (error) {
    console.error('Error deleting deficiencies by project:', error)
    return { success: false, message: '刪除失敗' }
  }
}

// 更新缺失记录
export const updateDeficiency = (id, updates) => {
  try {
    const deficiencies = getDeficiencies()
    const index = deficiencies.findIndex(d => d.id === id)
    if (index === -1) {
      return { success: false, message: '記錄不存在' }
    }
    deficiencies[index] = {
      ...deficiencies[index],
      ...updates,
      updatedAt: new Date().toISOString()
    }
    persist(deficiencies)
    return { success: true }
  } catch (error) {
    console.error('Error updating deficiency:', error)
    return { success: false, message: '更新失敗' }
  }
}

// 删除缺失记录
export const deleteDeficiency = (id) => {
  try {
    const deficiencies = getDeficiencies()
    const filtered = deficiencies.filter(d => d.id !== id)
    persist(filtered)
    return { success: true }
  } catch (error) {
    console.error('Error deleting deficiency:', error)
    return { success: false, message: '刪除失敗' }
  }
}
