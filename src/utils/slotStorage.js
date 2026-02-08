// 拉霸機：3 軸，佳盟幣下注
import { getWalletBalance, subtractWalletBalance, addWalletBalance, addTransaction } from './walletStorage'

// 符號 id 與權重（權重愈高出現率愈高）
const SYMBOLS = [
  { id: 'cherry', weight: 40, name: '櫻桃', emoji: '🍒' },
  { id: 'bell', weight: 25, name: '鈴鐺', emoji: '🔔' },
  { id: 'star', weight: 20, name: '星星', emoji: '⭐' },
  { id: 'bar', weight: 10, name: 'BAR', emoji: '📊' },
  { id: 'seven', weight: 5, name: '7', emoji: '7️⃣' }
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

/** 計算獎金倍數：三同、兩同、無 */
function getMultiplier(reels) {
  const [a, b, c] = reels
  if (a === b && b === c) {
    // 三同
    const info = getSymbolInfo(a)
    const table = { seven: 50, bar: 20, star: 15, bell: 10, cherry: 5 }
    return table[info.id] ?? 5
  }
  if (a === b || b === c || a === c) {
    return 2 // 兩同
  }
  return 0
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
