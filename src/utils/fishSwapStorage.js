import { isGuestAccount } from './guestAuth'
import { attachLiveFish, canTradeTankFish, getTankRoster, removeLiveFish } from './petStorage'
import { syncKeyToSupabase } from './supabaseSync'

export const FISH_SWAP_STORAGE_KEY = 'jiameng_fish_swaps'

const persist = (rows) => {
  const val = JSON.stringify(rows)
  localStorage.setItem(FISH_SWAP_STORAGE_KEY, val)
  syncKeyToSupabase(FISH_SWAP_STORAGE_KEY, val)
}

export function getFishSwaps() {
  try {
    const data = localStorage.getItem(FISH_SWAP_STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch (e) {
    return []
  }
}

export function getFishSwap(id) {
  return getFishSwaps().find((row) => row.id === id) || null
}

export function getOpenFishSwaps(viewer) {
  const me = String(viewer || '').trim()
  return getFishSwaps()
    .filter((row) => row.status === 'open')
    .filter((row) => {
      const seller = String(row.seller || '')
      if (isGuestAccount(seller) && seller !== me) return false
      if (isGuestAccount(me) && seller !== me) return false
      return true
    })
    .sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''))
}

export function createFishSwap({ seller, pet, itemName }) {
  const user = String(seller || '').trim()
  if (!user || !pet) return { success: false, message: '資料不完整' }
  const species = String(pet.species || '').trim()
  if (!species) return { success: false, message: '魚種不明' }
  const now = Date.now()
  const row = {
    id: `swap_${now}_${Math.random().toString(36).slice(2, 9)}`,
    seller: user,
    pet,
    species,
    itemName: String(itemName || '魚').trim() || '魚',
    status: 'open',
    createdAt: new Date(now).toISOString(),
    taker: '',
    offerPet: null,
    completedAt: null
  }
  persist([...getFishSwaps(), row])
  return { success: true, swap: row }
}

export function cancelFishSwap(swapId, username) {
  const user = String(username || '').trim()
  if (!user) return { success: false, message: '請先登入' }
  const rows = getFishSwaps()
  const i = rows.findIndex((row) => row.id === swapId)
  if (i < 0) return { success: false, message: '找不到這筆交換' }
  const row = rows[i]
  if (row.status !== 'open') return { success: false, message: '這筆交換已結束' }
  if (row.seller !== user) return { success: false, message: '只能取消自己掛上的魚' }
  attachLiveFish(user, row.pet)
  const next = [...rows]
  next[i] = {
    ...row,
    status: 'cancelled',
    completedAt: new Date().toISOString()
  }
  persist(next)
  return { success: true, swap: next[i] }
}

export function acceptFishSwap(swapId, username, slotId) {
  const user = String(username || '').trim()
  if (!user) return { success: false, message: '請先登入' }
  const rows = getFishSwaps()
  const i = rows.findIndex((row) => row.id === swapId)
  if (i < 0) return { success: false, message: '找不到這筆交換' }
  const row = rows[i]
  if (row.status !== 'open') return { success: false, message: '這筆交換已結束' }
  if (row.seller === user) return { success: false, message: '不能跟自己交換' }
  const offer = getTankRoster(user).find((f) => f.id === slotId)
  if (!offer) return { success: false, message: '請選擇要拿來換的魚' }
  if (!canTradeTankFish(offer)) return { success: false, message: '請選擇要拿來換的魚' }
  if (String(offer.key || '') !== String(row.species || '')) {
    return { success: false, message: '只能用同一種類的魚交換' }
  }
  const removed = removeLiveFish(user, offer.id)
  if (!removed.success) return removed
  const toTaker = attachLiveFish(user, row.pet)
  if (!toTaker.success) {
    attachLiveFish(user, removed.snapshot)
    return { success: false, message: toTaker.message || '交換失敗，魚已放回' }
  }
  const toSeller = attachLiveFish(row.seller, removed.snapshot)
  if (!toSeller.success) {
    attachLiveFish(user, removed.snapshot)
    attachLiveFish(row.seller, row.pet)
    return { success: false, message: toSeller.message || '交換失敗，雙方魚已退回' }
  }
  const next = [...rows]
  next[i] = {
    ...row,
    status: 'done',
    taker: user,
    offerPet: removed.snapshot,
    completedAt: new Date().toISOString()
  }
  persist(next)
  return { success: true, swap: next[i] }
}
