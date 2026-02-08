// 拉霸機：3 軸，佳盟幣下注
import { getWalletBalance, subtractWalletBalance, addWalletBalance, addTransaction } from './walletStorage'

// 符號 id 與權重 — 設置更難中獎：檸檬權重高且不賠，僅三同有獎、兩同不賠
const SYMBOLS = [
  { id: 'lemon', weight: 50, name: '檸檬', emoji: '🍋' },   // 三同不賠
  { id: 'cherry', weight: 18, name: '櫻桃', emoji: '🍒' },
  { id: 'bell', weight: 12, name: '鈴鐺', emoji: '🔔' },
  { id: 'star', weight: 10, name: '星星', emoji: '⭐' },
  { id: 'bar', weight: 6, name: 'BAR', emoji: '📊' },
  { id: 'seven', weight: 4, name: '7', emoji: '7️⃣' }
]

const TOTAL_WEIGHT = SYMBOLS.reduce((s, x) => s + x.weight, 0)

function pickSymbol() {
  let r = Math.random() * TOTAL_WEIGHT
  for (const s of SYMBOLS) {
    r -= s.weight
    if (r <= 0) return s.id
  }
  return SYMBOLS[0].id
}

/** 取得符號資訊 */
export function getSymbolInfo(id) {
  return SYMBOLS.find((s) => s.id === id) || SYMBOLS[0]
}

export function getAllSymbols() {
  return SYMBOLS
}

/** 旋轉一次：回傳 [reel1, reel2, reel3] 的符號 id */
export function spinReels() {
  return [pickSymbol(), pickSymbol(), pickSymbol()]
}

/** 計算獎金倍數：僅三同（且非檸檬）有獎，兩同與其他皆 0 */
function getMultiplier(reels) {
  const [a, b, c] = reels
  if (a === b && b === c) {
    if (a === 'lemon') return 0
    const table = { seven: 50, bar: 20, star: 15, bell: 10, cherry: 5 }
    return table[a] ?? 5
  }
  return 0 // 兩同不再退還，更難中獎
}

/** 下注並旋轉 */
export function placeBetAndSpin(account, amount) {
  const accountStr = String(account || '').trim()
  if (!accountStr) return { ok: false, error: '未登入' }
  const amt = Math.floor(Number(amount) || 0)
  if (amt <= 0) return { ok: false, error: '下注金額須大於 0' }
  if (getWalletBalance(accountStr) < amt) return { ok: false, error: '佳盟幣不足' }

  const sub = subtractWalletBalance(accountStr, amt)
  if (!sub.success) return { ok: false, error: sub.message || '扣款失敗' }

  const reels = spinReels()
  const mult = getMultiplier(reels)
  const won = amt * mult

  if (won > 0) {
    addWalletBalance(accountStr, won)
    addTransaction({ from: 'slot_machine', to: accountStr, amount: won - amt, description: '拉霸機贏得' })
  } else {
    addTransaction({ from: 'slot_machine', to: accountStr, amount: -amt, description: '拉霸機下注' })
  }

  return {
    ok: true,
    reels,
    multiplier: mult,
    won,
    profit: won - amt
  }
}
