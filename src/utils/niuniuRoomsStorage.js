// 妞妞兩人對戰：房間、下注、依序發牌，存於 app_data jiameng_niuniu_rooms
import { syncKeyToSupabase } from './supabaseSync'
import { getDisplayNameForAccount } from './displayName'
import { getWalletBalance, subtractWalletBalance, addWalletBalance, addTransaction, getAllTransactions } from './walletStorage'
import { createDeck, shuffle, calcNiuniu, compareHands } from './niuniuStorage'

const STORAGE_KEY = 'jiameng_niuniu_rooms'
const LAST_JOINED_KEY = 'jiameng_niuniu_last_joined'

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const data = raw ? JSON.parse(raw) : {}
    return Array.isArray(data?.rooms) ? data.rooms : []
  } catch (_) {
    return []
  }
}

function save(rooms) {
  const list = Array.isArray(rooms) ? rooms : []
  const val = JSON.stringify({ rooms: list })
  localStorage.setItem(STORAGE_KEY, val)
  syncKeyToSupabase(STORAGE_KEY, val)
}

function newId() {
  return `nn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

const SHORT_CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
function newShortCode(existingRooms) {
  const used = new Set((existingRooms || []).map((r) => (r?.shortCode || '').toUpperCase()))
  for (let i = 0; i < 50; i++) {
    let code = ''
    for (let j = 0; j < 5; j++) {
      code += SHORT_CODE_CHARS[Math.floor(Math.random() * SHORT_CODE_CHARS.length)]
    }
    if (!used.has(code)) return code
  }
  return String(Date.now()).slice(-5)
}

export function getRooms() {
  return load().filter((r) => r?.status !== 'ended')
}

export function getRoom(roomId) {
  const id = String(roomId || '').trim()
  return load().find((r) => r.id === id) || null
}

export function saveLastJoined(roomId, shortCode) {
  try {
    localStorage.setItem(LAST_JOINED_KEY, JSON.stringify({ roomId: String(roomId || ''), shortCode: String(shortCode || '') }))
  } catch (_) {}
}

export function getLastJoined() {
  try {
    const raw = localStorage.getItem(LAST_JOINED_KEY)
    const data = raw ? JSON.parse(raw) : null
    if (data?.roomId) return { roomId: data.roomId, shortCode: data.shortCode || '' }
  } catch (_) {}
  return null
}

/** 房主建立房間 */
export function createRoom(hostAccount, betAmount = 1) {
  const account = String(hostAccount || '').trim()
  if (!account) return { ok: false, error: '未登入' }
  const bet = Math.max(1, Math.floor(Number(betAmount) || 1))
  if (getWalletBalance(account) < bet) {
    return { ok: false, error: `佳盟幣不足（需 ${bet}），無法建立該下注房間` }
  }
  const rooms = load()
  const id = newId()
  const shortCode = newShortCode(rooms)
  const room = {
    id,
    shortCode,
    host: account,
    hostName: getDisplayNameForAccount(account),
    players: [{ account, name: getDisplayNameForAccount(account) }],
    betAmount: bet,
    status: 'waiting',
    deck: [],
    dealIndex: 0,
    result0: null,
    result1: null,
    winner: null,
    pool: 0,
    distributed: false,
    updatedAt: new Date().toISOString()
  }
  rooms.push(room)
  save(rooms)
  return { ok: true, roomId: id, room }
}

/** 加入房間 */
export function joinRoom(roomIdOrShortCode, account) {
  const inputRaw = String(roomIdOrShortCode || '').trim()
  const inputUpper = inputRaw.toUpperCase()
  const accountStr = String(account || '').trim()
  if (!inputRaw || !accountStr) return { ok: false, error: '房間代碼與帳號必填' }
  const rooms = load()
  const idx = rooms.findIndex((r) =>
    r.id === inputRaw ||
    r.id?.toUpperCase() === inputUpper ||
    (r?.shortCode || '').toUpperCase() === inputUpper
  )
  if (idx === -1) return { ok: false, error: '找不到房間' }
  const r = rooms[idx]
  if (r.status !== 'waiting') return { ok: false, error: '遊戲已開始' }
  const bet = r.betAmount ?? 1
  if (getWalletBalance(accountStr) < bet) {
    return { ok: false, error: `佳盟幣不足（此房間需 ${bet} 佳盟幣），無法加入` }
  }
  if (r.players.some((p) => p.account === accountStr)) return { ok: true, room: r }
  r.players.push({ account: accountStr, name: getDisplayNameForAccount(accountStr) })
  r.updatedAt = new Date().toISOString()
  save(rooms)
  return { ok: true, room: r }
}

/** 房主開始遊戲：兩人各扣 betAmount，洗牌並取 10 張，進入發牌流程 */
export function startGame(roomId) {
  const id = String(roomId || '').trim()
  const rooms = load()
  const idx = rooms.findIndex((r) => r.id === id)
  if (idx === -1) return { ok: false, error: '找不到房間' }
  const r = rooms[idx]
  if (r.status !== 'waiting') return { ok: false, error: '已開始' }
  if (r.players?.length !== 2) return { ok: false, error: '需 2 人才能開始' }
  const bet = r.betAmount ?? 1
  for (const p of r.players) {
    if (getWalletBalance(p.account) < bet) {
      return { ok: false, error: `有玩家佳盟幣不足（需 ${bet} 佳盟幣），無法開始` }
    }
  }
  for (const p of r.players) {
    const sub = subtractWalletBalance(p.account, bet)
    if (!sub.success) return { ok: false, error: sub.message || '扣除佳盟幣失敗' }
  }
  const fullDeck = shuffle(createDeck())
  r.deck = fullDeck.slice(0, 10)
  r.dealIndex = 0
  r.status = 'dealing'
  r.pool = bet * 2
  r.result0 = null
  r.result1 = null
  r.winner = null
  r.revealReady = {}
  r.distributed = false
  r.updatedAt = new Date().toISOString()
  save(rooms)
  return { ok: true, room: r }
}

/** 發牌推進：每次多發一張（輪流給玩家0、玩家1）。dealIndex 到 10 時進入「攤開」階段，不直接結束 */
export function advanceDeal(roomId) {
  const id = String(roomId || '').trim()
  const rooms = load()
  const idx = rooms.findIndex((r) => r.id === id)
  if (idx === -1) return { ok: false }
  const r = rooms[idx]
  if (r.status !== 'dealing' || !r.deck || r.deck.length < 10) return { ok: false }
  let dealIndex = Math.min(r.dealIndex ?? 0, 10)
  if (dealIndex < 10) {
    dealIndex += 1
    r.dealIndex = dealIndex
    r.updatedAt = new Date().toISOString()
    save(rooms)
  }
  if (dealIndex >= 10) {
    const [p0, p1] = r.players || []
    if (!p0 || !p1) return { ok: true }
    const d = r.deck
    const cards0 = [d[0], d[2], d[4], d[6], d[8]]
    const cards1 = [d[1], d[3], d[5], d[7], d[9]]
    r.result0 = calcNiuniu(cards0)
    r.result1 = calcNiuniu(cards1)
    const cmp = compareHands(r.result0, r.result1)
    r.winner = cmp === 'win' ? p0.account : cmp === 'lose' ? p1.account : null
    r.status = 'reveal'
    r.revealReady = r.revealReady || {}
    r.updatedAt = new Date().toISOString()
    save(rooms)
  }
  return { ok: true, room: getRoom(id) }
}

/** 玩家按「攤開」：兩人皆攤開後才結算並派獎 */
export function setRevealReady(roomId, account) {
  const id = String(roomId || '').trim()
  const accountStr = String(account || '').trim()
  if (!id || !accountStr) return { ok: false, error: '參數錯誤' }
  const rooms = load()
  const idx = rooms.findIndex((r) => r.id === id)
  if (idx === -1) return { ok: false, error: '找不到房間' }
  const r = rooms[idx]
  if (r.status !== 'reveal') return { ok: false, error: '未在攤開階段' }
  if (!r.players?.some((p) => p.account === accountStr)) return { ok: false, error: '你不在這間房間' }
  r.revealReady = r.revealReady || {}
  r.revealReady[accountStr] = true
  r.updatedAt = new Date().toISOString()
  const bothReady = r.players.every((p) => r.revealReady[p.account])
  if (bothReady) {
    r.status = 'ended'
    distributePrize(r, id)
  }
  save(rooms)
  return { ok: true, room: getRoom(id) }
}

function distributePrize(r, roomId) {
  if (r.distributed) return
  const alreadyPaid = (getAllTransactions() || []).some(
    (t) => t.from === 'niuniu' && t.roomId === roomId
  )
  if (alreadyPaid) {
    r.distributed = true
    return
  }
  r.distributed = true
  if (r.winner && r.pool > 0) {
    addWalletBalance(r.winner, r.pool)
    addTransaction({
      from: 'niuniu',
      to: r.winner,
      amount: r.pool,
      description: '妞妞對戰獲勝',
      roomId
    })
  } else if (r.pool > 0 && r.players?.length === 2) {
    const bet = r.pool / 2
    addWalletBalance(r.players[0].account, bet)
    addWalletBalance(r.players[1].account, bet)
    addTransaction({ from: 'niuniu', to: r.players[0].account, amount: bet, description: '妞妞和局退注', roomId })
    addTransaction({ from: 'niuniu', to: r.players[1].account, amount: bet, description: '妞妞和局退注', roomId })
  }
}

/** 房主解散房間 */
export function disbandRoom(roomId, account) {
  const id = String(roomId || '').trim()
  const accountStr = String(account || '').trim()
  if (!id || !accountStr) return { ok: false, error: '參數錯誤' }
  const rooms = load()
  const idx = rooms.findIndex((r) => r.id === id)
  if (idx === -1) return { ok: false, error: '找不到房間' }
  const r = rooms[idx]
  if (r.host !== accountStr) return { ok: false, error: '僅房主可解散房間' }
  rooms.splice(idx, 1)
  save(rooms)
  return { ok: true }
}

/** 依 dealIndex 取得目前兩家已發出的牌。deck[i] 屬於玩家 i % 2 */
export function getDealtCards(room) {
  if (!room?.deck || room.deck.length < 10) return { cards0: [], cards1: [] }
  const idx = Math.min(room.dealIndex ?? 0, 10)
  const cards0 = []
  const cards1 = []
  for (let i = 0; i < idx; i++) {
    if (i % 2 === 0) cards0.push(room.deck[i])
    else cards1.push(room.deck[i])
  }
  return { cards0, cards1 }
}

/** 取得雙方完整 5 張（發完後）。用於攤開後顯示 */
export function getFullHands(room) {
  if (!room?.deck || room.deck.length < 10) return { cards0: [], cards1: [] }
  const d = room.deck
  return {
    cards0: [d[0], d[2], d[4], d[6], d[8]],
    cards1: [d[1], d[3], d[5], d[7], d[9]]
  }
}
