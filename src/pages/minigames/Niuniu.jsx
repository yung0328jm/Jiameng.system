// 妞妞：玩家 vs 莊家，佳盟幣下注，比牛大小
import { useState, useEffect, useRef } from 'react'
import { createDeck, shuffle, dealRound, cardFace } from '../../utils/niuniuStorage'
import { getCurrentUser } from '../../utils/authStorage'
import { getWalletBalance, subtractWalletBalance, addWalletBalance, addTransaction } from '../../utils/walletStorage'

export default function Niuniu({ onBack }) {
  const account = getCurrentUser() || ''
  const [betAmount, setBetAmount] = useState('1')
  const [message, setMessage] = useState('')
  const [phase, setPhase] = useState('idle') // idle | dealt | result
  const [round, setRound] = useState(null)

  const balance = getWalletBalance(account)

  const handleDeal = () => {
    if (!account) {
      setMessage('請先登入')
      return
    }
    const bet = Math.max(1, Math.floor(Number(betAmount) || 1))
    if (balance < bet) {
      setMessage('佳盟幣不足')
      return
    }
    const sub = subtractWalletBalance(account, bet)
    if (!sub.success) {
      setMessage(sub.message || '下注失敗')
      return
    }
    setMessage('')
    const deck = shuffle(createDeck())
    const result = dealRound(deck)
    setRound({ bet, ...result })
    setPhase('dealt')
    // 短暫延遲後顯示結果（可做成翻牌動畫）
    setTimeout(() => setPhase('result'), 800)
  }

  const paidRef = useRef(false)
  useEffect(() => {
    if (phase !== 'result' || !round || paidRef.current) return
    paidRef.current = true
    const { result, bet, playerResult } = round
    if (result === 'win') {
      const winAmount = playerResult.niu === 10 ? bet * 2 : bet
      addWalletBalance(account, bet + winAmount)
      addTransaction({
        from: 'niuniu',
        to: account,
        amount: bet + winAmount,
        description: playerResult.niu === 10 ? '妞妞贏（2倍）' : '妞妞贏'
      })
    } else if (result === 'tie') {
      addWalletBalance(account, bet)
    }
    setRound((r) => (r ? { ...r, paid: true } : r))
  }, [phase, round, account])

  const canDeal = phase === 'idle' || (phase === 'result' && round?.paid)
  const showResult = phase === 'result' && round

  const resetForNewRound = () => {
    paidRef.current = false
    setPhase('idle')
    setRound(null)
    setMessage('')
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
    <div className="flex flex-col items-center w-full max-w-[360px] mx-auto">
      <div className="flex justify-between w-full mb-3">
        <button type="button" onClick={onBack} className="text-yellow-400 text-sm hover:underline">← 返回</button>
        <span className="text-amber-400/90 text-sm">佳盟幣：{balance.toLocaleString()}</span>
      </div>

      <p className="text-gray-400 text-sm mb-3">妞妞 vs 莊家 · 牛牛 2 倍賠</p>

      {/* 下注 */}
      <div className="flex items-center gap-2 mb-4">
        <label className="text-gray-500 text-sm">下注</label>
        <input
          type="number"
          min={1}
          max={Math.max(1, balance)}
          value={betAmount}
          onChange={(e) => setBetAmount(e.target.value)}
          className="w-20 px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm"
        />
        <span className="text-gray-500 text-sm">佳盟幣</span>
        <button
          type="button"
          onClick={handleDeal}
          disabled={!canDeal || balance < Math.max(1, Math.floor(Number(betAmount) || 1))}
          className="px-4 py-2 rounded-xl bg-amber-500 text-gray-900 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          發牌
        </button>
      </div>

      {message && <p className="text-yellow-400/90 text-sm mb-2">{message}</p>}

      {/* 牌面與結果 */}
      {round && (
        <div className="w-full space-y-4">
          <div className="p-3 rounded-xl bg-gray-800/90 border border-amber-600/30">
            <p className="text-gray-500 text-xs mb-1">莊家</p>
            <div className="flex flex-wrap gap-1 mb-1">
              {round.dealerCards.map((c, i) => (
                <span key={i} className="inline-flex items-center justify-center w-9 h-12 rounded bg-gray-700 text-white text-sm font-medium border border-gray-600">
                  {cardFace(c)}
                </span>
              ))}
            </div>
            <p className="text-amber-400 text-sm font-semibold">{round.dealerResult?.label ?? '—'}</p>
          </div>

          <div className="p-3 rounded-xl bg-gray-800/90 border border-amber-600/30">
            <p className="text-gray-500 text-xs mb-1">你的牌</p>
            <div className="flex flex-wrap gap-1 mb-1">
              {round.playerCards.map((c, i) => (
                <span key={i} className="inline-flex items-center justify-center w-9 h-12 rounded bg-gray-700 text-white text-sm font-medium border border-gray-600">
                  {cardFace(c)}
                </span>
              ))}
            </div>
            <p className="text-amber-400 text-sm font-semibold">{round.playerResult?.label ?? '—'}</p>
          </div>

          {showResult && (
            <div className="text-center py-3 rounded-xl bg-gray-800 border border-amber-500/20">
              {round.result === 'win' && (
                <p className="text-emerald-400 font-bold text-lg">
                  {round.playerResult?.niu === 10 ? '妞妞！贏 2 倍' : '贏'}
                </p>
              )}
              {round.result === 'lose' && <p className="text-red-400 font-bold text-lg">輸</p>}
              {round.result === 'tie' && <p className="text-gray-400 font-bold text-lg">和局</p>}
            </div>
          )}
        </div>
      )}

      {canDeal && phase === 'result' && (
        <button type="button" onClick={resetForNewRound} className="mt-4 text-yellow-400 text-sm hover:underline">
          再玩一局
        </button>
      )}
    </div>
  )
}
