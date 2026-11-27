import { syncKeyToSupabase } from './supabaseSync'
import { addWalletBalance, addTransaction } from './walletStorage'
import { addManualAdvance } from './storage'

export const PAY_METHODS = {
  advance: '借支',
  transfer: '轉帳',
  cash: '現金'
}

export const COIN_PACKAGES_KEY = 'jiameng_coin_packages'
export const COIN_PURCHASES_KEY = 'jiameng_coin_purchases'

const DEFAULT_PACKAGES = [
  { id: 'pkg_10', coins: 10, price: 100 },
  { id: 'pkg_50', coins: 50, price: 450 },
  { id: 'pkg_100', coins: 100, price: 800 }
]

function persist(key, data) {
  const val = JSON.stringify(data)
  localStorage.setItem(key, val)
  syncKeyToSupabase(key, val)
}

function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function getCoinPackages() {
  try {
    const raw = localStorage.getItem(COIN_PACKAGES_KEY)
    const list = raw ? JSON.parse(raw) : null
    if (Array.isArray(list) && list.length) {
      return list
        .map((row) => ({
          id: String(row?.id || ''),
          coins: Math.max(1, Math.floor(Number(row?.coins) || 0)),
          price: Math.max(0, Math.floor(Number(row?.price) || 0))
        }))
        .filter((row) => row.id && row.coins > 0)
    }
    persist(COIN_PACKAGES_KEY, DEFAULT_PACKAGES)
    return DEFAULT_PACKAGES
  } catch (_) {
    return DEFAULT_PACKAGES
  }
}

export function saveCoinPackages(list) {
  const next = (Array.isArray(list) ? list : [])
    .map((row) => ({
      id: String(row?.id || genId('pkg')),
      coins: Math.max(1, Math.floor(Number(row?.coins) || 0)),
      price: Math.max(0, Math.floor(Number(row?.price) || 0))
    }))
    .filter((row) => row.coins > 0)
  persist(COIN_PACKAGES_KEY, next)
  return { success: true, packages: next }
}

export function getCoinPurchases() {
  try {
    const raw = localStorage.getItem(COIN_PURCHASES_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch (_) {
    return []
  }
}

function savePurchases(list) {
  persist(COIN_PURCHASES_KEY, Array.isArray(list) ? list : [])
}

export function getUserCoinPurchases(username) {
  const u = String(username || '')
  return getCoinPurchases()
    .filter((row) => String(row?.username || '') === u)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
}

export function getPendingCoinPurchases() {
  return getCoinPurchases().filter((row) => row?.status === 'pending')
}

export function createCoinPurchase({ username, packageId, coins, price, note, payMethod }) {
  const user = String(username || '').trim()
  const c = Math.max(1, Math.floor(Number(coins) || 0))
  const p = Math.max(0, Math.floor(Number(price) || 0))
  const method = PAY_METHODS[payMethod] ? payMethod : ''
  if (!user) return { success: false, message: '請先登入' }
  if (c < 1) return { success: false, message: '方案無效' }
  if (!method) return { success: false, message: '請選擇付款方式：借支、轉帳或現金' }
  const pendingSame = getPendingCoinPurchases().some(
    (row) => String(row.username) === user && String(row.packageId || '') === String(packageId || '')
  )
  if (pendingSame) return { success: false, message: '此方案已有待審核申請，請等管理員處理' }
  const row = {
    id: genId('buy'),
    username: user,
    packageId: String(packageId || ''),
    coins: c,
    price: p,
    payMethod: method,
    note: String(note || '').trim().slice(0, 80),
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  savePurchases([...getCoinPurchases(), row])
  return { success: true, request: row }
}

export function approveCoinPurchase(requestId, reviewer) {
  const list = getCoinPurchases()
  const idx = list.findIndex((row) => row?.id === requestId)
  if (idx < 0) return { success: false, message: '找不到這筆申請' }
  const row = list[idx]
  if (row.status !== 'pending') return { success: false, message: '這筆申請已處理' }
  const coins = Math.max(1, Math.floor(Number(row.coins) || 0))
  const add = addWalletBalance(row.username, coins)
  if (!add.success) return { success: false, message: add.message || '發放毓承幣失敗' }
  const method = PAY_METHODS[row.payMethod] ? row.payMethod : 'transfer'
  const price = Math.max(0, Math.floor(Number(row.price) || 0))
  let advanceId = row.advanceId || ''
  if (method === 'advance' && price > 0) {
    const adv = addManualAdvance({
      account: row.username,
      amount: price,
      reason: `購幣借支 ${coins} 毓承幣`,
      paymentMethod: 'transfer'
    })
    if (!adv.success) return { success: false, message: adv.message || '寫入借支失敗' }
    advanceId = adv.id || ''
  }
  addTransaction({
    type: 'coin_purchase',
    from: 'system',
    to: row.username,
    amount: coins,
    description: `購幣核准 ${coins} 毓承幣（${PAY_METHODS[method]} NT$${price}）`
  })
  list[idx] = {
    ...row,
    payMethod: method,
    advanceId,
    status: 'approved',
    reviewedBy: String(reviewer || ''),
    reviewedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  savePurchases(list)
  return { success: true }
}

export function rejectCoinPurchase(requestId, reviewer) {
  const list = getCoinPurchases()
  const idx = list.findIndex((row) => row?.id === requestId)
  if (idx < 0) return { success: false, message: '找不到這筆申請' }
  const row = list[idx]
  if (row.status !== 'pending') return { success: false, message: '這筆申請已處理' }
  list[idx] = {
    ...row,
    status: 'rejected',
    reviewedBy: String(reviewer || ''),
    reviewedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  savePurchases(list)
  return { success: true }
}
