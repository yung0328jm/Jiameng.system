// 猜拳兩人對戰：五戰三勝，佳盟幣下注，存於 app_data jiameng_rps_rooms
import { syncKeyToSupabase } from './supabaseSync'
import { getDisplayNameForAccount } from './displayName'
import { getWalletBalance, subtractWalletBalance, addWalletBalance, addTransaction, getAllTransactions } from './walletStorage'

const STORAGE_KEY = 'jiameng_rps_rooms'
const LAST_JOINED_KEY = 'jiameng_rps_last_joined'
const WIN_THRESHOLD = 3

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
  return `rps_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
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

/** 判定單局贏家：rock>scissors, paper>rock, scissors>paper，平手 null */
function roundWinner(choice1, choice2) {
  if (!choice1 || !choice2) return null
  if (choice1 === choice2) return null
  if (choice1 === 'rock' && choice2 === 'scissors') return 1
  if (choice1 === 'rock' && choice2 === 'paper') return 2
  if (choice1 === 'paper' && choice2 === 'rock') return 1
  if (choice1 === 'paper' && choice2 === 'scissors') return 2
  if (choice1 === 'scissors' && choice2 === 'paper') return 1
  if (choice1 === 'scissors' && choice2 === 'rock') return 2
  return null
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
    return { ok: false, error: `佳盟幣不足（需 ${bet}，目前 ${getWalletBalance(account)}），無法建立該下注房間` }
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
    round: 1,
    choices: {},
    roundResults: [],
    scores: [0, 0],
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
  if (r.players.length >= 2) return { ok: false, error: '房間已滿' }
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

/** 房主開始遊戲：兩人各扣 betAmount */
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
  r.status = 'playing'
  r.pool = bet * 2
  r.round = 1
  r.choices = {}
  r.roundResults = []
  r.scores = [0, 0]
  r.winner = null
  r.updatedAt = new Date().toISOString()
  save(rooms)
  return { ok: true, room: r }
}

/** 出拳：choice = 'rock' | 'paper' | 'scissors' */
export function submitChoice(roomId, account, choice) {
  const id = String(roomId || '').trim()
  const accountStr = String(account || '').trim()
  const c = String(choice || '').toLowerCase()
  if (!id || !accountStr) return { ok: false, error: '參數錯誤' }
  if (!['rock', 'paper', 'scissors'].includes(c)) return { ok: false, error: '請出 石頭／剪刀／布' }
  const rooms = load()
  const idx = rooms.findIndex((r) => r.id === id)
  if (idx === -1) return { ok: false, error: '找不到房間' }
  const r = rooms[idx]
  if (r.status !== 'playing') return { ok: false, error: '未在遊戲中' }
  if (!r.players.some((p) => p.account === accountStr)) return { ok: false, error: '你不在這間房間' }
  r.choices = r.choices || {}
  if (r.choices[accountStr] != null) return { ok: false, error: '本局已出拳' }
  r.choices[accountStr] = c
  r.updatedAt = new Date().toISOString()
  save(rooms)
  return { ok: true, room: r }
}

/** 結算當前回合（當兩人都出拳後由任一玩家或定時觸發） */
export function resolveRound(roomId) {
  const id = String(roomId || '').trim()
  const rooms = load()
  const idx = rooms.findIndex((r) => r.id === id)
  if (idx === -1) return { ok: false }
  const r = rooms[idx]
  if (r.status !== 'playing') return { ok: false }
  const [p0, p1] = r.players || []
  if (!p0 || !p1) return { ok: false }
  const c0 = r.choices?.[p0.account]
  const c1 = r.choices?.[p1.account]
  if (c0 == null || c1 == null) return { ok: false }
  const winnerIndex = roundWinner(c0, c1)
  r.roundResults = r.roundResults || []
  r.roundResults.push({
    round: r.round,
    choice0: c0,
    choice1: c1,
    winnerIndex
  })
  if (winnerIndex === 1) r.scores[0] = (r.scores[0] || 0) + 1
  if (winnerIndex === 2) r.scores[1] = (r.scores[1] || 0) + 1
  r.choices = {}
  const s0 = r.scores[0] || 0
  const s1 = r.scores[1] || 0
  if (s0 >= WIN_THRESHOLD || s1 >= WIN_THRESHOLD) {
    r.status = 'ended'
    r.winner = s0 >= WIN_THRESHOLD ? p0.account : p1.account
    distributePrize(r, id)
  } else {
    r.round += 1
  }
  r.updatedAt = new Date().toISOString()
  save(rooms)
  return { ok: true, room: r }
}

function distributePrize(r, roomId) {
  if (r.distributed || !r.winner || r.pool <= 0) return
  const alreadyPaid = (getAllTransactions() || []).some(
    (t) => t.from === 'rps' && t.roomId === roomId
  )
  if (alreadyPaid) {
    r.distributed = true
    return
  }
  r.distributed = true
  addWalletBalance(r.winner, r.pool)
  addTransaction({
    from: 'rps',
    to: r.winner,
    amount: r.pool,
    description: '猜拳五戰三勝獲勝',
    roomId
  })
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

export const CHOICE_LABELS = { rock: '石頭', paper: '布', scissors: '剪刀' }
