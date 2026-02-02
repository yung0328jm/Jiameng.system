// 工程排程存储工具
import { getSupabaseClient } from './supabaseClient'
import { normalizeWorkItem, getWorkItemCollaborators } from './workItemCollaboration'

const SCHEDULE_STORAGE_KEY = 'jiameng_engineering_schedules'

const nowIso = () => new Date().toISOString()

// 「預計」欄位：第一次新增（寫入）後鎖定不可編輯
const PLANNED_KEYS = [
  'workContent',
  'responsiblePerson',
  'targetQuantity',
  'isCollaborative',
  'collabMode'
]

const isApprovedChange = (patch, prev) => {
  const nextStatus = patch?.changeRequest?.status
  const hasProposed = !!patch?.changeRequest?.proposed
  // 僅允許「由待審 -> 已核准」的路徑套用 proposed（降低誤觸/濫用）
  return nextStatus === 'approved' && hasProposed && (prev?.changeRequest?.status === 'pending')
}

const mergeLockedCollaboratorsActual = (prevItem, patchItem) => {
  const prev = normalizeWorkItem(prevItem)
  const patch = normalizeWorkItem(patchItem)
  const prevCollabs = getWorkItemCollaborators(prev)
  const patchCollabs = getWorkItemCollaborators(patch)

  const patchByName = new Map(patchCollabs.map((c) => [String(c?.name || '').trim(), c]))
  const next = prevCollabs.map((c) => {
    const name = String(c?.name || '').trim()
    const p = patchByName.get(name)
    // 鎖定目標/人員，只允許更新「實際」
    return {
      ...c,
      actualQuantity: (p && p.actualQuantity != null) ? p.actualQuantity : c.actualQuantity
    }
  })
  return next
}

const applyApprovedProposedToPlanned = (baseItem, proposed) => {
  const base = normalizeWorkItem(baseItem)
  const p = (proposed && typeof proposed === 'object') ? proposed : {}

  const next = { ...base }
  // 基本欄位
  if (p.workContent != null) next.workContent = p.workContent
  if (p.isCollaborative != null) next.isCollaborative = !!p.isCollaborative
  if (p.collabMode === 'shared' || p.collabMode === 'separate') next.collabMode = p.collabMode

  // 單人：目標用 item.targetQuantity
  if (!next.isCollaborative) {
    if (p.responsiblePerson != null) next.responsiblePerson = p.responsiblePerson
    if (p.targetQuantity != null) next.targetQuantity = p.targetQuantity
    // 單人也同步 collaborators（向下相容/統一格式）
    if (String(next.responsiblePerson || '').trim()) {
      next.collaborators = [{
        name: String(next.responsiblePerson || '').trim(),
        targetQuantity: next.targetQuantity ?? '',
        actualQuantity: next.actualQuantity ?? ''
      }]
    }
    return next
  }

  // 協作：人員與每人目標由 proposed.collaborators 決定
  if (Array.isArray(p.collaborators)) {
    const baseActualByName = new Map(getWorkItemCollaborators(base).map((c) => [String(c?.name || '').trim(), c?.actualQuantity]))
    next.collaborators = p.collaborators
      .map((c) => ({
        name: String(c?.name || '').trim(),
        targetQuantity: c?.targetQuantity ?? '',
        // 不讓核准動作把「實際」洗掉：若 proposed 未帶 actualQuantity，沿用原本實際
        actualQuantity: (c?.actualQuantity != null)
          ? c.actualQuantity
          : (baseActualByName.get(String(c?.name || '').trim()) ?? '')
      }))
      .filter((c) => !!c.name)
  }

  // shared 模式的總目標用 item.targetQuantity（績效用）
  if (next.collabMode === 'shared' && p.targetQuantity != null) {
    next.targetQuantity = p.targetQuantity
  }

  return next
}

