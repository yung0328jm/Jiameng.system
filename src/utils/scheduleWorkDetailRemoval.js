// 個人績效「工作明細」單筆刪除（獨立模組，避免與 scheduleStorage 合併時漏匯出導致建置失敗）
import { getSupabaseClient } from './supabaseClient'
import { getSchedules } from './scheduleStorage'
import { normalizeWorkItem, getWorkItemCollaborators, getWorkItemCollabMode } from './workItemCollaboration'

// 須與 scheduleStorage.js 的 SCHEDULE_STORAGE_KEY 一致
const SCHEDULE_STORAGE_KEY = 'jiameng_engineering_schedules'

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
    console.warn('syncScheduleToSupabase (workDetailRemoval):', e)
  }
}

/** 刪除 contentRows 後，將第一列同步回工項頂層欄位 */
const syncItemFieldsFromFirstContentRow = (item) => {
  const it = normalizeWorkItem(item)
  const rows = Array.isArray(it.contentRows) ? it.contentRows : []
  if (rows.length === 0) {
    return normalizeWorkItem({ ...it, contentRows: undefined })
  }
  const first = rows[0]
  const next = { ...it, contentRows: rows }
  next.workContent = first?.workContent ?? it.workContent ?? ''
  next.targetQuantity = first?.targetQuantity ?? it.targetQuantity ?? ''
  if (!it.isCollaborative) {
    next.actualQuantity = first?.actualQuantity ?? it.actualQuantity ?? ''
  } else if (getWorkItemCollabMode(it) === 'shared') {
    const aq = first?.actualQuantity ?? ''
    next.sharedActualQuantity = aq
    next.actualQuantity = aq
  }
  return normalizeWorkItem(next)
}

/**
 * 個人績效「工作明細」單筆刪除：直接改寫排程內 workItems（略過 merge 鎖定的「不可刪工項」限制）。
 * spec: { workItemId, deleteMode: 'wholeItem'|'contentRow'|'collaborator', segmentIndex?: number|null,
 *         contentRowId?: string, collaboratorName?: string }
 */
const applyWorkDetailRemoval = (item, spec) => {
  const wid = String(item?.id || '').trim()
  const targetId = String(spec.workItemId || '').trim()
  if (wid !== targetId) return { next: item }

  if (spec.deleteMode === 'wholeItem') {
    return { next: null }
  }

  const it = normalizeWorkItem({ ...item })

  if (spec.deleteMode === 'collaborator') {
    const name = String(spec.collaboratorName || '').trim()
    if (!name) return { next: item, error: '缺少負責人' }
    const prevCollabs = getWorkItemCollaborators(it)
    const collabs = prevCollabs.filter((c) => String(c.name || '').trim() !== name)
    if (collabs.length === prevCollabs.length) {
      return { next: item, error: '找不到該負責人' }
    }
    if (collabs.length === 0) return { next: null }
    if (collabs.length === 1) {
      const c = collabs[0]
      const next = {
        ...it,
        isCollaborative: false,
        collabMode: 'separate',
        responsiblePerson: c.name,
        targetQuantity: c.targetQuantity ?? '',
        actualQuantity: c.actualQuantity ?? '',
        collaborators: [{ name: c.name, targetQuantity: c.targetQuantity ?? '', actualQuantity: c.actualQuantity ?? '' }],
        sharedActualQuantity: ''
      }
      return { next: normalizeWorkItem(next) }
    }
    return { next: normalizeWorkItem({ ...it, collaborators: collabs, isCollaborative: true }) }
  }

  if (spec.deleteMode === 'contentRow') {
    const rid = String(spec.contentRowId || '').trim()
    const rows = Array.isArray(it.contentRows) ? [...it.contentRows] : []
    if (rows.length === 0) return { next: item, error: '此工項無多列內容可刪' }
    const filtered = rid ? rows.filter((r) => String(r.id || '').trim() !== rid) : rows.slice(0, -1)
    if (filtered.length === rows.length) {
      return { next: item, error: '找不到對應工作列' }
    }
    if (filtered.length === 0) return { next: null }
    return { next: syncItemFieldsFromFirstContentRow({ ...it, contentRows: filtered }) }
  }

  return { next: item }
}

const patchWorkItemsForDetailRemoval = (workItems, spec) => {
  const arr = Array.isArray(workItems) ? workItems : []
  const out = []
  for (let i = 0; i < arr.length; i++) {
    const wi = arr[i]
    if (String(wi?.id) !== String(spec.workItemId)) {
      out.push(wi)
      continue
    }
    const { next, error } = applyWorkDetailRemoval(wi, spec)
    if (error) return { error, items: null }
    if (next != null) out.push(next)
    out.push(...arr.slice(i + 1))
    return { error: null, items: out }
  }
  return { error: '找不到工作項目', items: null }
}

export const removeWorkDetailLineFromSchedule = (scheduleId, spec) => {
  try {
    const schedules = getSchedules()
    const idx = schedules.findIndex((s) => String(s?.id) === String(scheduleId))
    if (idx < 0) return { success: false, message: '排程不存在' }

    const prev = schedules[idx]

    if (spec?.deleteMode === 'participantEntry') {
      const eid = String(spec.participantEntryId || '').trim()
      if (!eid) return { success: false, message: '缺少項目' }
      const entries = Array.isArray(prev.participantWorkEntries) ? prev.participantWorkEntries : []
      const filtered = entries.filter((e) => String(e?.id || '') !== eid)
      if (filtered.length === entries.length) return { success: false, message: '找不到該筆工作內容' }
      const nextSchedule = { ...prev, participantWorkEntries: filtered }
      schedules[idx] = nextSchedule
      localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(schedules))
      syncScheduleToSupabase(nextSchedule)
      return { success: true }
    }

    const useSegs = Array.isArray(prev.segments) && prev.segments.length > 0
    let nextSchedule = { ...prev }

    if (useSegs) {
      const segIdx = spec.segmentIndex != null && spec.segmentIndex >= 0 ? Number(spec.segmentIndex) : 0
      if (!prev.segments[segIdx]) return { success: false, message: '找不到案場段落' }
      const segs = prev.segments.map((s) => ({ ...s, workItems: Array.isArray(s.workItems) ? [...s.workItems] : [] }))
      const seg = segs[segIdx]
      const { error, items } = patchWorkItemsForDetailRemoval(seg.workItems, spec)
      if (error) return { success: false, message: error }
      segs[segIdx] = { ...seg, workItems: items }
      nextSchedule.segments = segs
    } else {
      if (spec.segmentIndex != null && spec.segmentIndex >= 0) {
        return { success: false, message: '此排程無多案場段落' }
      }
      const { error, items } = patchWorkItemsForDetailRemoval(prev.workItems, spec)
      if (error) return { success: false, message: error }
      nextSchedule.workItems = items
    }

    schedules[idx] = nextSchedule
    localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(schedules))
    syncScheduleToSupabase(nextSchedule)
    return { success: true }
  } catch (e) {
    console.error('removeWorkDetailLineFromSchedule:', e)
    return { success: false, message: '刪除失敗' }
  }
}
