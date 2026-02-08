// 輪盤：0-36 歐式輪盤，使用佳盟幣下注
import { useState, useRef } from 'react'
import { placeBetAndSpin, getNumberColor, WHEEL_ORDER } from '../../utils/rouletteStorage'
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
  const [wheelRotation, setWheelRotation] = useState(0)
  const spinResultRef = useRef(null)

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

    const bet = betType === 'straight'
      ? { type: 'straight', value: straightNum, amount: amt }
      : { type: betType, amount: amt }
    const res = placeBetAndSpin(account, bet)
    spinResultRef.current = res

    if (res.ok) {
      // 計算輪盤最終角度：累加旋轉，讓結果停在頂部指針
      const idx = WHEEL_ORDER.indexOf(res.result)
      const degPerSlot = 360 / 37
      const extraRotation = 360 * 5 + (37 - idx) * degPerSlot // 多轉 5 圈 + 對準結果
      setWheelRotation((prev) => prev + extraRotation)
    }

    setTimeout(() => {
      setSpinning(false)
      if (res.ok) {
        setLastResult(res)
        setMessage(res.profit >= 0 ? `贏得 ${res.won} 佳盟幣！` : `未中獎，開出 ${res.result}`)
      } else {
        setMessage(res.error || '下注失敗')
      }
    }, 2500)
  }

  if (!account) {
    return (
      <div className="text-center py-6">
        <p className="text-gray-400 text-sm">請先登入</p>
        <button type="button" onClick={onBack} className="mt-3 text-yellow-400 text-sm hover:underline">← 返回</button>
      </div>
    )
  }

  const segmentDeg = 360 / 37

  return (
    <div className="flex flex-col items-center w-full max-w-[340px]">
      <style>{`
        .roulette-wheel {
          transition: transform 2.5s cubic-bezier(0.17, 0.67, 0.12, 0.99);
        }
      `}</style>

      <div className="flex justify-between w-full mb-2">
        <button type="button" onClick={onBack} className="text-yellow-400 text-sm hover:underline">← 返回</button>
        <span className="text-amber-200/90 text-sm font-medium">佳盟幣：{balance.toLocaleString()}</span>
      </div>

      <p className="text-gray-400 text-xs mb-3">歐式輪盤 0-36 · 紅/黑/單/雙/大/小 1:1 · 單號 35:1</p>

      {/* 輪盤主視覺 */}
      <div className="relative mb-5">
        {/* 頂部指針 */}
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 z-10 w-0 h-0 border-l-[10px] border-r-[10px] border-t-[16px] border-l-transparent border-r-transparent border-t-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.6)]" />

        {/* 輪盤外框 */}
        <div className="relative w-52 h-52 rounded-full p-2 bg-gradient-to-br from-amber-800/80 via-amber-900 to-amber-950 shadow-[inset_0_2px_8px_rgba(0,0,0,0.5),0_0_20px_rgba(251,191,36,0.15)] ring-2 ring-amber-600/50">
          {/* 輪盤內圈：conic-gradient 繪製紅黑綠區塊 */}
          <div
            className="roulette-wheel absolute inset-2 rounded-full overflow-hidden"
            style={{
              transform: `rotate(${wheelRotation}deg)`,
              background: `conic-gradient(${WHEEL_ORDER.map((num, i) => {
                const c = getNumberColor(num)
                const hex = c === 'red' ? '#b91c1c' : c === 'black' ? '#1f2937' : '#047857'
                return `${hex} ${i * segmentDeg}deg ${(i + 1) * segmentDeg}deg`
              }).join(', ')})`
            }}
          />
          {/* 數字標籤層（與輪盤同步旋轉） */}
          <div
            className="roulette-wheel absolute inset-2 rounded-full pointer-events-none [background:transparent]"
            style={{ transform: `rotate(${wheelRotation}deg)` }}
          >
            {WHEEL_ORDER.map((num, i) => (
              <div
                key={`${num}-${i}`}
                className="absolute left-1/2 top-0 w-1/2 h-full origin-left flex items-center justify-end pr-2"
                style={{ transform: `rotate(${i * segmentDeg + segmentDeg / 2}deg)` }}
              >
                <span className="text-[9px] font-bold text-white drop-shadow-[0_0_1px_black]">{num}</span>
              </div>
            ))}
          </div>
          {/* 中心裝飾 */}
          <div className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-gradient-to-br from-amber-600 to-amber-800 flex items-center justify-center shadow-lg ring-2 ring-amber-500/50 pointer-events-none">
            <span className="text-amber-100 text-xs font-bold">CASINO</span>
          </div>
        </div>

        {/* 結果顯示 */}
        <div className="mt-3 text-center">
          {spinning ? (
            <p className="text-amber-400/90 text-sm animate-pulse">旋轉中…</p>
          ) : lastResult ? (
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${
              lastResult.color === 'red' ? 'bg-red-900/50' : lastResult.color === 'black' ? 'bg-gray-800' : 'bg-emerald-900/50'
            }`}>
              <span className="text-2xl font-bold text-white">{lastResult.result}</span>
              <span className="text-xs text-gray-400">{lastResult.color === 'red' ? '紅' : lastResult.color === 'black' ? '黑' : '綠'}</span>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">選擇下注後旋轉</p>
          )}
        </div>
      </div>

      {/* 下注區 */}
      <div className="w-full mt-2 p-4 rounded-xl bg-gray-800/60 border border-amber-600/30 space-y-3">
        <p className="text-amber-400/90 text-xs font-medium">下注類型</p>
        <div className="flex flex-wrap gap-1.5">
          {BET_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setBetType(t.id)}
              className={`px-3 py-1.5 rounded-lg text-sm touch-manipulation transition-all ${betType === t.id ? 'bg-amber-400 text-amber-950 font-semibold shadow-[0_0_8px_rgba(251,191,36,0.4)]' : 'bg-gray-700/80 text-gray-300 hover:bg-gray-600'}`}
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
      <div className="w-full">
        <label className="text-amber-400/90 text-xs font-medium block mb-1">下注金額</label>
        <input
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg bg-gray-900/80 border border-amber-600/40 text-white focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/50"
        />
      </div>

      <button
        type="button"
        onClick={handleSpin}
        disabled={spinning}
        className="w-full mt-3 py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 text-amber-950 font-bold rounded-xl touch-manipulation shadow-[0_4px_14px_rgba(251,191,36,0.35)] hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-amber-500 disabled:hover:to-amber-600 transition-all"
      >
        {spinning ? '旋轉中…' : '旋轉'}
      </button>

      {message && <p className={`mt-3 text-sm font-medium ${lastResult?.profit >= 0 ? 'text-emerald-400' : 'text-amber-400/90'}`}>{message}</p>}
    </div>
  )
}
