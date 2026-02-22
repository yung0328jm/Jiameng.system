// 開發中介面：小遊戲入口，佳盟幣↔佳盟分兌換
import { useState, useEffect } from 'react'
import { getCurrentUser, getCurrentUserRole } from '../utils/authStorage'
import { getWalletBalance, subtractWalletBalance, addWalletBalance } from '../utils/walletStorage'
import {
  getPointsBalance,
  addPointsBalance,
  subtractPointsBalance,
  getExchangeConfig,
  saveExchangeConfig
} from '../utils/pointsStorage'
import UltimatePassword from './minigames/UltimatePassword'
import UltimatePasswordMulti from './minigames/UltimatePasswordMulti'
import Undercover from './minigames/Undercover'
import RockPaperScissors from './minigames/RockPaperScissors'
import Niuniu from './minigames/Niuniu'
import CardGame from './CardGame'
import HorizontalRunner from './minigames/HorizontalRunner'

export default function MiniGames() {
  const [selectedGame, setSelectedGame] = useState(null)
  const [currentUser, setCurrentUser] = useState('')
  const [userRole, setUserRole] = useState(null)
  const [coinBalance, setCoinBalance] = useState(0)
  const [pointsBalance, setPointsBalance] = useState(0)
  const [exchangeConfig, setExchangeConfig] = useState(() => getExchangeConfig())
  const [coinToPointsAmount, setCoinToPointsAmount] = useState('')
  const [pointsToCoinAmount, setPointsToCoinAmount] = useState('')
  const [showRatioModal, setShowRatioModal] = useState(false)
  const [ratioForm, setRatioForm] = useState({ coinToPoints: 10, pointsForCoins: 10, coinsFromPoints: 1 })

  useEffect(() => {
    setCurrentUser(getCurrentUser() || '')
    setUserRole(getCurrentUserRole())
  }, [])

  useEffect(() => {
    if (!currentUser) return
    setCoinBalance(getWalletBalance(currentUser))
    setPointsBalance(getPointsBalance(currentUser))
    setExchangeConfig(getExchangeConfig())
  }, [currentUser, selectedGame])

  const refreshBalances = () => {
    if (currentUser) {
      setCoinBalance(getWalletBalance(currentUser))
      setPointsBalance(getPointsBalance(currentUser))
    }
    setExchangeConfig(getExchangeConfig())
  }

  const handleCoinToPoints = () => {
    const amount = Number(coinToPointsAmount)
    if (!currentUser) {
      alert('請先登入')
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('請輸入有效數量')
      return
    }
    const sub = subtractWalletBalance(currentUser, amount)
    if (!sub.success) {
      alert(sub.message || '兌換失敗')
      return
    }
    const points = amount * (exchangeConfig.coinToPoints || 10)
    const add = addPointsBalance(currentUser, points)
    if (!add.success) {
      addWalletBalance(currentUser, amount)
      alert(add.message || '兌換失敗')
      return
    }
    setCoinToPointsAmount('')
    refreshBalances()
    alert(`已兌換：${amount} 佳盟幣 → ${points} 佳盟分`)
  }

  const handlePointsToCoin = () => {
    const amount = Number(pointsToCoinAmount)
    if (!currentUser) {
      alert('請先登入')
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('請輸入有效數量')
      return
    }
    const sub = subtractPointsBalance(currentUser, amount)
    if (!sub.success) {
      alert(sub.message || '兌換失敗')
      return
    }
    const coins = amount * (exchangeConfig.pointsToCoin || 0.1)
    const add = addWalletBalance(currentUser, coins)
    if (!add.success) {
      addPointsBalance(currentUser, amount)
      alert(add.message || '兌換失敗')
      return
    }
    setPointsToCoinAmount('')
    refreshBalances()
    alert(`已兌換：${amount} 佳盟分 → ${coins} 佳盟幣`)
  }

  const handleSaveRatio = () => {
    const pointsForCoins = Number(ratioForm.pointsForCoins) || 1
    const coinsFromPoints = Number(ratioForm.coinsFromPoints) || 0.1
    const pointsToCoin = pointsForCoins > 0 ? coinsFromPoints / pointsForCoins : 0.1
    const res = saveExchangeConfig({
      coinToPoints: ratioForm.coinToPoints,
      pointsToCoin
    })
    if (res.success) {
      setExchangeConfig(res.data)
      setShowRatioModal(false)
      refreshBalances()
      alert('兌換比例已更新')
    } else {
      alert(res.message || '保存失敗')
    }
  }

  // 顯示用：多少佳盟分 = 多少佳盟幣（不綁定 1 佳盟分）
  const pointsToCoinDisplay = () => {
    const r = exchangeConfig.pointsToCoin || 0.1
    if (r >= 1) return `1 佳盟分 = ${r} 佳盟幣`
    const x = 1 / r
    const xStr = Number.isInteger(x) ? x : x.toFixed(2)
    return `${xStr} 佳盟分 = 1 佳盟幣`
  }

  const gameSlots = [
    { id: 'slot1', name: '終極密碼', description: '1～100 猜數字', comingSoon: false },
    { id: 'slot2', name: '終極密碼多人', description: '多人輪流猜 1～100，猜中的人全拿獎池', comingSoon: false },
    { id: 'slot3', name: '誰是臥底', description: '輪流發言投票找出臥底', comingSoon: false },
    { id: 'slot4', name: '猜拳', description: '兩人對戰五戰三勝，佳盟幣下注', comingSoon: false },
    { id: 'slot5', name: '妞妞', description: '兩人對戰，依序發牌比牛，佳盟幣下注', comingSoon: false },
    { id: 'slot6', name: '卡牌對戰', description: '1 英雄 + 50 張牌，回合制對戰', comingSoon: false },
    { id: 'slot7', name: '多人跑步', description: '橫向賽道多跑道，點擊衝刺先到終點勝（參考魔方賽跑）', comingSoon: false }
  ]

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 text-center">
        <h2 className="text-xl font-bold text-yellow-400">開發中</h2>
        <p className="text-gray-400 text-sm mt-1">小遊戲陸續上線，敬請期待</p>
      </div>

      {/* 佳盟幣 ↔ 佳盟分 兌換 */}
      <div className="mb-6 p-4 bg-gray-800 rounded-xl border border-gray-600">
        <h3 className="text-base font-semibold text-white mb-3">佳盟幣 ↔ 佳盟分 兌換</h3>
        {currentUser ? (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-gray-700/80 rounded-lg p-3">
                <div className="text-gray-400 text-xs mb-0.5">佳盟幣</div>
                <div className="text-yellow-400 font-bold text-lg">{Number(coinBalance).toLocaleString()}</div>
              </div>
              <div className="bg-gray-700/80 rounded-lg p-3">
                <div className="text-gray-400 text-xs mb-0.5">佳盟分</div>
                <div className="text-purple-300 font-bold text-lg">{Number(pointsBalance).toLocaleString()}</div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-gray-300 text-sm">佳盟幣 → 佳盟分</span>
                <span className="text-gray-500 text-xs">1 佳盟幣 = {exchangeConfig.coinToPoints} 佳盟分</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={coinToPointsAmount}
                  onChange={(e) => setCoinToPointsAmount(e.target.value)}
                  placeholder="數量"
                  className="w-24 bg-gray-700 border border-gray-500 rounded px-2 py-1.5 text-white text-sm"
                />
                <button
                  type="button"
                  onClick={handleCoinToPoints}
                  className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-gray-900 text-sm font-semibold rounded"
                >
                  兌換
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-gray-300 text-sm">佳盟分 → 佳盟幣</span>
                <span className="text-gray-500 text-xs">{pointsToCoinDisplay()}</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={pointsToCoinAmount}
                  onChange={(e) => setPointsToCoinAmount(e.target.value)}
                  placeholder="數量"
                  className="w-24 bg-gray-700 border border-gray-500 rounded px-2 py-1.5 text-white text-sm"
                />
                <button
                  type="button"
                  onClick={handlePointsToCoin}
                  className="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-sm font-semibold rounded"
                >
                  兌換
                </button>
              </div>
            </div>
            {userRole === 'admin' && (
              <button
                type="button"
                onClick={() => {
                  const r = exchangeConfig.pointsToCoin || 0.1
                  const pointsForCoins = r >= 1 ? 1 : (Number.isInteger(1 / r) ? 1 / r : Math.round(1 / r * 100) / 100)
                  const coinsFromPoints = r >= 1 ? r : 1
                  setRatioForm({
                    coinToPoints: exchangeConfig.coinToPoints,
                    pointsForCoins,
                    coinsFromPoints
                  })
                  setShowRatioModal(true)
                }}
                className="mt-3 text-amber-400 hover:text-amber-300 text-sm"
              >
                設定兌換比例
              </button>
            )}
          </>
        ) : (
          <p className="text-gray-500 text-sm">請先登入後使用兌換功能</p>
        )}
      </div>

      {showRatioModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowRatioModal(false)}>
          <div className="bg-gray-800 rounded-xl border border-gray-600 p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-semibold mb-3">設定兌換比例</h3>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-gray-400 text-xs mb-1">佳盟幣 → 佳盟分：1 佳盟幣 = 幾 佳盟分</label>
                <input
                  type="number"
                  min="0.0001"
                  step="0.1"
                  value={ratioForm.coinToPoints}
                  onChange={(e) => setRatioForm((f) => ({ ...f, coinToPoints: Number(e.target.value) || 0 }))}
                  className="w-full bg-gray-700 border border-gray-500 rounded px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-gray-400 text-xs mb-1">佳盟分 → 佳盟幣：多少 佳盟分 = 多少 佳盟幣</label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="number"
                    min="0.0001"
                    step="1"
                    value={ratioForm.pointsForCoins}
                    onChange={(e) => setRatioForm((f) => ({ ...f, pointsForCoins: Number(e.target.value) || 0 }))}
                    className="flex-1 bg-gray-700 border border-gray-500 rounded px-3 py-2 text-white"
                    placeholder="佳盟分"
                  />
                  <span className="text-gray-500">=</span>
                  <input
                    type="number"
                    min="0.0001"
                    step="0.01"
                    value={ratioForm.coinsFromPoints}
                    onChange={(e) => setRatioForm((f) => ({ ...f, coinsFromPoints: Number(e.target.value) || 0 }))}
                    className="flex-1 bg-gray-700 border border-gray-500 rounded px-3 py-2 text-white"
                    placeholder="佳盟幣"
                  />
                </div>
                <p className="text-gray-500 text-[11px] mt-1">例：10 佳盟分 = 1 佳盟幣</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowRatioModal(false)} className="px-3 py-1.5 bg-gray-600 text-white rounded text-sm">取消</button>
              <button type="button" onClick={handleSaveRatio} className="px-3 py-1.5 bg-yellow-500 text-gray-900 font-semibold rounded text-sm">保存</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {gameSlots.map((game) => (
          <button
            key={game.id}
            type="button"
            onClick={() => game.comingSoon ? null : setSelectedGame(game.id)}
            className={`
              text-left p-4 rounded-xl border-2 transition-all touch-manipulation
              ${game.comingSoon
                ? 'border-gray-600 bg-gray-700/50 text-gray-500 cursor-default'
                : 'border-yellow-400/50 bg-gray-700 text-white hover:border-yellow-400 hover:bg-gray-600 active:bg-gray-600'
              }
            `}
          >
            <div className="font-semibold text-white">{game.name}</div>
            <div className="text-sm mt-1 text-gray-400">{game.description}</div>
            {game.comingSoon && (
              <span className="inline-block mt-2 text-xs text-yellow-400/80">敬請期待</span>
            )}
          </button>
        ))}
      </div>

      {selectedGame === 'slot1' && (
        <div className="mt-6 p-4 bg-gray-700 rounded-xl border border-gray-600">
          <UltimatePassword onBack={() => setSelectedGame(null)} />
        </div>
      )}
      {selectedGame === 'slot2' && (
        <div className="mt-6 p-4 bg-gray-700 rounded-xl border border-gray-600">
          <UltimatePasswordMulti onBack={() => setSelectedGame(null)} />
        </div>
      )}
      {selectedGame === 'slot3' && (
        <div className="mt-6 p-4 bg-gray-700 rounded-xl border border-gray-600">
          <Undercover onBack={() => setSelectedGame(null)} />
        </div>
      )}
      {selectedGame === 'slot4' && (
        <div className="mt-6 p-4 bg-gray-700 rounded-xl border border-gray-600">
          <RockPaperScissors onBack={() => setSelectedGame(null)} />
        </div>
      )}
      {selectedGame === 'slot5' && (
        <div className="mt-6 p-4 bg-gray-700 rounded-xl border border-gray-600">
          <Niuniu onBack={() => setSelectedGame(null)} />
        </div>
      )}
      {selectedGame === 'slot6' && (
        <div className="mt-6 p-4 bg-gray-700 rounded-xl border border-gray-600">
          <CardGame onBack={() => setSelectedGame(null)} />
        </div>
      )}
      {selectedGame === 'slot7' && (
        <div className="mt-6 p-4 bg-gray-700 rounded-xl border border-gray-600">
          <HorizontalRunner onBack={() => setSelectedGame(null)} />
        </div>
      )}
      {selectedGame && selectedGame !== 'slot1' && selectedGame !== 'slot2' && selectedGame !== 'slot3' && selectedGame !== 'slot4' && selectedGame !== 'slot5' && selectedGame !== 'slot6' && selectedGame !== 'slot7' && (
        <div className="mt-6 p-4 bg-gray-700 rounded-xl border border-gray-600">
          <p className="text-gray-300 text-sm">遊戲內容可在此區塊擴充。</p>
          <button type="button" onClick={() => setSelectedGame(null)} className="mt-3 text-yellow-400 text-sm hover:underline">
            返回
          </button>
        </div>
      )}
    </div>
  )
}
