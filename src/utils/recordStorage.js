// 工程紀錄存储工具
const RECORD_STORAGE_KEY = 'jiameng_engineering_records'

export const getRecords = (scheduleId) => {
  try {
    const allRecords = localStorage.getItem(RECORD_STORAGE_KEY)
    const records = allRecords ? JSON.parse(allRecords) : {}
    return records[scheduleId] || []
  } catch (error) {
    console.error('Error getting records:', error)
    return []
  }
}

export const saveRecords = (scheduleId, records) => {
  try {
    const allRecords = localStorage.getItem(RECORD_STORAGE_KEY)
    const recordsObj = allRecords ? JSON.parse(allRecords) : {}
    recordsObj[scheduleId] = records
    localStorage.setItem(RECORD_STORAGE_KEY, JSON.stringify(recordsObj))
    return { success: true }
  } catch (error) {
    console.error('Error saving records:', error)
    return { success: false, message: '保存失敗' }
  }
}

export const addRecord = (scheduleId, record) => {
  try {
    const records = getRecords(scheduleId)
    const newRecord = {
      ...record,
      id: record.id || Date.now().toString() + Math.random().toString(36).substr(2, 9)
    }
    records.push(newRecord)
    return saveRecords(scheduleId, records)
  } catch (error) {
    console.error('Error adding record:', error)
    return { success: false, message: '添加失敗' }
  }
}

export const updateRecord = (scheduleId, recordId, updates) => {
  try {
    const records = getRecords(scheduleId)
    const index = records.findIndex(r => r.id === recordId)
    if (index !== -1) {
      records[index] = { ...records[index], ...updates }
      return saveRecords(scheduleId, records)
    }
    return { success: false, message: '記錄不存在' }
  } catch (error) {
    console.error('Error updating record:', error)
    return { success: false, message: '更新失敗' }
  }
}

export const deleteRecord = (scheduleId, recordId) => {
  try {
    const records = getRecords(scheduleId)
    const filtered = records.filter(r => r.id !== recordId)
    return saveRecords(scheduleId, filtered)
  } catch (error) {
    console.error('Error deleting record:', error)
    return { success: false, message: '刪除失敗' }
  }
}
