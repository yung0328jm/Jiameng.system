import { syncKeyToSupabase } from './supabaseSync'
import { attachLiveFish } from './petStorage'
import { addTransaction, addWalletBalance, getWalletBalance, subtractWalletBalance } from './walletStorage'

export const AUCTION_STORAGE_KEY = 'jiameng_auctions'

const persist = (rows) => {
  const val = JSON.stringify(rows)
  localStorage.setItem(AUCTION_STORAGE_KEY, val)
  syncKeyToSupabase(AUCTION_STORAGE_KEY, val)
}

export function getAuctions() {
  try {
    const data = localStorage.getItem(AUCTION_STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch (e) {
    return []
  }
}

export function getAuction(id) {
  return getAuctions().find((a) => a.id === id) || null
}

export function minNextBid(auction) {
  const reserve = Math.max(1, Math.floor(Number(auction?.reserve) || 1))
  const current = Math.floor(Number(auction?.currentBid) || 0)
  if (!auction?.currentBidder || current <= 0) return reserve
  return current + 1
}

export function availableBidBalance(username, auction) {
  const bal = getWalletBalance(username)
  if (auction?.status === 'live' && auction?.currentBidder === username) {
    return bal + Math.floor(Number(auction.currentBid) || 0)
  }
  return bal
}

function remainMs(auction, now = Date.now()) {
  return Math.max(0, Date.parse(auction?.endsAt || '') - now)
}

export function formatAuctionRemain(ms) {
  const s = Math.max(0, Math.floor(Number(ms) || 0))
  const d = Math.floor(s / 86400000)
  const h = Math.floor((s % 86400000) / 3600000)
  const m = Math.floor((s % 3600000) / 60000)
  const sec = Math.floor((s % 60000) / 1000)
  if (d > 0) return `${d}日${h}時${m}分`
  if (h > 0) return `${h}時${m}分`
  if (m > 0) return `${m}分${sec}秒`
  return `${sec}秒`
}

function settleOne(auction, now) {
  if (!auction || auction.status !== 'live') return auction
  if (now < Date.parse(auction.endsAt || '')) return auction
  const bid = Math.floor(Number(auction.currentBid) || 0)
  const winner = String(auction.currentBidder || '').trim()
  if (winner && bid > 0) {
    addWalletBalance(auction.seller, bid)
    addTransaction({
      type: 'auction',
      from: winner,
      to: auction.seller,
      amount: bid,
      description: `競拍得標 ${auction.itemName}`
    })
    attachLiveFish(winner, auction.pet)
    return {
      ...auction,
      status: 'sold',
      buyer: winner,
      completedAt: new Date(now).toISOString()
    }
  }
  attachLiveFish(auction.seller, auction.pet)
  return {
    ...auction,
    status: 'unsold',
    completedAt: new Date(now).toISOString()
  }
}

export function settleEndedAuctions() {
  const now = Date.now()
  const rows = getAuctions()
  let dirty = false
  const next = rows.map((row) => {
    if (row.status !== 'live') return row
    if (now < Date.parse(row.endsAt || '')) return row
    dirty = true
    return settleOne(row, now)
  })
  if (dirty) persist(next)
  return next
}

export function getLiveAuctions() {
  return settleEndedAuctions()
    .filter((a) => a.status === 'live')
    .sort((a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt))
}

export function createAuction({ seller, pet, itemName, reserve, hours }) {
  const user = String(seller || '').trim()
  if (!user || !pet) return { success: false, message: '資料不完整' }
  const floor = Math.floor(Number(reserve) || 0)
  if (!Number.isFinite(floor) || floor < 1) return { success: false, message: '請設定有效底價' }
  const durH = Math.floor(Number(hours) || 0)
  if (!Number.isFinite(durH) || durH < 1 || durH > 168) {
    return { success: false, message: '競拍時間請設 1 至 168 小時' }
  }
  const now = Date.now()
  const row = {
    id: `auc_${now}_${Math.random().toString(36).slice(2, 9)}`,
    seller: user,
    pet,
    itemName: String(itemName || '魚').trim() || '魚',
    reserve: floor,
    currentBid: 0,
    currentBidder: '',
    bids: [],
    hours: durH,
    endsAt: new Date(now + durH * 3600 * 1000).toISOString(),
    status: 'live',
    createdAt: new Date(now).toISOString(),
    completedAt: null,
    buyer: ''
  }
  persist([...getAuctions(), row])
  return { success: true, auction: row }
}

export function placeBid(auctionId, username, amount) {
  const user = String(username || '').trim()
  if (!user) return { success: false, message: '請先登入' }
  const rows = settleEndedAuctions()
  const i = rows.findIndex((a) => a.id === auctionId)
  if (i < 0) return { success: false, message: '競拍不存在' }
  const auc = rows[i]
  if (auc.status !== 'live') return { success: false, message: '競拍已結束' }
  if (Date.now() >= Date.parse(auc.endsAt || '')) {
    persist(rows.map((row, idx) => (idx === i ? settleOne(row, Date.now()) : row)))
    return { success: false, message: '競拍已結束' }
  }
  if (auc.seller === user) return { success: false, message: '不能喊自己的魚' }
  const bid = Math.floor(Number(amount) || 0)
  const need = minNextBid(auc)
  if (bid < need) return { success: false, message: `至少要喊 ${need} 佳盟幣` }
  const avail = availableBidBalance(user, auc)
  if (avail < bid) return { success: false, message: '佳盟幣不足，無法喊價' }

  if (auc.currentBidder === user) {
    const delta = bid - Math.floor(Number(auc.currentBid) || 0)
    const pay = subtractWalletBalance(user, delta)
    if (!pay.success) return { success: false, message: pay.message || '佳盟幣不足，無法喊價' }
  } else {
    const pay = subtractWalletBalance(user, bid)
    if (!pay.success) return { success: false, message: pay.message || '佳盟幣不足，無法喊價' }
    if (auc.currentBidder) addWalletBalance(auc.currentBidder, Math.floor(Number(auc.currentBid) || 0))
  }

  const next = {
    ...auc,
    currentBid: bid,
    currentBidder: user,
    bids: [...(auc.bids || []), { user, amount: bid, at: new Date().toISOString() }].slice(-40)
  }
  const all = [...rows]
  all[i] = next
  persist(all)
  return { success: true, auction: next }
}

export function cancelAuction(auctionId, username) {
  const rows = settleEndedAuctions()
  const i = rows.findIndex((a) => a.id === auctionId)
  if (i < 0) return { success: false, message: '競拍不存在' }
  const auc = rows[i]
  if (auc.seller !== username) return { success: false, message: '只能取消自己的競拍' }
  if (auc.status !== 'live') return { success: false, message: '競拍已結束' }
  if (auc.currentBidder) return { success: false, message: '已有人喊價，不能取消' }
  attachLiveFish(auc.seller, auc.pet)
  const all = [...rows]
  all[i] = { ...auc, status: 'cancelled', completedAt: new Date().toISOString() }
  persist(all)
  return { success: true }
}

export function auctionRemain(auction) {
  return remainMs(auction)
}