const mergeWorkItemWithLock = (prevItem, patchItem, lockAt) => {
  const prev = normalizeWorkItem(prevItem)
  const patch = (patchItem && typeof patchItem === 'object') ? { ...patchItem } : {}

  const lockedAt = prev.plannedLockedAt || lockAt
  const next = { ...prev, plannedLockedAt: lockedAt }

  // 永遠允許更新：變更申請、實際數量、累積資訊
  if (patch.changeRequest != null) next.changeRequest = patch.changeRequest
  if (patch.lastAccumulatedBy != null) next.lastAccumulatedBy = patch.lastAccumulatedBy
  if (patch.lastAccumulatedAt != null) next.lastAccumulatedAt = patch.lastAccumulatedAt
  if (patch.sharedActualQuantity != null) next.sharedActualQuantity = patch.sharedActualQuantity

  // 單人實際
  if (!next.isCollaborative && patch.actualQuantity != null) {
    next.actualQuantity = patch.actualQuantity
  }

  // 協作實際：只允許更新每人的 actualQuantity（不允許改人員/目標）
  if (next.isCollaborative && patch.collaborators != null) {
    next.collaborators = mergeLockedCollaboratorsActual(prev, patch)
  }

  // 若是「核准」的異動：允許套用 proposed 到預計欄位（並維持鎖定）
  if (isApprovedChange(patch, prev)) {
    const proposed = patch?.changeRequest?.proposed
    const applied = applyApprovedProposedToPlanned(next, proposed)
    // 保留鎖定時間/變更申請資訊
    return {
      ...applied,
      plannedLockedAt: lockedAt,
      plannedUpdatedAt: nowIso(),
      changeRequest: patch.changeRequest
    }
  }

  // 其餘情況：預計欄位一律沿用 prev（忽略 patch 對預計欄位的修改）
  PLANNED_KEYS.forEach((k) => { next[k] = prev[k] })
  // 協作人員/目標也鎖定（但保留實際更新）
  if (prev.isCollaborative) {
    const prevCollabs = getWorkItemCollaborators(prev)
    const curCollabs = getWorkItemCollaborators(next)
    // 若 prev 有 collabs，強制使用 prev 的人員/目標結構
    if (prevCollabs.length > 0) {
      const actualByName = new Map(curCollabs.map((c) => [String(c?.name || '').trim(), c?.actualQuantity]))
      next.collaborators = prevCollabs.map((c) => ({
        ...c,
        actualQuantity: actualByName.get(String(c?.name || '').trim()) ?? c.actualQuantity
      }))
    }
  }

  return next
}

const mergeWorkItemsWithLock = (prevWorkItems, nextWorkItems, lockAt) => {
  const prevArr = Array.isArray(prevWorkItems) ? prevWorkItems : []
  const nextArr = Array.isArray(nextWorkItems) ? nextWorkItems : []

  const prevMap = new Map(prevArr.map((x) => [String(x?.id || ''), x]).filter(([id]) => !!id))
  const nextMap = new Map(nextArr.map((x) => [String(x?.id || ''), x]).filter(([id]) => !!id))

  const merged = []

  // 既有 workItem：不可被刪除（避免鑽漏洞「刪掉重加」改預計）
  prevArr.forEach((prevItem) => {
    const id = String(prevItem?.id || '')
    const patch = nextMap.get(id) || {}
    merged.push(mergeWorkItemWithLock(prevItem, patch, lockAt))
  })

  // 新增 workItem：第一次寫入即鎖定
  nextArr.forEach((item) => {
    const id = String(item?.id || '')
    if (!id || prevMap.has(id)) return
    merged.push({
      ...item,
      plannedLockedAt: item.plannedLockedAt || lockAt,
      createdAt: item?.createdAt || lockAt,
      createdBy: item?.createdBy || ''
    })
  })

  return merged
}

const syncScheduleToSupabase = async (schedule) => {
  const sb = getSupabaseClient()
  if (!sb || !schedule?.id) return
  try {
    await sb.from('engineering_schedules').upsert({
      id: schedule.id,
      data: schedule,
      created_at: schedule.createdAt || new Date().toISOString()
    }, { onConflict: 'id' })
  } catch (e) {
    console.warn('syncScheduleToSupabase:', e)
  }
}

const deleteScheduleFromSupabase = async (scheduleId) => {
  const sb = getSupabaseClient()
  if (!sb) return
  try {
    await sb.from('engineering_schedules').delete().eq('id', scheduleId)
  } catch (e) {
    console.warn('deleteScheduleFromSupabase:', e)
  }
}

