// 個人績效存儲工具
const PERFORMANCE_STORAGE_KEY = 'jiameng_personal_performance'

// 獲取所有績效記錄
export const getPerformanceRecords = () => {
  try {
    const records = localStorage.getItem(PERFORMANCE_STORAGE_KEY)
    return records ? JSON.parse(records) : []
  } catch (error) {
    console.error('Error getting performance records:', error)
    return []
  }
}

// 保存遲到記錄
export const saveLateRecord = (record) => {
  try {
    const records = getPerformanceRecords()
    const newRecord = {
      ...record,
      id: record.id || Date.now().toString(),
      type: 'late', // late, performance
      createdAt: record.createdAt || new Date().toISOString()
    }
    records.push(newRecord)
    localStorage.setItem(PERFORMANCE_STORAGE_KEY, JSON.stringify(records))
    return { success: true, record: newRecord }
  } catch (error) {
    console.error('Error saving late record:', error)
    return { success: false, message: '保存失敗' }
  }
}

// 保存平時表現記錄（每條記錄都保留，不覆蓋）
export const savePerformanceRecord = (record) => {
  try {
    const records = getPerformanceRecords()
    const newRecord = {
      ...record,
      id: record.id || Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9), // 確保唯一ID
      type: 'performance',
      createdAt: record.createdAt || new Date().toISOString()
    }
    // 每條記錄都保留，不檢查是否已存在（允許同一天多條記錄）
    records.push(newRecord)
    localStorage.setItem(PERFORMANCE_STORAGE_KEY, JSON.stringify(records))
    return { success: true, record: newRecord }
  } catch (error) {
    console.error('Error saving performance record:', error)
    return { success: false, message: '保存失敗' }
  }
}

// 獲取用戶的遲到記錄
export const getUserLateRecords = (userName, startDate = null, endDate = null) => {
  try {
    const records = getPerformanceRecords()
    let filtered = records.filter(r => r.type === 'late' && r.userName === userName)
    
    if (startDate) {
      filtered = filtered.filter(r => new Date(r.date) >= new Date(startDate))
    }
    if (endDate) {
      filtered = filtered.filter(r => new Date(r.date) <= new Date(endDate))
    }
    
    return filtered
  } catch (error) {
    console.error('Error getting user late records:', error)
    return []
  }
}

// 獲取用戶的平時表現記錄
export const getUserPerformanceRecords = (userName, startDate = null, endDate = null) => {
  try {
    const records = getPerformanceRecords()
    let filtered = records.filter(r => r.type === 'performance' && r.userName === userName)
    
    if (startDate) {
      filtered = filtered.filter(r => {
        const recordDate = new Date(r.date)
        const start = new Date(startDate)
        return recordDate >= start
      })
    }
    if (endDate) {
      filtered = filtered.filter(r => {
        const recordDate = new Date(r.date)
        const end = new Date(endDate)
        return recordDate <= end
      })
    }
    
    return filtered
  } catch (error) {
    console.error('Error getting user performance records:', error)
    return []
  }
}

// 保存出勤記錄（所有打卡記錄，包括正常和遲到）
export const saveAttendanceRecord = (record) => {
  try {
    const records = getPerformanceRecords()
    const newRecord = {
      ...record,
      id: record.id || Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
      type: 'attendance', // attendance, late, performance
      createdAt: record.createdAt || new Date().toISOString()
    }
    records.push(newRecord)
    localStorage.setItem(PERFORMANCE_STORAGE_KEY, JSON.stringify(records))
    return { success: true, record: newRecord }
  } catch (error) {
    console.error('Error saving attendance record:', error)
    return { success: false, message: '保存失敗' }
  }
}

// 獲取用戶的出勤記錄（所有打卡記錄）
export const getUserAttendanceRecords = (userName, startDate = null, endDate = null) => {
  try {
    const records = getPerformanceRecords()
    let filtered = records.filter(r => r.type === 'attendance' && r.userName === userName)
    
    if (startDate) {
      filtered = filtered.filter(r => new Date(r.date) >= new Date(startDate))
    }
    if (endDate) {
      filtered = filtered.filter(r => new Date(r.date) <= new Date(endDate))
    }
    
    return filtered
  } catch (error) {
    console.error('Error getting user attendance records:', error)
    return []
  }
}

// 刪除績效記錄
export const deletePerformanceRecord = (id) => {
  try {
    const records = getPerformanceRecords()
    const filtered = records.filter(r => r.id !== id)
    localStorage.setItem(PERFORMANCE_STORAGE_KEY, JSON.stringify(filtered))
    return { success: true }
  } catch (error) {
    console.error('Error deleting performance record:', error)
    return { success: false, message: '刪除失敗' }
  }
}
