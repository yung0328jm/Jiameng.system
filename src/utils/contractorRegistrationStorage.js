// 承攬商資料登記（管理員維護；同步至 Supabase）
import { syncKeyToSupabase } from './supabaseSync'
import { REALTIME_UPDATE_EVENT } from './supabaseRealtime'
import { addDropdownOption, getDropdownOptionsByCategory, updateDropdownOption } from './dropdownStorage'

export const CONTRACTOR_REGISTRATION_KEY = 'jiameng_contractor_registrations'
export const WORK_REPORT_CONTRACTOR_CATEGORY = 'work_report_contractors'

const notifyChanged = () => {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(REALTIME_UPDATE_EVENT, { detail: { key: CONTRACTOR_REGISTRATION_KEY } }))
    }
  } catch (_) {}
}

const persist = (list) => {
  const val = JSON.stringify(list)
  localStorage.setItem(CONTRACTOR_REGISTRATION_KEY, val)
  syncKeyToSupabase(CONTRACTOR_REGISTRATION_KEY, val).catch(() => {})
  notifyChanged()
}

export const getContractorRegistrations = () => {
  try {
    const raw = localStorage.getItem(CONTRACTOR_REGISTRATION_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch (_) {
    return []
  }
}

const syncNameToWorkReportDropdown = (name, prevName = '') => {
  const next = String(name || '').trim()
  const prev = String(prevName || '').trim()
  if (!next) return
  const options = getDropdownOptionsByCategory(WORK_REPORT_CONTRACTOR_CATEGORY) || []
  if (prev && prev !== next) {
    const oldOpt = options.find((o) => String(o?.value || '').trim() === prev)
    if (oldOpt?.id) updateDropdownOption(oldOpt.id, next)
  }
  const exists = options.some((o) => String(o?.value || '').trim() === next)
  if (!exists) addDropdownOption(next, WORK_REPORT_CONTRACTOR_CATEGORY)
}

export const addContractorRegistration = (data) => {
  try {
    const name = String(data?.name || '').trim()
    if (!name) return { success: false, message: '請填寫承攬商名稱' }
    const list = getContractorRegistrations()
    if (list.some((r) => String(r?.name || '').trim() === name)) {
      return { success: false, message: '此承攬商名稱已存在' }
    }
    const now = new Date().toISOString()
    const rec = {
      id: `contractor-${Date.now()}`,
      name,
      contactPerson: String(data?.contactPerson || '').trim(),
      phone: String(data?.phone || '').trim(),
      taxId: String(data?.taxId || '').trim(),
      address: String(data?.address || '').trim(),
      notes: String(data?.notes || '').trim(),
      createdAt: now,
      updatedAt: now
    }
    list.push(rec)
    persist(list)
    syncNameToWorkReportDropdown(name)
    return { success: true, record: rec }
  } catch (e) {
    console.error('addContractorRegistration:', e)
    return { success: false, message: '儲存失敗' }
  }
}

export const updateContractorRegistration = (id, updates = {}) => {
  try {
    const cid = String(id || '').trim()
    if (!cid) return { success: false, message: '缺少 id' }
    const list = getContractorRegistrations()
    const idx = list.findIndex((r) => String(r?.id || '').trim() === cid)
    if (idx < 0) return { success: false, message: '找不到該承攬商' }
    const prev = list[idx]
    const name = updates.name != null ? String(updates.name || '').trim() : String(prev.name || '').trim()
    if (!name) return { success: false, message: '請填寫承攬商名稱' }
    const dup = list.find((r) => String(r?.id || '').trim() !== cid && String(r?.name || '').trim() === name)
    if (dup) return { success: false, message: '此承攬商名稱已存在' }
    const next = {
      ...prev,
      name,
      contactPerson: updates.contactPerson != null ? String(updates.contactPerson || '').trim() : (prev.contactPerson || ''),
      phone: updates.phone != null ? String(updates.phone || '').trim() : (prev.phone || ''),
      taxId: updates.taxId != null ? String(updates.taxId || '').trim() : (prev.taxId || ''),
      address: updates.address != null ? String(updates.address || '').trim() : (prev.address || ''),
      notes: updates.notes != null ? String(updates.notes || '').trim() : (prev.notes || ''),
      updatedAt: new Date().toISOString()
    }
    list[idx] = next
    persist(list)
    syncNameToWorkReportDropdown(name, prev.name)
    return { success: true, record: next }
  } catch (e) {
    console.error('updateContractorRegistration:', e)
    return { success: false, message: '更新失敗' }
  }
}

export const deleteContractorRegistration = (id) => {
  try {
    const cid = String(id || '').trim()
    if (!cid) return { success: false, message: '缺少 id' }
    const list = getContractorRegistrations()
    const next = list.filter((r) => String(r?.id || '').trim() !== cid)
    persist(next)
    return { success: true }
  } catch (e) {
    console.error('deleteContractorRegistration:', e)
    return { success: false, message: '刪除失敗' }
  }
}
