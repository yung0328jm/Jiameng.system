// 本地存储工具函数
import { syncKeyToSupabase } from './supabaseSync'
const STORAGE_KEY = 'jiameng_users'
const ADVANCE_KEY = 'jiameng_advances'
const ADVANCE_REPAYMENTS_KEY = 'jiameng_advance_repayments'

/** 寫入本地並同步到 Supabase；回傳 sync 的 Promise，呼叫方可 await 以確保刷新前已寫入雲端 */
const setUsersAndSync = (users) => {
  const val = JSON.stringify(users)
  localStorage.setItem(STORAGE_KEY, val)
  return syncKeyToSupabase(STORAGE_KEY, val)
}

export const getUsers = () => {
  try {
    const users = localStorage.getItem(STORAGE_KEY)
    const parsed = users ? JSON.parse(users) : []
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.error('Error getting users:', error)
    return []
  }
}

// 初始化默认管理者账户
export const initializeAdminUser = () => {
  try {
    const users = getUsers()
    
    // 检查是否已有管理者账户
    const hasAdmin = users.some(u => u.role === 'admin')
    
    if (!hasAdmin) {
      // 创建默认管理者账户
      const defaultAdmin = {
        id: 'admin-' + Date.now(),
        name: '系統管理者',
        account: 'admin',
        password: 'admin123',
        role: 'admin',
        createdAt: new Date().toISOString()
      }
      users.push(defaultAdmin)
      setUsersAndSync(users)
      return { success: true, message: '已創建默認管理者賬戶' }
    }
    
    return { success: false, message: '已存在管理者賬戶' }
  } catch (error) {
    console.error('Error initializing admin user:', error)
    return { success: false, message: '初始化失敗' }
  }
}

/** 註冊新用戶；會先寫入 localStorage，並等待 Supabase 同步完成再回傳，避免刷新後用戶消失 */
export const saveUser = async (user) => {
  try {
    const users = getUsers()
    if (users.some(u => u.account === user.account)) {
      return { success: false, message: '該帳號已存在' }
    }
    users.push({
      ...user,
      role: user.role || 'user',
      id: Date.now().toString(),
      createdAt: new Date().toISOString()
    })
    await setUsersAndSync(users)
    return { success: true, message: '註冊成功' }
  } catch (error) {
    console.error('Error saving user:', error)
    return { success: false, message: '註冊失敗，請稍後再試' }
  }
}

// 获取用户角色
export const getUserRole = (account) => {
  try {
    const users = getUsers()
    const user = users.find(u => u.account === account)
    return user ? (user.role || 'user') : null
  } catch (error) {
    console.error('Error getting user role:', error)
    return null
  }
}

// 更新用户角色（仅管理者可用）；角色含 resigned（離職，無法登入）
export const updateUserRole = (account, newRole) => {
  const allowed = ['admin', 'user', 'resigned']
  if (!allowed.includes(newRole)) {
    return { success: false, message: '無效角色' }
  }
  try {
    const users = getUsers()
    const userIndex = users.findIndex(u => u.account === account)
    if (userIndex === -1) {
      return { success: false, message: '用戶不存在' }
    }
    const adminCount = users.filter(u => u.role === 'admin').length
    if (users[userIndex].role === 'admin' && adminCount <= 1 && newRole !== 'admin') {
      return { success: false, message: '無法變更最後一個管理者的角色' }
    }
    users[userIndex].role = newRole
    setUsersAndSync(users).catch((e) => {
      console.error('Error syncing user role to cloud:', e)
    })
    return { success: true }
  } catch (error) {
    console.error('Error updating user role:', error)
    return { success: false, message: '更新失敗' }
  }
}

// 删除用户（仅管理者可用）
export const deleteUser = async (account) => {
  try {
    const users = getUsers()
    const userIndex = users.findIndex(u => u.account === account)
    if (userIndex === -1) {
      return { success: false, message: '用戶不存在' }
    }
    
    // 检查是否是最后一个管理者
    const adminCount = users.filter(u => u.role === 'admin').length
    if (users[userIndex].role === 'admin' && adminCount <= 1) {
      return { success: false, message: '無法刪除最後一個管理者賬戶' }
    }
    
    users.splice(userIndex, 1)
    await setUsersAndSync(users)
    return { success: true }
  } catch (error) {
    console.error('Error deleting user:', error)
    return { success: false, message: '刪除失敗（雲端同步未完成）' }
  }
}

