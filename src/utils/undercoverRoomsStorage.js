// 誰是臥底：存於 app_data jiameng_undercover_rooms，與 Supabase 同步
import { syncKeyToSupabase } from './supabaseSync'
import { getDisplayNameForAccount } from './displayName'
import { getWalletBalance, subtractWalletBalance, addWalletBalance, addTransaction, getAllTransactions } from './walletStorage'

const STORAGE_KEY = 'jiameng_undercover_rooms'
const LAST_JOINED_KEY = 'jiameng_undercover_last_joined'

// 平民詞 vs 臥底詞（相似的詞組）
const WORD_PAIRS = [
  ['西瓜', '冬瓜'],
  ['奶茶', '咖啡'],
  ['老師', '學生'],
  ['醫生', '護士'],
  ['警察', '小偷'],
  ['玫瑰', '月季'],
  ['香皂', '肥皂'],
  ['唇膏', '口紅'],
  ['蝴蝶', '蜜蜂'],
  ['饅頭', '包子'],
  ['香蕉', '芭蕉'],
  ['水餃', '餛飩'],
  ['元宵', '湯圓'],
  ['老虎', '獅子'],
  ['橘子', '柳丁'],
  ['鴨子', '鵝'],
  ['書包', '背包'],
  ['鉛筆', '鋼筆'],
  ['番茄', '西紅柿'],
  ['土豆', '馬鈴薯']
]

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
  return `uc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
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

function pickWordPair() {
  const pair = WORD_PAIRS[Math.floor(Math.random() * WORD_PAIRS.length)]
  return { civilian: pair[0], undercover: pair[1] }
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

/** 取得某玩家的詞（僅自己可見） */
export function getMyWord(room, account) {
  if (!room?.playerWords || !account) return null
  return room.playerWords[account] || null
}

/** 取得存活玩家 */
export function getAlivePlayers(room) {
  const eliminated = new Set(room?.eliminated || [])
  return (room?.players || []).filter((p) => !eliminated.has(p.account))
}

/** 房主建立房間 */
export function createRoom(hostAccount) {
  const account = String(hostAccount || '').trim()
  if (!account) return { ok: false, error: '未登入' }
  const rooms = load()
  const id = newId()
  const shortCode = newShortCode(rooms)
  const room = {
    id,
    shortCode,
    host: account,
    hostName: getDisplayNameForAccount(account),
    players: [{ account, name: getDisplayNameForAccount(account) }],
    status: 'waiting',
    currentRound: 0,
    phase: null,
    currentSpeakerIndex: 0,
    civilianWord: null,
    undercoverWord: null,
    playerWords: {},
    undercoverAccounts: [],
    speeches: [],
    votes: {},
    eliminated: [],
    winner: null,
    entryFee: 1,
    paidPlayers: [],
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
  const input = String(roomIdOrShortCode || '').trim().toUpperCase()
  const accountStr = String(account || '').trim()
  if (!input || !accountStr) return { ok: false, error: '房間代碼與帳號必填' }
  const rooms = load()
  const idx = rooms.findIndex((r) => r.id === input || (r?.shortCode || '').toUpperCase() === input)
  if (idx === -1) return { ok: false, error: '找不到房間' }
  const r = rooms[idx]
  if (r.status !== 'waiting') return { ok: false, error: '遊戲已開始' }
  if (r.players.some((p) => p.account === accountStr)) return { ok: true, room: r }
  r.players.push({ account: accountStr, name: getDisplayNameForAccount(accountStr) })
  r.updatedAt = new Date().toISOString()
  save(rooms)
  return { ok: true, room: r }
}

/** 房主開始遊戲 */
export function startRoom(roomId) {
  const id = String(roomId || '').trim()
  const rooms = load()
  const idx = rooms.findIndex((r) => r.id === id)
  if (idx === -1) return { ok: false, error: '找不到房間' }
  const r = rooms[idx]
  if (r.status !== 'waiting') return { ok: false, error: '已開始' }
  const playerCount = r.players?.length || 0
  if (playerCount < 3) return { ok: false, error: '需至少 3 人才能開始' }
  const entryFee = r.entryFee ?? 1
  for (const p of r.players) {
    if (getWalletBalance(p.account) < entryFee) {
      return { ok: false, error: `有玩家佳盟幣不足（需 ${entryFee} 佳盟幣），無法開始` }
    }
  }
  for (const p of r.players) {
    const sub = subtractWalletBalance(p.account, entryFee)
    if (!sub.success) return { ok: false, error: sub.message || '扣除佳盟幣失敗' }
  }
  const { civilian, undercover } = pickWordPair()
  const shuffled = [...r.players].sort(() => Math.random() - 0.5)
  const undercoverCount = Math.max(1, Math.min(2, Math.floor(shuffled.length / 3)))
  const undercoverAccounts = shuffled.slice(0, undercoverCount).map((p) => p.account)
  const playerWords = {}
  r.players.forEach((p) => {
    playerWords[p.account] = undercoverAccounts.includes(p.account) ? undercover : civilian
  })
  r.paidPlayers = r.players.map((p) => p.account)
  r.pool = playerCount * entryFee
  r.status = 'playing'
  r.currentRound = 1
  r.phase = 'speaking'
  r.currentSpeakerIndex = 0
  r.civilianWord = civilian
  r.undercoverWord = undercover
  r.playerWords = playerWords
  r.undercoverAccounts = undercoverAccounts
  r.speeches = []
  r.votes = {}
  r.eliminated = []
  r.winner = null
  r.updatedAt = new Date().toISOString()
  save(rooms)
  return { ok: true, room: r }
}

/** 提交發言 */
export function submitSpeech(roomId, account, text) {
  const id = String(roomId || '').trim()
  const accountStr = String(account || '').trim()
  const t = String(text || '').trim()
  if (!id || !accountStr || !t) return { ok: false, error: '發言內容不可為空' }
  if (t.length > 50) return { ok: false, error: '發言最多 50 字' }
  const rooms = load()
  const idx = rooms.findIndex((r) => r.id === id)
  if (idx === -1) return { ok: false, error: '找不到房間' }
  const r = rooms[idx]
  if (r.status !== 'playing' || r.phase !== 'speaking') return { ok: false, error: '現在不是發言階段' }
  const alive = getAlivePlayers(r)
  const current = alive[r.currentSpeakerIndex]
  if (!current || current.account !== accountStr) return { ok: false, error: '還沒輪到你' }
  r.speeches = r.speeches || []
  r.speeches.push({ round: r.currentRound, account: accountStr, name: getDisplayNameForAccount(accountStr), text: t })
  r.currentSpeakerIndex++
  if (r.currentSpeakerIndex >= alive.length) {
    r.phase = 'voting'
    r.currentSpeakerIndex = 0
  }
  r.updatedAt = new Date().toISOString()
  save(rooms)
  return { ok: true, room: r }
}

/** 投票 */
export function submitVote(roomId, account, votedForAccount) {
  const id = String(roomId || '').trim()
  const accountStr = String(account || '').trim()
  const votedFor = String(votedForAccount || '').trim()
  if (!id || !accountStr || !votedFor) return { ok: false, error: '請選擇投票對象' }
  const rooms = load()
  const idx = rooms.findIndex((r) => r.id === id)
  if (idx === -1) return { ok: false, error: '找不到房間' }
  const r = rooms[idx]
  if (r.status !== 'playing' || r.phase !== 'voting') return { ok: false, error: '現在不是投票階段' }
  const alive = getAlivePlayers(r)
  if (!alive.some((p) => p.account === accountStr)) return { ok: false, error: '你已出局' }
  if (!alive.some((p) => p.account === votedFor)) return { ok: false, error: '請投票給存活玩家' }
  if (accountStr === votedFor) return { ok: false, error: '不能投自己' }
  r.votes = r.votes || {}
  r.votes[accountStr] = votedFor
  r.updatedAt = new Date().toISOString()
  save(rooms)
  return { ok: true, room: r }
}

/** 房主結算投票（當所有人都投票後） */
export function resolveVoting(roomId) {
  const id = String(roomId || '').trim()
  const rooms = load()
  const idx = rooms.findIndex((r) => r.id === id)
  if (idx === -1) return { ok: false }
  const r = rooms[idx]
  if (r.status !== 'playing' || r.phase !== 'voting') return { ok: false }
  const alive = getAlivePlayers(r)
  const votes = r.votes || {}
  const votedCount = alive.filter((p) => votes[p.account]).length
  if (votedCount < alive.length) return { ok: false } // 還沒全投完
  const tally = {}
  alive.forEach((p) => { tally[p.account] = 0 })
  Object.values(votes).forEach((acc) => {
    if (tally[acc] !== undefined) tally[acc]++
  })
  const maxVotes = Math.max(...Object.values(tally))
  const toEliminate = Object.entries(tally).filter(([, v]) => v === maxVotes).map(([acc]) => acc)
  const eliminated = toEliminate.length === 1 ? toEliminate[0] : null
  if (eliminated) {
    r.eliminated = r.eliminated || []
    r.eliminated.push(eliminated)
  }
  r.votes = {}
  r.phase = 'speaking'
  r.currentSpeakerIndex = 0
  const stillAlive = getAlivePlayers(r)
  const aliveUndercover = r.undercoverAccounts.filter((a) => !r.eliminated.includes(a))
  const aliveCivilian = stillAlive.filter((p) => !aliveUndercover.includes(p.account))
  if (aliveUndercover.length === 0) {
    r.status = 'ended'
    r.winner = 'civilians'
    distributePrize(r, id, aliveCivilian.map((p) => p.account))
  } else if (aliveUndercover.length >= aliveCivilian.length) {
    r.status = 'ended'
    r.winner = 'undercover'
    distributePrize(r, id, aliveUndercover)
  } else {
    r.currentRound++
  }
  r.updatedAt = new Date().toISOString()
  save(rooms)
  return { ok: true, room: r }
}

function distributePrize(r, roomId, winners) {
  if (r.distributed || r.pool <= 0 || !winners?.length) return
  const alreadyPaid = (getAllTransactions() || []).some(
    (t) => t.from === 'undercover' && t.roomId === roomId
  )
  if (alreadyPaid) {
    r.distributed = true
    return
  }
  r.distributed = true
  const share = Math.floor(r.pool / winners.length)
  let remainder = r.pool - share * winners.length
  winners.forEach((acc) => {
    const amount = share + (remainder > 0 ? 1 : 0)
    if (amount > 0) {
      addWalletBalance(acc, amount)
      addTransaction({
        from: 'undercover',
        to: acc,
        amount,
        description: '誰是臥底獲勝獎金',
        roomId
      })
    }
    if (remainder > 0) remainder--
  })
}

/** 房主退出：解散房間 */
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
