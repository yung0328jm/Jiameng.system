// 專案記錄存储工具
import { syncKeyToSupabase } from './supabaseSync'
import { getSupabaseClient, isSupabaseEnabled } from './supabaseClient'
const PROJECT_RECORD_LOCAL_PREFIX = 'jiameng_project_records:' // 本機快取：每個專案一個 key
const PROJECT_RECORD_CLOUD_PREFIX = 'jiameng_project_records__' // 雲端同步：避免 key 含 ':' 在某些環境被擋
const PROJECT_RECORD_LOCAL_BACKUP_PREFIX = 'jiameng_project_records_local_backup__' // 本機備份：永不被雲端覆蓋（防刷新消失）

const normalizePid = (projectId) => String(projectId || '').trim()
const localKeyForProject = (projectId) => `${PROJECT_RECORD_LOCAL_PREFIX}${normalizePid(projectId)}`
const cloudKeyForProject = (projectId) => `${PROJECT_RECORD_CLOUD_PREFIX}${encodeURIComponent(normalizePid(projectId))}`
const backupKeyForProject = (projectId) => `${PROJECT_RECORD_LOCAL_BACKUP_PREFIX}${normalizePid(projectId)}`

const persistProject = (projectId, arr) => {
  const pid = normalizePid(projectId)
  if (!pid) return
  const list = Array.isArray(arr) ? arr : []
  const perKey = localKeyForProject(pid)
  const val = JSON.stringify(list)
  // 1) 本機快取：每專案一份
  localStorage.setItem(perKey, val)
  // 1.1) 本機備份：防止刷新/同步覆蓋造成消失
  try { localStorage.setItem(backupKeyForProject(pid), val) } catch (_) {}
  // 2) 雲端同步：每專案一份
  // 先用「直接 upsert」(等同你按的「強制」) 確保立即可見；失敗才回退到 outbox/排隊機制
  const cloudKey = cloudKeyForProject(pid)
  try {
    const sb = isSupabaseEnabled() ? getSupabaseClient() : null
    if (sb) {
      ;(async () => {
        try {
          const { error } = await sb
            .from('app_data')
            .upsert({ key: cloudKey, data: list, updated_at: new Date().toISOString() }, { onConflict: 'key' })
          if (error) throw error
        } catch (_) {
          // fallback：走既有的同步佇列/去抖/合併邏輯
          try { syncKeyToSupabase(cloudKey, val) } catch (_) {}
        }
      })()
    } else {
      syncKeyToSupabase(cloudKey, val)
    }
  } catch (_) {
    try { syncKeyToSupabase(cloudKey, val) } catch (_) {}
  }

}

// 获取專案的所有記錄
export const getProjectRecords = (projectId) => {
  try {
    const pid = normalizePid(projectId)
    if (!pid) return []

    // 先讀新格式
    const per = localStorage.getItem(localKeyForProject(pid))
    if (per) {
      const parsed = JSON.parse(per)
      // 重要：允許空陣列（刪到最後一筆時必須能回傳 []，不能再 fallback 把舊資料撈回來）
      return Array.isArray(parsed) ? parsed : []
    }

    // 再讀本機備份（防刷新消失）
    const backup = localStorage.getItem(backupKeyForProject(pid))
    if (backup) {
      try {
        const parsed = JSON.parse(backup)
        const arr = Array.isArray(parsed) ? parsed : []
        try { localStorage.setItem(localKeyForProject(pid), JSON.stringify(arr)) } catch (_) {}
        return arr
      } catch (_) {}
    }

    // 真的沒有資料：回傳空陣列（不再讀整包 legacy，避免記憶體爆炸）
    return []
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
