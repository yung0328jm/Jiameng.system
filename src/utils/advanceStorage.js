// 預支申請儲存：使用者申請借支金額與事由，管理員審核後可標記已匯款
const ADVANCE_KEY = 'jiameng_advances'

function getStorage() {
  try {
    const raw = localStorage.getItem(ADVANCE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (e) {
    console.error('advanceStorage getStorage:', e)
    return []
  }
}

function saveStorage(list) {
  try {
    localStorage.setItem(ADVANCE_KEY, JSON.stringify(Array.isArray(list) ? list : []))
  } catch (e) {
    console.error('advanceStorage saveStorage:', e)
  }
}

/** 取得所有預支記錄 */
export function getAllAdvances() {
  return getStorage()
}

/** 依帳號取得該使用者的預支記錄（依建立時間新到舊） */
export function getAdvancesByAccount(account) {
  const list = getStorage()
  const acc = String(account || '').trim()
  return list
    .filter((r) => String(r?.account || '').trim() === acc)
    .sort((a, b) => (new Date(b.createdAt || 0)).getTime() - (new Date(a.createdAt || 0)).getTime())
}

/** 待審核（審核中）清單 */
export function getPendingAdvances() {
  return getStorage().filter((r) => (r.status || 'pending') === 'pending')
}

/** 新增一筆預支申請 */
export function addAdvance({ account, amount, reason }) {
  try {
    const list = getStorage()
    const id = `adv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const rec = {
      id,
      account: String(account || '').trim(),
      amount: Math.max(0, Number(amount) || 0),
      reason: String(reason || '').trim(),
      status: 'pending', // 審核中
      createdAt: new Date().toISOString(),
      reviewedBy: '',
      reviewedAt: null,
      transferredAt: null
    }
    list.push(rec)
    saveStorage(list)
    return { success: true, id, record: rec }
  } catch (e) {
    console.error('addAdvance:', e)
    return { success: false, message: '儲存失敗' }
  }
}

/** 管理員駁回 */
export function rejectAdvance(id, reviewedBy = '') {
  try {
    const list = getStorage()
    const idx = list.findIndex((r) => r.id === id)
    if (idx === -1) return { success: false, message: '找不到該申請' }
    list[idx] = {
      ...list[idx],
      status: 'rejected',
      reviewedBy: String(reviewedBy || '').trim(),
      reviewedAt: new Date().toISOString()
    }
    saveStorage(list)
    return { success: true, record: list[idx] }
  } catch (e) {
    console.error('rejectAdvance:', e)
    return { success: false, message: '更新失敗' }
  }
}

/** 管理員標記已匯款（核准並已撥款） */
export function markTransferred(id, reviewedBy = '') {
  try {
    const list = getStorage()
    const idx = list.findIndex((r) => r.id === id)
    if (idx === -1) return { success: false, message: '找不到該申請' }
    const now = new Date().toISOString()
    list[idx] = {
      ...list[idx],
      status: 'transferred',
      reviewedBy: String(reviewedBy || '').trim(),
      reviewedAt: list[idx].reviewedAt || now,
      transferredAt: now
    }
    saveStorage(list)
    return { success: true, record: list[idx] }
  } catch (e) {
    console.error('markTransferred:', e)
    return { success: false, message: '更新失敗' }
  }
}

/** 某帳號的借支總額（只計 status === 'transferred' 已匯款） */
export function getTotalTransferredByAccount(account) {
  const list = getStorage()
  const acc = String(account || '').trim()
  return list
    .filter((r) => String(r?.account || '').trim() === acc && (r.status || '') === 'transferred')
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
}

/** 某帳號的審核中筆數 */
export function getPendingCountByAccount(account) {
  const list = getStorage()
  const acc = String(account || '').trim()
  return list.filter((r) => String(r?.account || '').trim() === acc && (r.status || '') === 'pending').length
}

/** 某帳號的已匯款筆數 */
export function getTransferredCountByAccount(account) {
  const list = getStorage()
  const acc = String(account || '').trim()
  return list.filter((r) => String(r?.account || '').trim() === acc && (r.status || '') === 'transferred').length
}

/** 某帳號按每月統計（已匯款）— 回傳 { 'YYYY-MM': amount, ... }，依月份排序 */
export function getMonthlyTransferredByAccount(account) {
  const list = getStorage()
  const acc = String(account || '').trim()
  const byMonth = {}
  list
    .filter((r) => String(r?.account || '').trim() === acc && (r.status || '') === 'transferred')
    .forEach((r) => {
      const dateStr = (r.transferredAt || r.reviewedAt || r.createdAt || '').slice(0, 7) // YYYY-MM
      if (dateStr) {
        byMonth[dateStr] = (byMonth[dateStr] || 0) + (Number(r.amount) || 0)
      }
    })
  return byMonth
}