export const clearAllData = () => {
  try {
    localStorage.removeItem(STORAGE_KEY)
    return { success: true, message: '所有數據已清理' }
  } catch (error) {
    console.error('Error clearing data:', error)
    return { success: false, message: '清理失敗' }
  }
}

export const verifyUser = (account, password) => {
  try {
    const users = getUsers()
    const user = users.find(u => u.account === account && u.password === password)
    if (!user) {
      return { success: false, message: '帳號或密碼錯誤' }
    }
    if (user.role === 'resigned') {
      return { success: false, message: '謝謝你曾經付出，祝您一帆風順、事事如意' }
    }
    return { success: true, user }
  } catch (error) {
    console.error('Error verifying user:', error)
    return { success: false, message: '登錄失敗，請稍後再試' }
  }
}

// ---------- 預支申請（與 advanceStorage 同邏輯，集中於此避免部署時模組找不到） ----------
function getAdvanceList() {
  try {
    const raw = localStorage.getItem(ADVANCE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (e) {
    return []
  }
}
function saveAdvanceList(list) {
  try {
    const data = Array.isArray(list) ? list : []
    localStorage.setItem(ADVANCE_KEY, JSON.stringify(data))
    syncKeyToSupabase(ADVANCE_KEY, JSON.stringify(data))
  } catch (e) {}
}
export function getAllAdvances() {
  return getAdvanceList()
}
export function getAdvancesByAccount(account) {
  const list = getAdvanceList()
  const acc = String(account || '').trim()
  return list
    .filter((r) => String(r?.account || '').trim() === acc)
    .sort((a, b) => (new Date(b.createdAt || 0)).getTime() - (new Date(a.createdAt || 0)).getTime())
}
export function getPendingAdvances() {
  return getAdvanceList().filter((r) => (r.status || 'pending') === 'pending')
}

/** 有上月舊帳且本月又有新借時：最低還款＝本月新借＋此金額（舊帳慢慢還的底線含在內） */
export const ADVANCE_MIN_EXTRA_WHEN_CARRIED = 3000
/** 有上月舊帳但本月無新借時：每月至少還此金額（不超過實際欠款） */
export const ADVANCE_MIN_PAY_NO_NEW_BORROW = 3000

function advanceCurrentYearMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** 審核中預支金額加總；excludeId 用於核准時排除該筆 */
export function getPendingAdvanceAmountByAccount(account, excludeId = '') {
  const acc = String(account || '').trim()
  const ex = String(excludeId || '')
  return getAdvanceList()
    .filter((r) => String(r?.account || '').trim() === acc && (r.status || '') === 'pending' && String(r.id) !== ex)
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
}

/**
 * 預估目前欠款總額：本月初尚欠扣本月已還 ＋ 本月已撥付 ＋ 審核中（可排除一筆）＋ extraTransferred
 */
export function getAdvanceProjectedDebtTotal(account, yearMonth, opts = {}) {
  const extra = Math.max(0, Number(opts.extraTransferred) || 0)
  const excludePid = String(opts.excludePendingId || '')
  const ym = String(yearMonth || '').trim() || advanceCurrentYearMonth()
  const stats = getAdvanceRepaymentStats(account, ym)
  const carriedRemain = Math.max(0, stats.lastMonthUnpaid - stats.actualRepayment)
  const pending = getPendingAdvanceAmountByAccount(account, excludePid)
  return carriedRemain + stats.monthAdded + pending + extra
}

/** 本月最低還款：無舊帳→至少還本月新借；有舊帳無新借→至少 3000（不超過尚欠）；有舊帳有新借→新借+3000 */
export function computeDefaultMinRepayment(lastMonthUnpaid, monthAdded) {
  const carried = Math.max(0, Number(lastMonthUnpaid) || 0)
  const added = Math.max(0, Number(monthAdded) || 0)
  if (carried <= 0) {
    return added
  }
  if (added === 0) {
    return Math.min(ADVANCE_MIN_PAY_NO_NEW_BORROW, carried)
  }
  return added + ADVANCE_MIN_EXTRA_WHEN_CARRIED
}

/** 申請表單預覽：試算核准後總欠款、若核准後本月最低還款 */
export function getAdvanceApplicationPreview(account, proposedAmount) {
  const acc = String(account || '').trim()
  const prop = Math.max(0, Number(proposedAmount) || 0)
  const ym = advanceCurrentYearMonth()
  const stats = getAdvanceRepaymentStats(acc, ym)
  const base = getAdvanceProjectedDebtTotal(acc, ym, {})
  const projectedDebtTotal = base + prop
  const addedIfApproved = stats.monthAdded + prop
  const previewMinRepayment = computeDefaultMinRepayment(stats.lastMonthUnpaid, addedIfApproved)
  return {
    yearMonth: ym,
    lastMonthUnpaid: stats.lastMonthUnpaid,
    monthAddedNow: stats.monthAdded,
    projectedDebtTotal,
    previewMinRepayment,
    carriedRemain: Math.max(0, stats.lastMonthUnpaid - stats.actualRepayment)
  }
}

export function addAdvance({ account, amount, reason }) {
  try {
    const acc = String(account || '').trim()
    const amt = Math.max(0, Number(amount) || 0)
    if (!acc) return { success: false, message: '帳號無效' }
    if (amt <= 0) return { success: false, message: '請輸入有效金額' }
    const list = getAdvanceList()
    const id = `adv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const rec = {
      id,
      account: acc,
      amount: amt,
      reason: String(reason || '').trim(),
      status: 'pending',
      createdAt: new Date().toISOString(),
      reviewedBy: '',
      reviewedAt: null,
      transferredAt: null
    }
    list.push(rec)
    saveAdvanceList(list)
    return { success: true, id, record: rec }
  } catch (e) {
    return { success: false, message: '儲存失敗' }
  }
}

/** 管理員手動新增預支紀錄（非 APP 申請，如現金等），直接為已付款狀態並可選付款方式 */
export function addManualAdvance({ account, amount, reason, paymentMethod }) {
  try {
    const acc = String(account || '').trim()
    const amt = Math.max(0, Number(amount) || 0)
    const list = getAdvanceList()
    const id = `adv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const now = new Date().toISOString()
    const method = (paymentMethod === 'cash' || paymentMethod === 'transfer') ? paymentMethod : 'transfer'
    const rec = {
      id,
      account: acc,
      amount: amt,
      reason: String(reason || '').trim(),
      status: 'transferred',
      paymentMethod: method,
      createdAt: now,
      reviewedBy: '',
      reviewedAt: now,
      transferredAt: now
    }
    list.push(rec)
    saveAdvanceList(list)
    return { success: true, id, record: rec }
  } catch (e) {
    return { success: false, message: '儲存失敗' }
  }
}
export function rejectAdvance(id, reviewedBy = '') {
  try {
    const list = getAdvanceList()
    const idx = list.findIndex((r) => r.id === id)
    if (idx === -1) return { success: false, message: '找不到該申請' }
    list[idx] = { ...list[idx], status: 'rejected', reviewedBy: String(reviewedBy || '').trim(), reviewedAt: new Date().toISOString() }
    saveAdvanceList(list)
    return { success: true, record: list[idx] }
  } catch (e) {
    return { success: false, message: '更新失敗' }
  }
}
export function markTransferred(id, reviewedBy = '') {
  try {
    const list = getAdvanceList()
    const idx = list.findIndex((r) => r.id === id)
    if (idx === -1) return { success: false, message: '找不到該申請' }
    const now = new Date().toISOString()
    list[idx] = { ...list[idx], status: 'transferred', reviewedBy: String(reviewedBy || '').trim(), reviewedAt: list[idx].reviewedAt || now, transferredAt: now }
    saveAdvanceList(list)
    return { success: true, record: list[idx] }
  } catch (e) {
    return { success: false, message: '更新失敗' }
  }
}
export function getTotalTransferredByAccount(account) {
  const list = getAdvanceList()
  const acc = String(account || '').trim()
  return list
    .filter((r) => String(r?.account || '').trim() === acc && (r.status || '') === 'transferred')
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
}
export function getPendingCountByAccount(account) {
  const acc = String(account || '').trim()
  return getAdvanceList().filter((r) => String(r?.account || '').trim() === acc && (r.status || '') === 'pending').length
}
export function getTransferredCountByAccount(account) {
  const acc = String(account || '').trim()
  return getAdvanceList().filter((r) => String(r?.account || '').trim() === acc && (r.status || '') === 'transferred').length
}
export function getMonthlyTransferredByAccount(account) {
  const list = getAdvanceList()
  const acc = String(account || '').trim()
  const byMonth = {}
  list
    .filter((r) => String(r?.account || '').trim() === acc && (r.status || '') === 'transferred')
    .forEach((r) => {
      const dateStr = (r.transferredAt || r.reviewedAt || r.createdAt || '').slice(0, 7)
      if (dateStr) byMonth[dateStr] = (byMonth[dateStr] || 0) + (Number(r.amount) || 0)
    })
  return byMonth
}

// ---------- 預支還款紀錄（本月實際還款，依帳號與年月） ----------
function getAdvanceRepaymentsRaw() {
  try {
    const raw = localStorage.getItem(ADVANCE_REPAYMENTS_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch (e) {
    return {}
  }
}
function saveAdvanceRepayments(data) {
  try {
    const val = JSON.stringify(typeof data === 'object' && data !== null ? data : {})
    localStorage.setItem(ADVANCE_REPAYMENTS_KEY, val)
    syncKeyToSupabase(ADVANCE_REPAYMENTS_KEY, val)
  } catch (e) {}
}

function getRepaymentEntry(account, yearMonth) {
  const acc = String(account || '').trim()
  if (!acc) return null
  const map = getAdvanceRepaymentsRaw()
  const byAccount = map[acc]
  if (!byAccount || typeof byAccount !== 'object') return null
  const v = byAccount[yearMonth]
  if (v == null) return null
  if (typeof v === 'number') return { actual: v, min: undefined, balanceEnd: undefined }
  const balanceEnd = v.balanceEnd != null && v.balanceEnd !== '' ? Number(v.balanceEnd) : (v.unpaid != null && v.unpaid !== '' ? Number(v.unpaid) : undefined)
  return { actual: v.actual, min: v.min, balanceEnd }
}

/** 取得某帳號某年月的實際還款金額 */
export function getAdvanceRepayment(account, yearMonth) {
  const e = getRepaymentEntry(account, yearMonth)
  return e != null ? Math.max(0, Number(e.actual) || 0) : 0
}

/** 取得某帳號某年月的本月剩餘（存檔用於隔月顯示為上月剩餘） */
export function getAdvanceRepaymentBalanceEnd(account, yearMonth) {
  const e = getRepaymentEntry(account, yearMonth)
  if (e == null || e.balanceEnd == null) return null
  return Number(e.balanceEnd)
}

/** 取得某帳號某年月的最低還款覆寫值（無則回傳 null；0 在 getAdvanceRepaymentStats 中視同未覆寫） */
export function getAdvanceRepaymentMin(account, yearMonth) {
  const e = getRepaymentEntry(account, yearMonth)
  if (e == null || e.min == null || e.min === '') return null
  return Math.max(0, Number(e.min) || 0)
}

/** 設定某帳號某年月的還款資料；儲存時會寫入 本月剩餘 = 上月剩餘 - 本月實際，供隔月顯示為上月剩餘 */
export function setAdvanceRepayment(account, yearMonth, payload) {
  try {
    const acc = String(account || '').trim()
    const ym = String(yearMonth || '').trim()
    if (!acc || !ym) return { success: false, message: '帳號與年月必填' }
    const map = getAdvanceRepaymentsRaw()
    if (!map[acc]) map[acc] = {}
    const existing = getRepaymentEntry(acc, ym)
    const actual = payload.actual != null && payload.actual !== '' ? Math.max(0, Number(payload.actual) || 0) : (existing ? Number(existing.actual) || 0 : 0)
    const min = payload.min != null && payload.min !== '' ? Math.max(0, Number(payload.min) || 0) : (existing && existing.min != null ? Number(existing.min) : undefined)
    
    // 如果有指定上月剩餘，則存到上個月的 balanceEnd
    const prevYm = prevYearMonth(ym)
    if (payload.lastMonthUnpaid != null && payload.lastMonthUnpaid !== '' && prevYm) {
      const prevEntry = getRepaymentEntry(acc, prevYm)
      const prevActual = prevEntry ? Number(prevEntry.actual) || 0 : 0
      const prevMin = prevEntry && prevEntry.min != null ? prevEntry.min : undefined
      map[acc][prevYm] = { actual: prevActual, min: prevMin, balanceEnd: Math.max(0, Number(payload.lastMonthUnpaid) || 0) }
    }
    
    const lastMonthUnpaid = payload.lastMonthUnpaid != null && payload.lastMonthUnpaid !== '' ? Math.max(0, Number(payload.lastMonthUnpaid) || 0) : getAdvanceRepaymentStats(acc, ym).lastMonthUnpaid
    const balanceEnd = Math.max(0, lastMonthUnpaid - actual)
    map[acc][ym] = { actual, min, balanceEnd }
    saveAdvanceRepayments(map)
    return { success: true }
  } catch (e) {
    return { success: false, message: '儲存失敗' }
  }
}

function prevYearMonth(ymKey) {
  if (!ymKey || ymKey.length < 7) return ''
  const y = ymKey.slice(0, 4)
  const m = parseInt(ymKey.slice(5), 10)
  if (m <= 1) return `${Number(y) - 1}-12`
  return `${y}-${String(m - 1).padStart(2, '0')}`
}

/** 計算某帳號某年月的：上月剩餘、本月新增、本月最低還款、本月實際還款、本月剩餘（本月剩餘 = 上月剩餘 - 本月實際，隔月後本月剩餘變上月剩餘） */
export function getAdvanceRepaymentStats(account, yearMonth) {
  const acc = String(account || '').trim()
  const ym = String(yearMonth || '').trim()
  const monthlyAdded = getMonthlyTransferredByAccount(acc)
  const getAdded = (y) => Number(monthlyAdded[y] || 0)
  const getRepay = (y) => getAdvanceRepayment(acc, y)
  const getBalanceEnd = (y) => getAdvanceRepaymentBalanceEnd(acc, y)
  const getStoredMin = (y) => getAdvanceRepaymentMin(acc, y)

  const prevYm = prevYearMonth(ym)
  const allMonths = new Set(Object.keys(monthlyAdded || {}))
  const repayMap = getAdvanceRepaymentsRaw()[acc]
  if (repayMap && typeof repayMap === 'object') Object.keys(repayMap).forEach((m) => allMonths.add(m))
  if (prevYm) allMonths.add(prevYm)
  allMonths.add(ym)
  const sorted = [...allMonths].filter((m) => m.length === 7).sort()

  let balanceEnd = 0
  let lastMonthUnpaid = 0
  for (const m of sorted) {
    const stored = getBalanceEnd(m)
    const actual = getRepay(m)
    balanceEnd = stored != null ? stored : Math.max(0, balanceEnd - actual)
    if (m === prevYm) lastMonthUnpaid = balanceEnd
  }

  const monthAdded = getAdded(ym)
  const minStored = getStoredMin(ym)
  // 存檔的 min 為 0 時視同未覆寫（舊資料／誤存），仍用規則試算，與申請表單預覽一致
  const minRepayment =
    minStored != null && minStored > 0 ? minStored : computeDefaultMinRepayment(lastMonthUnpaid, monthAdded)
  const actualRepayment = getRepay(ym)
  const monthRemaining = Math.max(0, lastMonthUnpaid - actualRepayment)
  const prevMonthRepayment = prevYm ? getRepay(prevYm) : 0

  return {
    lastMonthUnpaid,
    monthAdded,
    minRepayment,
    actualRepayment,
    monthRemaining,
    /** 上個曆月實際還款金額（方便對帳） */
    prevMonthRepayment,
    /** 目前檢視的年月（YYYY-MM） */
    yearMonth: ym,
    /** 上一曆月（YYYY-MM） */
    prevYearMonth: prevYm || ''
  }
}
