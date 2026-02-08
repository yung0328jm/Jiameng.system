// 輪盤：0-36 歐式輪盤，使用佳盟幣下注
import { getWalletBalance, subtractWalletBalance, addWalletBalance, addTransaction } from './walletStorage'

// 紅號：歐式輪盤
const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]

/** 隨機產生 0-36 的結果 */
export function spin() {
  return Math.floor(Math.random() * 37) // 0-36
}

/** 取得號碼顏色：0=green, 紅號=red, 其餘=black */
export function getNumberColor(num) {
  if (num === 0) return 'green'
  return RED_NUMBERS.includes(num) ? 'red' : 'black'
}

/** 歐式輪盤順序（順時針，從 0 開始） */
export const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]

/** 下注並旋轉：扣除金額、旋轉、結算、返還餘額
 * bet: { type, value?, amount }
 * type: 'straight' 單號(0-36, value=號碼) | 'red' 紅 | 'black' 黑 | 'odd' 單 | 'even' 雙 | 'high' 大(19-36) | 'low' 小(1-18)
 * amount: 下注佳盟幣
 */
export function placeBetAndSpin(account, bet) {
  const accountStr = String(account || '').trim()
  if (!accountStr) return { ok: false, error: '未登入' }
  const { type, value, amount } = bet || {}
  const amt = Math.floor(Number(amount) || 0)
  if (amt <= 0) return { ok: false, error: '下注金額須大於 0' }
  if (getWalletBalance(accountStr) < amt) return { ok: false, error: '佳盟幣不足' }

  // 驗證下注類型
  if (type === 'straight') {
    const n = parseInt(value, 10)
    if (Number.isNaN(n) || n < 0 || n > 36) return { ok: false, error: '單號須為 0～36' }
  } else if (!['red', 'black', 'odd', 'even', 'high', 'low'].includes(type)) {
    return { ok: false, error: '無效下注類型' }
  }

  const sub = subtractWalletBalance(accountStr, amt)
  if (!sub.success) return { ok: false, error: sub.message || '扣款失敗' }

  const result = spin()
  const color = getNumberColor(result)
  let won = 0

  if (type === 'straight') {
    if (parseInt(value, 10) === result) won = amt * 36 // 35:1 賠率 = 本金+35倍
  } else if (type === 'red') {
    if (color === 'red') won = amt * 2
  } else if (type === 'black') {
    if (color === 'black') won = amt * 2
  } else if (type === 'odd') {
    if (result > 0 && result % 2 === 1) won = amt * 2
  } else if (type === 'even') {
    if (result > 0 && result % 2 === 0) won = amt * 2
  } else if (type === 'high') {
    if (result >= 19 && result <= 36) won = amt * 2
  } else if (type === 'low') {
    if (result >= 1 && result <= 18) won = amt * 2
  }

  if (won > 0) {
    addWalletBalance(accountStr, won)
    addTransaction({ from: 'roulette', to: accountStr, amount: won - amt, description: '輪盤贏得' })
  } else {
    addTransaction({ from: 'roulette', to: accountStr, amount: -amt, description: '輪盤下注' })
  }

  return {
    ok: true,
    result,
    color,
    won,
    profit: won - amt
  }
}