/** 刪除同一筆請假申請寫入的所有請假排程（多天） */
export const deleteSchedulesByLeaveApplicationId = (leaveApplicationId) => {
  try {
    const leaveId = String(leaveApplicationId || '').trim()
    if (!leaveId) return { success: false, message: '缺少 leaveApplicationId' }
    const schedules = getSchedules()
    const toDelete = (Array.isArray(schedules) ? schedules : []).filter((s) => String(s?.leaveApplicationId || '').trim() === leaveId)
    const keep = (Array.isArray(schedules) ? schedules : []).filter((s) => String(s?.leaveApplicationId || '').trim() !== leaveId)
    localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(keep))
    toDelete.forEach((s) => {
      try { deleteScheduleFromSupabase(s.id) } catch (_) {}
    })
    return { success: true, count: toDelete.length }
  } catch (e) {
    console.error('deleteSchedulesByLeaveApplicationId:', e)
    return { success: false, message: '刪除失敗' }
  }
}

export const getSchedules = () => {
  try {
    const schedules = localStorage.getItem(SCHEDULE_STORAGE_KEY)
    return schedules ? JSON.parse(schedules) : []
  } catch (error) {
    console.error('Error getting schedules:', error)
    return []
  }
}

export const saveSchedule = (schedule) => {
  try {
    const schedules = getSchedules()
    const lockAt = nowIso()
    const newSchedule = {
      ...schedule,
      createdBy: schedule?.createdBy || schedule?.created_by || schedule?.creator || '',
      id: schedule.id || Date.now().toString(),
      createdAt: schedule.createdAt || lockAt
    }
    // 第一次新增：鎖定所有 workItem 的「預計」欄位
    if (Array.isArray(newSchedule.workItems)) {
      newSchedule.workItems = newSchedule.workItems.map((wi) => ({
        ...normalizeWorkItem(wi),
        plannedLockedAt: wi?.plannedLockedAt || lockAt
      }))
    }
    // 盡量補齊 workItem 建立資訊（若前端未帶）
    if (Array.isArray(newSchedule.workItems)) {
      newSchedule.workItems = newSchedule.workItems.map((wi) => ({
        ...wi,
        createdAt: wi?.createdAt || lockAt,
        createdBy: wi?.createdBy || newSchedule.createdBy || ''
      }))
    }
    schedules.push(newSchedule)
    localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(schedules))
    syncScheduleToSupabase(newSchedule)
    return { success: true }
  } catch (error) {
    console.error('Error saving schedule:', error)
    return { success: false, message: '保存失敗' }
  }
}

export const updateSchedule = (scheduleId, updates) => {
  try {
    const schedules = getSchedules()
    const index = schedules.findIndex(s => s.id === scheduleId)
    if (index !== -1) {
      const lockAt = nowIso()
      const prev = schedules[index]
      const deleteIds = (updates && Array.isArray(updates.__deleteWorkItemIds))
        ? updates.__deleteWorkItemIds.map((x) => String(x || '').trim()).filter(Boolean)
        : []
      const next = {
        ...prev,
        ...updates,
        // 保護建立者資訊：除非明確提供，否則沿用舊值
        createdBy: (updates && Object.prototype.hasOwnProperty.call(updates, 'createdBy')) ? updates.createdBy : prev?.createdBy,
        createdAt: (updates && Object.prototype.hasOwnProperty.call(updates, 'createdAt')) ? updates.createdAt : prev?.createdAt
      }

      // workItems：鎖定「預計」欄位且不可刪除既有項目
      if ('workItems' in (updates || {})) {
        next.workItems = mergeWorkItemsWithLock(prev?.workItems, updates?.workItems, lockAt)
      }
      // 特例：僅允許「取消申請已核准」的工作項目被刪除
      if (deleteIds.length > 0 && Array.isArray(next.workItems)) {
        next.workItems = next.workItems.filter((wi) => {
          const id = String(wi?.id || '').trim()
          if (!deleteIds.includes(id)) return true
          const kind = String(wi?.changeRequest?.kind || wi?.changeRequest?.type || '').trim()
          const status = String(wi?.changeRequest?.status || '').trim()
          return !(kind === 'cancel' && status === 'approved')
        })
      }

      schedules[index] = next
      localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(schedules))
      syncScheduleToSupabase(schedules[index])
      return { success: true }
    }
    return { success: false, message: '排程不存在' }
  } catch (error) {
    console.error('Error updating schedule:', error)
    return { success: false, message: '更新失敗' }
  }
}

export const deleteSchedule = (scheduleId) => {
  try {
    const schedules = getSchedules()
    const filtered = schedules.filter(s => s.id !== scheduleId)
    localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(filtered))
    deleteScheduleFromSupabase(scheduleId)
    return { success: true }
  } catch (error) {
    console.error('Error deleting schedule:', error)
    return { success: false, message: '刪除失敗' }
  }
}
