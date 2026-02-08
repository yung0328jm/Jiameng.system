// 輪盤：0-36 歐式輪盤，使用佳盟幣下注
import { useState } from 'react'
import { placeBetAndSpin } from '../../utils/rouletteStorage'
import { getCurrentUser } from '../../utils/authStorage'
import { getWalletBalance } from '../../utils/walletStorage'

const BET_TYPES = [
  { id: 'red', name: '紅', desc: '1:1' },
  { id: 'black', name: '黑', desc: '1:1' },
  { id: 'odd', name: '單', desc: '1:1' },
  { id: 'even', name: '雙', desc: '1:1' },
  { id: 'high', name: '大', desc: '19-36，1:1' },
  { id: 'low', name: '小', desc: '1-18，1:1' },
  { id: 'straight', name: '單號', desc: '0-36，35:1' }
]

export default function Roulette({ onBack }) {
  const [betType, setBetType] = useState('red')
  const [straightNum, setStraightNum] = useState('0')
  const [amount, setAmount] = useState('1')
  const [message, setMessage] = useState('')
  const [spinning, setSpinning] = useState(false)
  const [lastResult, setLastResult] = useState(null)

  const account = getCurrentUser() || ''
  const balance = getWalletBalance(account)

  const handleSpin = () => {
    if (!account) {
      setMessage('請先登入')
      return
    }
    const amt = Math.floor(Number(amount) || 0)
    if (amt <= 0) {
      setMessage('請輸入有效下注金額')
      return
    }
    if (balance < amt) {
      setMessage('佳盟幣不足')
      return
    }
    if (betType === 'straight') {
      const n = parseInt(straightNum, 10)
      if (Number.isNaN(n) || n < 0 || n > 36) {
        setMessage('單號須為 0～36')
        return
      }
    }

    setMessage('')
    setSpinning(true)
    setLastResult(null)

    // 模擬旋轉延遲
    setTimeout(() => {
      const bet = betType === 'straight'
        ? { type: 'straight', value: straightNum, amount: amt }
        : { type: betType, amount: amt }
      const res = placeBetAndSpin(account, bet)
      setSpinning(false)
      if (res.ok) {
        setLastResult(res)
        setMessage(res.profit >= 0 ? `贏得 ${res.won} 佳盟幣！` : `未中獎，開出 ${res.result}`)
      } else {
        setMessage(res.error || '下注失敗')
      }
    }, 1500)
  }

  if (!account) {
    return (
      <div className="text-center py-6">
        <p className="text-gray-400 text-sm">請先登入</p>
        <button type="button" onClick={onBack} className="mt-3 text-yellow-400 text-sm hover:underline">← 返回</button>
      </div>
    )
  }

  const colorClass = lastResult
    ? lastResult.color === 'red'
      ? 'bg-red-600'
      : lastResult.color === 'black'
        ? 'bg-gray-900'
        : 'bg-green-600'
    : 'bg-gray-700'

  return (
    <div className="flex flex-col items-center w-full max-w-[320px]">
      <div className="flex justify-between w-full mb-3">
        <button type="button" onClick={onBack} className="text-yellow-400 text-sm hover:underline">← 返回</button>
        <span className="text-gray-400 text-sm">佳盟幣：{balance.toLocaleString()}</span>
      </div>

      <p className="text-gray-400 text-xs mb-3">歐式輪盤 0-36，紅/黑/單/雙/大/小 1:1，單號 35:1</p>

      {/* 輪盤顯示 */}
      <div className={`w-32 h-32 rounded-full flex items-center justify-center text-3xl font-bold text-white mb-4 ${colorClass} transition-colors duration-500`}>
        {spinning ? (
          <span className="animate-pulse">?</span>
        ) : lastResult ? (
          <span>{lastResult.result}</span>
        ) : (
          <span className="text-gray-500">—</span>
        )}
      </div>

      {/* 下注類型 */}
      <div className="w-full space-y-2 mb-3">
        <p className="text-gray-500 text-xs">下注類型</p>
        <div className="flex flex-wrap gap-1">
          {BET_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setBetType(t.id)}
              className={`px-2 py-1 rounded text-sm touch-manipulation ${betType === t.id ? 'bg-yellow-400 text-gray-800' : 'bg-gray-600 text-gray-300'}`}
            >
              {t.name}
            </button>
          ))}
        </div>
        {betType === 'straight' && (
          <div className="flex items-center gap-2 mt-2">
            <label className="text-gray-500 text-xs">號碼</label>
            <input
              type="number"
              min={0}
              max={36}
              value={straightNum}
              onChange={(e) => setStraightNum(String(Math.max(0, Math.min(36, parseInt(e.target.value, 10) || 0))))}
              className="w-16 px-2 py-1 rounded bg-gray-800 border border-gray-600 text-white text-sm"
            />
          </div>
        )}
      </div>

      {/* 下注金額 */}
      <div className="w-full mb-3">
        <label className="text-gray-500 text-xs block mb-1">下注金額</label>
        <input
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-600 text-white"
        />
      </div>

      <button
        type="button"
        onClick={handleSpin}
        disabled={spinning}
        className="w-full py-3 bg-yellow-400 text-gray-800 font-semibold rounded-lg touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {spinning ? '旋轉中…' : '旋轉'}
      </button>

      {message && <p className={`mt-3 text-sm ${lastResult?.profit >= 0 ? 'text-green-400' : 'text-yellow-400/90'}`}>{message}</p>}
    </div>
  )
}
