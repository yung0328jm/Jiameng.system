// 專案記錄存储工具
const PROJECT_RECORD_STORAGE_KEY = 'jiameng_project_records'

// 获取專案的所有記錄
export const getProjectRecords = (projectId) => {
  try {
    const records = localStorage.getItem(PROJECT_RECORD_STORAGE_KEY)
    const all = records ? JSON.parse(records) : {}
    return all[projectId] || []
  } catch (error) {
    console.error('Error getting project records:', error)
    return []
  }
}

// 保存專案記錄
export const saveProjectRecord = (projectId, record) => {
  try {
    const all = localStorage.getItem(PROJECT_RECORD_STORAGE_KEY)
    const records = all ? JSON.parse(all) : {}
    if (!records[projectId]) {
      records[projectId] = []
    }
    const newRecord = {
      ...record,
      id: record.id || Date.now().toString() + Math.random().toString(36).substr(2, 9),
      rowNumber: record.rowNumber || (records[projectId].length + 1),
      createdAt: record.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    const index = records[projectId].findIndex(r => r.id === newRecord.id)
    if (index !== -1) {
      records[projectId][index] = newRecord
    } else {
      records[projectId].push(newRecord)
    }
    localStorage.setItem(PROJECT_RECORD_STORAGE_KEY, JSON.stringify(records))
    return { success: true, record: newRecord }
  } catch (error) {
    console.error('Error saving project record:', error)
    return { success: false, message: '保存失敗' }
  }
}

// 批量保存專案記錄
export const saveAllProjectRecords = (projectId, records) => {
  try {
    const all = localStorage.getItem(PROJECT_RECORD_STORAGE_KEY)
    const allRecords = all ? JSON.parse(all) : {}
    // 重新編號
    records.forEach((record, index) => {
      record.rowNumber = index + 1
    })
    allRecords[projectId] = records
    localStorage.setItem(PROJECT_RECORD_STORAGE_KEY, JSON.stringify(allRecords))
    return { success: true }
  } catch (error) {
    console.error('Error saving all project records:', error)
    return { success: false, message: '保存失敗' }
  }
}

// 更新專案記錄
export const updateProjectRecord = (projectId, recordId, updates) => {
  try {
    const all = localStorage.getItem(PROJECT_RECORD_STORAGE_KEY)
    const records = all ? JSON.parse(all) : {}
    if (!records[projectId]) {
      return { success: false, message: '記錄不存在' }
    }
    const index = records[projectId].findIndex(r => r.id === recordId)
    if (index === -1) {
      return { success: false, message: '記錄不存在' }
    }
    records[projectId][index] = {
      ...records[projectId][index],
      ...updates,
      updatedAt: new Date().toISOString()
    }
    localStorage.setItem(PROJECT_RECORD_STORAGE_KEY, JSON.stringify(records))
    return { success: true }
  } catch (error) {
    console.error('Error updating project record:', error)
    return { success: false, message: '更新失敗' }
  }
}

// 删除專案記錄
export const deleteProjectRecord = (projectId, recordId) => {
  try {
    const all = localStorage.getItem(PROJECT_RECORD_STORAGE_KEY)
    const records = all ? JSON.parse(all) : {}
    if (!records[projectId]) {
      return { success: false, message: '記錄不存在' }
    }
    records[projectId] = records[projectId].filter(r => r.id !== recordId)
    // 重新編號
    records[projectId].forEach((record, index) => {
      record.rowNumber = index + 1
    })
    localStorage.setItem(PROJECT_RECORD_STORAGE_KEY, JSON.stringify(records))
    return { success: true }
  } catch (error) {
    console.error('Error deleting project record:', error)
    return { success: false, message: '刪除失敗' }
  }
}
