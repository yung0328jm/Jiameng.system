// 專案記錄存储工具
import { syncKeyToSupabase } from './supabaseSync'
const PROJECT_RECORD_STORAGE_KEY = 'jiameng_project_records' // legacy：整包（可能過大，不再寫回雲端）
const PROJECT_RECORD_KEY_PREFIX = 'jiameng_project_records:' // 新格式：每個專案一個 key（避免 payload 過大導致不同步）

const keyForProject = (projectId) => `${PROJECT_RECORD_KEY_PREFIX}${String(projectId || '').trim()}`

const persistProject = (projectId, arr) => {
  const pid = String(projectId || '').trim()
  if (!pid) return
  const list = Array.isArray(arr) ? arr : []
  const perKey = keyForProject(pid)
  const val = JSON.stringify(list)
  // 1) 新格式：每專案一份（同步到雲端）
  localStorage.setItem(perKey, val)
  syncKeyToSupabase(perKey, val)

  // 2) legacy：維持本機快取，讓舊程式/搜尋仍可讀到（不再同步到雲端，避免整包太大寫不進）
  try {
    const raw = localStorage.getItem(PROJECT_RECORD_STORAGE_KEY)
    const all = raw ? JSON.parse(raw) : {}
    const next = all && typeof all === 'object' ? { ...all } : {}
    next[pid] = list
    localStorage.setItem(PROJECT_RECORD_STORAGE_KEY, JSON.stringify(next))
  } catch (_) {}
}

// 获取專案的所有記錄
export const getProjectRecords = (projectId) => {
  try {
    const pid = String(projectId || '').trim()
    if (!pid) return []

    // 先讀新格式
    const per = localStorage.getItem(keyForProject(pid))
    if (per) {
      const parsed = JSON.parse(per)
      return Array.isArray(parsed) ? parsed : []
    }

    // fallback：讀 legacy，並把該專案搬到新格式（只搬本機，避免一進頁面就觸發大量雲端寫入）
    const records = localStorage.getItem(PROJECT_RECORD_STORAGE_KEY)
    const all = records ? JSON.parse(records) : {}
    const arr = Array.isArray(all?.[pid]) ? all[pid] : []
    try { localStorage.setItem(keyForProject(pid), JSON.stringify(arr)) } catch (_) {}
    return arr
  } catch (error) {
    console.error('Error getting project records:', error)
    return []
  }
}

// 保存專案記錄
export const saveProjectRecord = (projectId, record) => {
  try {
    const pid = String(projectId || '').trim()
    if (!pid) return { success: false, message: '專案不存在' }
    const records = getProjectRecords(pid)
    const newRecord = {
      ...record,
      id: record.id || Date.now().toString() + Math.random().toString(36).substr(2, 9),
      rowNumber: record.rowNumber || (records.length + 1),
      createdAt: record.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    const index = records.findIndex(r => r.id === newRecord.id)
    if (index !== -1) {
      records[index] = newRecord
    } else {
      records.push(newRecord)
    }
    persistProject(pid, records)
    return { success: true, record: newRecord }
  } catch (error) {
    console.error('Error saving project record:', error)
    return { success: false, message: '保存失敗' }
  }
}

// 批量保存專案記錄
export const saveAllProjectRecords = (projectId, records) => {
  try {
    const pid = String(projectId || '').trim()
    if (!pid) return { success: false, message: '專案不存在' }
    // 重新編號
    ;(Array.isArray(records) ? records : []).forEach((record, index) => {
      record.rowNumber = index + 1 // eslint-disable-line no-param-reassign
    })
    persistProject(pid, records)
    return { success: true }
  } catch (error) {
    console.error('Error saving all project records:', error)
    return { success: false, message: '保存失敗' }
  }
}

// 更新專案記錄
export const updateProjectRecord = (projectId, recordId, updates) => {
  try {
    const pid = String(projectId || '').trim()
    if (!pid) return { success: false, message: '專案不存在' }
    const records = getProjectRecords(pid)
    if (!Array.isArray(records) || records.length === 0) return { success: false, message: '記錄不存在' }
    const index = records.findIndex(r => r.id === recordId)
    if (index === -1) {
      return { success: false, message: '記錄不存在' }
    }
    records[index] = {
      ...records[index],
      ...updates,
      updatedAt: new Date().toISOString()
    }
    persistProject(pid, records)
    return { success: true }
  } catch (error) {
    console.error('Error updating project record:', error)
    return { success: false, message: '更新失敗' }
  }
}

// 删除專案記錄
export const deleteProjectRecord = (projectId, recordId) => {
  try {
    const pid = String(projectId || '').trim()
    if (!pid) return { success: false, message: '專案不存在' }
    const records = getProjectRecords(pid)
    if (!Array.isArray(records) || records.length === 0) return { success: false, message: '記錄不存在' }
    const next = records.filter(r => r.id !== recordId)
    // 重新編號
    next.forEach((record, index) => {
      record.rowNumber = index + 1 // eslint-disable-line no-param-reassign
    })
    persistProject(pid, next)
    return { success: true }
  } catch (error) {
    console.error('Error deleting project record:', error)
    return { success: false, message: '刪除失敗' }
  }
}
