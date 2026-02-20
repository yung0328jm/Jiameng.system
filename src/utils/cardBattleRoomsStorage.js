// 卡牌對戰：兩人線上房間，存於 app_data jiameng_card_battle_rooms
import { syncKeyToSupabase } from './supabaseSync'
import { getDisplayNameForAccount } from './displayName'
import { getCardById } from './cardGameStorage'
import { getInitialGameState, reduceGameState } from './cardBattleReducer'

const STORAGE_KEY = 'jiameng_card_battle_rooms'
const LAST_JOINED_KEY = 'jiameng_card_battle_last_joined'

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
  return `cb_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

const SHORT_CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
function newShortCode(existingRooms) {
  const used = new Set((existingRooms || []).map((r) => (r?.shortCode || '').toUpperCase()))
  for (let i = 0; i < 50; i++) {
    let code = ''
    for (let j = 0; j < 6; j++) {
      code += SHORT_CODE_CHARS[Math.floor(Math.random() * SHORT_CODE_CHARS.length)]
    }
    if (!used.has(code)) return code
  }
  return String(Date.now()).slice(-6)
}

export function getRooms() {
  return load().filter((r) => r?.status !== 'ended')
}

export function getRoom(roomId) {
  const id = String(roomId || '').trim()
  const rooms = load()
  return rooms.find((r) => r.id === id || (r?.shortCode || '').toUpperCase() === id.toUpperCase()) || null
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

/** 房主建立房間（帶自己的牌組） */
export function createRoom(hostAccount, hostDeck) {
  const account = String(hostAccount || '').trim()
  if (!account) return { ok: false, error: '未登入' }
  if (!hostDeck || !hostDeck.heroId || !Array.isArray(hostDeck.cardIds)) return { ok: false, error: '請選擇有效牌組' }
  const rooms = load()
  const id = newId()
  const shortCode = newShortCode(rooms)
  const room = {
    id,
    shortCode,
    host: account,
    hostName: getDisplayNameForAccount(account),
    hostDeck: { id: hostDeck.id, name: hostDeck.name, heroId: hostDeck.heroId, cardIds: hostDeck.cardIds },
    guest: null,
    guestName: null,
    guestDeck: null,
    status: 'waiting',
    gameState: null,
    updatedAt: new Date().toISOString()
  }
  rooms.push(room)
  save(rooms)
  return { ok: true, roomId: id, shortCode, room }
}

/** 加入房間（帶自己的牌組），兩人到齊即開始並產生初始 gameState */
export function joinRoom(roomIdOrShortCode, account, guestDeck) {
  const inputRaw = String(roomIdOrShortCode || '').trim().toUpperCase()
  const accountStr = String(account || '').trim()
  if (!inputRaw || !accountStr) return { ok: false, error: '房間代碼與帳號必填' }
  if (!guestDeck || !guestDeck.heroId || !Array.isArray(guestDeck.cardIds)) return { ok: false, error: '請選擇有效牌組' }
  const rooms = load()
  const idx = rooms.findIndex(
    (r) => r.id === inputRaw || r.id?.toUpperCase() === inputRaw || (r?.shortCode || '').toUpperCase() === inputRaw
  )
  if (idx === -1) return { ok: false, error: '找不到房間' }
  const r = rooms[idx]
  if (r.status !== 'waiting') return { ok: false, error: '遊戲已開始或已結束' }
  if (r.host === accountStr) return { ok: false, error: '不能加入自己開的房間，請用另一帳號加入' }
  r.guest = accountStr
  r.guestName = getDisplayNameForAccount(accountStr)
  r.guestDeck = { id: guestDeck.id, name: guestDeck.name, heroId: guestDeck.heroId, cardIds: guestDeck.cardIds }
  r.status = 'playing'
  r.gameState = getInitialGameState(r.hostDeck, r.guestDeck, getCardById)
  if (!r.gameState) {
    r.status = 'waiting'
    r.guest = null
    r.guestName = null
    r.guestDeck = null
    save(rooms)
    return { ok: false, error: '無法建立對戰狀態，請確認牌組有效' }
  }
  r.updatedAt = new Date().toISOString()
  save(rooms)
  return { ok: true, room: getRoom(r.id) }
}

/** 更新房間遊戲狀態（由當前回合方呼叫，傳入 reducer 產生的新 state） */
export function updateGameState(roomId, gameState) {
  const id = String(roomId || '').trim()
  const rooms = load()
  const idx = rooms.findIndex((r) => r.id === id)
  if (idx === -1) return { ok: false, error: '找不到房間' }
  const r = rooms[idx]
  if (r.status !== 'playing') return { ok: false, error: '對戰未進行中' }
  r.gameState = gameState
  if (gameState?.gameOver) r.status = 'ended'
  r.updatedAt = new Date().toISOString()
  save(rooms)
  return { ok: true, room: getRoom(id) }
}

/** 對房間執行一步 action 並寫回（當前回合方呼叫） */
export function dispatchRoomAction(roomId, action) {
  const room = getRoom(roomId)
  if (!room || !room.gameState) return { ok: false, error: '房間或狀態不存在' }
  const newState = reduceGameState(room.gameState, action)
  if (!newState) return { ok: false, error: '無效操作' }
  return updateGameState(roomId, newState)
}
