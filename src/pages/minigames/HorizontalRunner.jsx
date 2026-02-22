// 多人跑步橫向移動（參考魔方賽跑：橫向賽道、多跑道、點擊衝刺先到終點勝）
import { useState, useEffect, useRef, useCallback } from 'react'

const TRACK_LENGTH_PX = 280
const LANE_HEIGHT = 52
const CUBE_SIZE = 40
const BOOST = 95
const FRICTION = 0.985
const MAX_SPEED = 420

const LANE_COLORS = [
  { bg: 'bg-amber-500', border: 'border-amber-400', text: 'text-amber-900' },
  { bg: 'bg-emerald-500', border: 'border-emerald-400', text: 'text-emerald-900' },
  { bg: 'bg-sky-500', border: 'border-sky-400', text: 'text-sky-900' },
  { bg: 'bg-rose-500', border: 'border-rose-400', text: 'text-rose-900' }
]

function HorizontalRunner({ onBack }) {
  const [phase, setPhase] = useState('setup') // setup | racing | finished
  const [playerCount, setPlayerCount] = useState(2)
  const [runners, setRunners] = useState([])
  const [winner, setWinner] = useState(null)
  const rafRef = useRef(null)
  const lastTimeRef = useRef(0)

  const initRunners = useCallback((count) => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      name: `${i + 1}P`,
      x: 0,
      speed: 0,
      ...LANE_COLORS[i % LANE_COLORS.length]
    }))
  }, [])

  const startRace = () => {
    setRunners(initRunners(playerCount))
    setWinner(null)
    setPhase('racing')
  }

  const boost = useCallback((runnerId) => {
    if (phase !== 'racing') return
    setRunners((prev) =>
      prev.map((r) =>
        r.id === runnerId
          ? { ...r, speed: Math.min(MAX_SPEED, (r.speed || 0) + BOOST) }
          : r
      )
    )
  }, [phase])

  useEffect(() => {
    if (phase !== 'racing' || runners.length === 0) return

    const tick = (now) => {
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1)
      lastTimeRef.current = now

      setRunners((prev) => {
        let hasWinner = false
        let winnerId = null
        const next = prev.map((r) => {
          let x = r.x + r.speed * dt
          let speed = r.speed * FRICTION
          if (speed < 2) speed = 0
          if (x >= TRACK_LENGTH_PX - CUBE_SIZE) {
            x = TRACK_LENGTH_PX - CUBE_SIZE
            if (!hasWinner) {
              hasWinner = true
              winnerId = r.id
            }
          }
          return { ...r, x, speed }
        })
        if (hasWinner && winnerId != null) {
          requestAnimationFrame(() => {
            setWinner(winnerId)
            setPhase('finished')
          })
        }
        return next
      })

      rafRef.current = requestAnimationFrame(tick)
    }
    lastTimeRef.current = performance.now()
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [phase, runners.length])

  // 鍵盤：1/2/3/4 對應 1P～4P
  useEffect(() => {
    const onKeyDown = (e) => {
      const key = e.key
      if (phase !== 'racing') return
      if (key === '1') boost(0)
      else if (key === '2') boost(1)
      else if (key === '3') boost(2)
      else if (key === '4') boost(3)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [phase, boost])

  if (phase === 'setup') {
    return (
      <div className="flex flex-col items-center">
        <div className="flex justify-between w-full max-w-[320px] mb-3">
          <button type="button" onClick={onBack} className="text-yellow-400 text-sm hover:underline">← 返回</button>
        </div>
        <h3 className="text-lg font-bold text-yellow-400 mb-1">多人跑步 · 橫向賽道</h3>
        <p className="text-gray-400 text-sm mb-4 text-center">參考魔方賽跑：選人數後開跑，點擊對應按鈕或按鍵 1～4 衝刺，先到終點者勝。</p>
        <p className="text-gray-500 text-xs mb-3">選擇參賽人數</p>
        <div className="flex gap-3 mb-6">
          {[2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPlayerCount(n)}
              className={`px-5 py-2.5 rounded-xl font-semibold transition-all ${
                playerCount === n
                  ? 'bg-yellow-400 text-gray-900 ring-2 ring-yellow-300'
                  : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
              }`}
            >
              {n} 人
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={startRace}
          className="px-8 py-3 bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold rounded-xl"
        >
          開始賽跑
        </button>
      </div>
    )
  }

  if (phase === 'racing') {
    return (
      <div className="flex flex-col items-center w-full max-w-[360px]">
        <div className="flex justify-between w-full mb-2">
          <button type="button" onClick={onBack} className="text-yellow-400 text-sm hover:underline opacity-80">← 返回</button>
          <span className="text-gray-500 text-xs">點擊下方按鈕或按鍵 1～{runners.length} 衝刺</span>
        </div>
        {/* 賽道：橫向長度固定，魔方賽跑風格 */}
        <div className="rounded-xl overflow-hidden border-2 border-gray-600 bg-gray-800/80 mb-4" style={{ width: TRACK_LENGTH_PX, height: runners.length * LANE_HEIGHT }}>
          {runners.map((r, i) => (
            <div
              key={r.id}
              className="relative flex items-center border-b border-gray-700 last:border-b-0"
              style={{ height: LANE_HEIGHT }}
            >
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-yellow-500/60" title="起點" />
              <div
                className="absolute top-0 bottom-0 w-1 bg-green-500/80"
                style={{ left: TRACK_LENGTH_PX - 2 }}
                title="終點"
              />
              <div
                className={`absolute rounded-lg border-2 ${r.bg} ${r.border} flex items-center justify-center font-bold ${r.text} shadow-lg transition-transform`}
                style={{
                  width: CUBE_SIZE,
                  height: CUBE_SIZE,
                  left: Math.max(0, r.x),
                  top: (LANE_HEIGHT - CUBE_SIZE) / 2
                }}
              >
                {r.name.charAt(0)}
              </div>
            </div>
          ))}
        </div>
        {/* 衝刺按鈕 */}
        <div className="flex flex-wrap justify-center gap-2 w-full">
          {runners.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => boost(r.id)}
              className={`px-5 py-3 rounded-xl font-bold border-2 ${r.bg} ${r.border} ${r.text} hover:opacity-90 active:scale-95 transition-transform touch-manipulation`}
            >
              {r.name} 衝刺
            </button>
          ))}
        </div>
      </div>
    )
  }

  // finished
  const winnerRunner = runners.find((r) => r.id === winner)
  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full max-w-[320px] mb-3">
        <button type="button" onClick={onBack} className="text-yellow-400 text-sm hover:underline">← 返回</button>
      </div>
      <h3 className="text-xl font-bold text-yellow-400 mb-2">🏁 抵達終點</h3>
      {winnerRunner && (
        <p className={`text-lg font-bold mb-4 px-4 py-2 rounded-xl ${winnerRunner.bg} ${winnerRunner.text}`}>
          {winnerRunner.name} 獲勝
        </p>
      )}
      <button
        type="button"
        onClick={() => { setPhase('setup'); setRunners([]) }}
        className="px-6 py-2.5 bg-gray-600 hover:bg-gray-500 text-white rounded-lg text-sm"
      >
        再玩一次
      </button>
    </div>
  )
}

export default HorizontalRunner
