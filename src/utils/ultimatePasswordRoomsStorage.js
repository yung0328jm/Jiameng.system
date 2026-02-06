// 終極密碼多人房間：存於 app_data jiameng_up_rooms，與 Supabase 同步
import { syncKeyToSupabase } from './supabaseSync'
import { getDisplayNameForAccount } from './displayName'

const STORAGE_KEY = 'jiameng_up_rooms'

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
  return `up_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function getRooms() {
  return load().filter((r) => r?.status !== 'ended')
}

export function getRoom(roomId) {
  const id = String(roomId || '').trim()
  return load().find((r) => r.id === id) || null
}

/** 房主建立房間；密碼由房主端產生，不寫入此 storage */
export function createRoom(hostAccount) {
  const account = String(hostAccount || '').trim()
  if (!account) return { ok: false, error: '未登入' }
  const rooms = load()
  const id = newId()
  const room = {
    id,
    host: account,
    hostName: getDisplayNameForAccount(account),
    low: 1,
    high: 100,
    players: [{ account, name: getDisplayNameForAccount(account) }],
    currentIndex: 0,
    status: 'waiting',
    history: [],
    lastGuess: null,
    loser: null,
    updatedAt: new Date().toISOString()
  }
  rooms.push(room)
  save(rooms)
  return { ok: true, roomId: id, room }
}

/** 加入房間 */
export function joinRoom(roomId, account) {
  const id = String(roomId || '').trim()
  const accountStr = String(account || '').trim()
  if (!id || !accountStr) return { ok: false, error: '房間代碼與帳號必填' }
  const rooms = load()
  const idx = rooms.findIndex((r) => r.id === id)
  if (idx === -1) return { ok: false, error: '找不到房間' }
  const r = rooms[idx]
  if (r.status !== 'waiting') return { ok: false, error: '遊戲已開始' }
  if (r.players.some((p) => p.account === accountStr)) return { ok: true, room: r }
  r.players.push({ account: accountStr, name: getDisplayNameForAccount(accountStr) })
  r.updatedAt = new Date().toISOString()
  save(rooms)
  return { ok: true, room: r }
}

/** 房主開始遊戲（不存密碼，密碼只在房主端） */
export function startRoom(roomId) {
  const id = String(roomId || '').trim()
  const rooms = load()
  const idx = rooms.findIndex((r) => r.id === id)
  if (idx === -1) return { ok: false, error: '找不到房間' }
  const r = rooms[idx]
  if (r.status !== 'waiting') return { ok: false, error: '已開始' }
  r.status = 'playing'
  r.low = 1
  r.high = 100
  r.currentIndex = 0
  r.history = []
  r.lastGuess = null
  r.updatedAt = new Date().toISOString()
  save(rooms)
  return { ok: true, room: r }
}

/** 提交猜測：只寫入 lastGuess，由房主端 processLastGuess 計算結果並更新房間 */
export function submitGuess(roomId, account, number) {
  const id = String(roomId || '').trim()
  const accountStr = String(account || '').trim()
  const num = parseInt(number, 10)
  if (!id || !accountStr || Number.isNaN(num) || num < 1 || num > 100) return { ok: false, error: '無效輸入' }
  const rooms = load()
  const idx = rooms.findIndex((r) => r.id === id)
  if (idx === -1) return { ok: false, error: '找不到房間' }
  const r = rooms[idx]
  if (r.status !== 'playing') return { ok: false, error: '未在遊戲中' }
  const current = r.players[r.currentIndex]
  if (!current || current.account !== accountStr) return { ok: false, error: '還沒輪到你' }
  if (r.lastGuess) return { ok: false, error: '請等房主處理上一個猜測' }
  r.lastGuess = { account: accountStr, name: getDisplayNameForAccount(accountStr), number: num }
  r.updatedAt = new Date().toISOString()
  save(rooms)
  return { ok: true }
}

/** 房主處理 lastGuess：傳入房主看到的房間與密碼，計算後寫回 */
export function processLastGuess(roomId, secret, currentRoom) {
  const id = String(roomId || '').trim()
  const num = parseInt(secret, 10)
  if (!id || Number.isNaN(num) || num < 1 || num > 100) return { ok: false }
  const rooms = load()
  const idx = rooms.findIndex((r) => r.id === id)
  if (idx === -1) return { ok: false }
  const r = rooms[idx]
  const lg = r.lastGuess
  if (!lg) return { ok: false }
  const guessNum = lg.number
  r.history = r.history || []
  r.history.push({ account: lg.account, name: lg.name, number: guessNum, result: null })
  const lastHist = r.history[r.history.length - 1]
  if (guessNum === num) {
    lastHist.result = 'lose'
    r.status = 'ended'
    r.loser = lg.account
  } else if (guessNum < num) {
    lastHist.result = 'too_small'
    r.low = Math.max(r.low, guessNum + 1)
    r.currentIndex = (r.currentIndex + 1) % r.players.length
  } else {
    lastHist.result = 'too_big'
    r.high = Math.min(r.high, guessNum - 1)
    r.currentIndex = (r.currentIndex + 1) % r.players.length
  }
  r.lastGuess = null
  r.updatedAt = new Date().toISOString()
  save(rooms)
  return { ok: true, room: r }
}
