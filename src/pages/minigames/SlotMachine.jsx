// 拉霸機：3 軸老虎機，佳盟幣下注
import { useState } from 'react'
import { placeBetAndSpin, getSymbolInfo, getAllSymbols } from '../../utils/slotStorage'
import { getCurrentUser } from '../../utils/authStorage'
import { getWalletBalance } from '../../utils/walletStorage'

const SYMBOLS = getAllSymbols()

function Reel({ symbolId, spinning, delay }) {
  const info = getSymbolInfo(symbolId)
  return (
    <div
      className={`flex items-center justify-center w-20 h-24 rounded-xl bg-gray-800/90 border-2 border-amber-600/50 shadow-inner overflow-hidden transition-all ${spinning ? 'animate-[slot-reel_0.15s_ease-in-out_infinite] opacity-90 scale-105' : ''}`}
      style={{ animationDelay: delay }}
    >
      <span className="text-4xl drop-shadow-md" title={info.name}>{info.emoji}</span>
    </div>
  )
}

export default function SlotMachine({ onBack }) {
  const [amount, setAmount] = useState('1')
  const [message, setMessage] = useState('')
  const [spinning, setSpinning] = useState(false)
  const [reels, setReels] = useState([SYMBOLS[0].id, SYMBOLS[0].id, SYMBOLS[0].id])
  const [lastWin, setLastWin] = useState(null)

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

    setMessage('')
    setLastWin(null)
    setSpinning(true)
    // 旋轉時先顯示隨機符號
    const randomReels = [SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].id, SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].id, SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].id]
    setReels(randomReels)

    const res = placeBetAndSpin(account, amt)

    setTimeout(() => {
      setReels(res.ok ? res.reels : randomReels)
      setSpinning(false)
      if (res.ok) {
        setLastWin(res)
        setMessage(res.profit >= 0 ? `贏得 ${res.won} 佳盟幣！` : '未中獎')
      } else {
        setMessage(res.error || '下注失敗')
      }
    }, 1800)
  }

  if (!account) {
    return (
      <div className="text-center py-6">
        <p className="text-gray-400 text-sm">請先登入</p>
        <button type="button" onClick={onBack} className="mt-3 text-yellow-400 text-sm hover:underline">← 返回</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center w-full max-w-[320px]">
      <style>{`
        @keyframes slot-reel {
          0%, 100% { transform: scale(1.02); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.85; }
        }
      `}</style>

      <div className="flex justify-between w-full mb-2">
        <button type="button" onClick={onBack} className="text-yellow-400 text-sm hover:underline">← 返回</button>
        <span className="text-amber-200/90 text-sm font-medium">佳盟幣：{balance.toLocaleString()}</span>
      </div>

      <p className="text-gray-400 text-xs mb-3">三同 5～50 倍 · 兩同 2 倍</p>

      {/* 拉霸機外框 */}
      <div className="w-full max-w-[280px] p-4 rounded-2xl bg-gradient-to-b from-gray-800 to-gray-900 border-2 border-amber-600/60 shadow-[0_0_24px_rgba(251,191,36,0.12),inset_0_2px_8px_rgba(0,0,0,0.3)]">
        {/* 三軸 */}
        <div className="flex justify-center gap-3 mb-4">
          {[0, 1, 2].map((i) => (
            <Reel
              key={i}
              symbolId={reels[i]}
              spinning={spinning}
              delay={`${i * 0.1}s`}
            />
          ))}
        </div>

        {/* 賠率表 */}
        <div className="flex flex-wrap justify-center gap-2 text-[10px] text-gray-500 mb-4">
          {SYMBOLS.map((s) => (
            <span key={s.id}>{s.emoji}×3 = {s.id === 'seven' ? 50 : s.id === 'bar' ? 20 : s.id === 'star' ? 15 : s.id === 'bell' ? 10 : 5}倍</span>
          ))}
        </div>
      </div>

      {/* 結果 */}
      {lastWin && (
        <div className={`text-center py-2 px-4 rounded-lg mb-2 ${lastWin.profit >= 0 ? 'bg-emerald-900/40 text-emerald-400' : 'text-gray-400'}`}>
          {lastWin.profit >= 0 ? `+${lastWin.won} 佳盟幣` : '未中獎'}
        </div>
      )}

      {/* 下注區 */}
      <div className="w-full mt-2 p-4 rounded-xl bg-gray-800/60 border border-amber-600/30">
        <label className="text-amber-400/90 text-xs font-medium block mb-1">下注金額</label>
        <input
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg bg-gray-900/80 border border-amber-600/40 text-white focus:ring-1 focus:ring-amber-500/50 mb-3"
        />
        <button
          type="button"
          onClick={handleSpin}
          disabled={spinning}
          className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 text-amber-950 font-bold rounded-xl touch-manipulation shadow-[0_4px_14px_rgba(251,191,36,0.35)] hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {spinning ? '旋轉中…' : '拉霸'}
        </button>
      </div>

      {message && !lastWin && <p className="mt-2 text-sm text-amber-400/90">{message}</p>}
    </div>
  )
}
