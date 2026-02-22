// 多人跑步橫向移動（參考魔方賽跑 Running Strike：道具箱、攻擊對手、護盾）
import { useState, useEffect, useRef, useCallback } from 'react'

const TRACK_LENGTH_PX = 320
const BLOCK_SIZE = 20
const LANE_HEIGHT = 56
const CUBE_SIZE = 36
const BOOST = 88
const FRICTION = 0.986
const MAX_SPEED = 380
const JUMP_DURATION = 0.38
const STUN_DURATION = 0.65
const ATTACK_STUN = 1.2
const SHIELD_DURATION = 2

// 障礙物位置（每條跑道相同）
const OBSTACLES = [
  { x: 70, w: 22 },
  { x: 150, w: 22 },
  { x: 230, w: 22 }
]

// 道具箱位置（觸碰取得，隨機獲得 衝刺/護盾/攻擊）
const ITEM_BOXES = [
  { x: 95, w: 24 },
  { x: 175, w: 24 },
  { x: 255, w: 24 }
]

const ITEM_TYPES = [
  { id: 'boost', label: '衝刺', icon: '⚡' },
  { id: 'shield', label: '護盾', icon: '🛡' },
  { id: 'attack', label: '攻擊', icon: '💥' }
]

const LANE_COLORS = [
  { bg: 'bg-amber-500', border: 'border-amber-400', text: 'text-amber-900' },
  { bg: 'bg-emerald-500', border: 'border-emerald-400', text: 'text-emerald-900' },
  { bg: 'bg-sky-500', border: 'border-sky-400', text: 'text-sky-900' },
  { bg: 'bg-rose-500', border: 'border-rose-400', text: 'text-rose-900' }
]

const RANK_LABELS = ['1st', '2nd', '3rd', '4th']

function HorizontalRunner({ onBack }) {
  const [phase, setPhase] = useState('setup')
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
      isJumping: false,
      jumpEndAt: 0,
      stunnedUntil: 0,
      shieldUntil: 0,
      item: null,
      collectedBoxes: [],
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

  const jump = useCallback((runnerId) => {
    if (phase !== 'racing') return
    const now = performance.now() / 1000
    setRunners((prev) =>
      prev.map((r) =>
        r.id === runnerId ? { ...r, isJumping: true, jumpEndAt: now + JUMP_DURATION } : r
      )
    )
  }, [phase])

  const useItem = useCallback((runnerId) => {
    if (phase !== 'racing') return
    const now = performance.now() / 1000
    setRunners((prev) => {
      const me = prev.find((r) => r.id === runnerId)
      if (!me || !me.item) return prev
      if (me.item === 'boost') {
        return prev.map((r) =>
          r.id === runnerId
            ? { ...r, speed: Math.min(MAX_SPEED, (r.speed || 0) + BOOST * 1.2), item: null }
            : r
        )
      }
      if (me.item === 'shield') {
        return prev.map((r) =>
          r.id === runnerId ? { ...r, shieldUntil: now + SHIELD_DURATION, item: null } : r
        )
      }
      if (me.item === 'attack') {
        const ahead = prev.filter((r) => r.x > me.x).sort((a, b) => b.x - a.x)[0]
        const target = ahead || prev.filter((r) => r.id !== runnerId).sort((a, b) => b.x - a.x)[0]
        const targetId = target?.id
        const targetShielded = target && (target.shieldUntil || 0) > now
        return prev.map((r) => {
          if (r.id === runnerId) return { ...r, item: null }
          if (r.id === targetId && !targetShielded) return { ...r, stunnedUntil: Math.max(r.stunnedUntil || 0, now + ATTACK_STUN) }
          return r
        })
      }
      return prev
    })
  }, [phase])

  useEffect(() => {
    if (phase !== 'racing' || runners.length === 0) return

    const tick = (now) => {
      const t = now / 1000
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.08)
      lastTimeRef.current = now

      setRunners((prev) => {
        let hasWinner = false
        let winnerId = null
        const next = prev.map((r) => {
          let x = r.x
          let speed = r.speed
          let item = r.item
          let collectedBoxes = r.collectedBoxes || []
          const isJumping = r.jumpEndAt > t
          const stunned = r.stunnedUntil > t
          const shielded = r.shieldUntil > t

          // 道具箱：觸碰取得（若尚未持有道具）
          if (!item) {
            for (const box of ITEM_BOXES) {
              if (r.x + CUBE_SIZE > box.x && r.x < box.x + box.w && !collectedBoxes.includes(box.x)) {
                collectedBoxes = [...collectedBoxes, box.x]
                item = ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)].id
                break
              }
            }
          }

          if (stunned) {
            speed = 0
          } else if (!isJumping && !shielded) {
            let hit = false
            for (const obs of OBSTACLES) {
              if (r.x + CUBE_SIZE > obs.x && r.x < obs.x + obs.w) {
                hit = true
                break
              }
            }
            if (hit) {
              speed = 0
              x = Math.max(0, x - 8)
              if (r.stunnedUntil <= t) {
                return { ...r, x, speed, stunnedUntil: t + STUN_DURATION, item, collectedBoxes, shieldUntil: r.shieldUntil }
              }
            }
          }

          if (!stunned) {
            speed = speed * FRICTION
            if (speed < 1.5) speed = 0
            x = Math.min(r.x + speed * dt, TRACK_LENGTH_PX - CUBE_SIZE)
          }

          if (x >= TRACK_LENGTH_PX - CUBE_SIZE - 2 && !hasWinner) {
            hasWinner = true
            winnerId = r.id
          }

          return {
            ...r,
            x,
            speed,
            isJumping,
            jumpEndAt: r.jumpEndAt,
            stunnedUntil: r.stunnedUntil,
            shieldUntil: r.shieldUntil,
            item,
            collectedBoxes
          }
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

  useEffect(() => {
    const onKeyDown = (e) => {
      if (phase !== 'racing') return
      const k = e.key.toLowerCase()
      if (k === '1') { boost(0); e.preventDefault() }
      else if (k === '2') { boost(1); e.preventDefault() }
      else if (k === '3') { boost(2); e.preventDefault() }
      else if (k === '4') { boost(3); e.preventDefault() }
      else if (k === 'q') { jump(0); e.preventDefault() }
      else if (k === 'w') { jump(1); e.preventDefault() }
      else if (k === 'e') { jump(2); e.preventDefault() }
      else if (k === 'r') { jump(3); e.preventDefault() }
      else if (k === 'a') { useItem(0); e.preventDefault() }
      else if (k === 's') { useItem(1); e.preventDefault() }
      else if (k === 'd') { useItem(2); e.preventDefault() }
      else if (k === 'f') { useItem(3); e.preventDefault() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [phase, boost, jump, useItem])

  // 依 x 排序算出名次
  const ranked = [...runners].sort((a, b) => b.x - a.x)
  const rankById = {}
  ranked.forEach((r, i) => { rankById[r.id] = i })

  if (phase === 'setup') {
    return (
      <div className="flex flex-col items-center">
        <div className="flex justify-between w-full max-w-[320px] mb-3">
          <button type="button" onClick={onBack} className="text-yellow-400 text-sm hover:underline">← 返回</button>
        </div>
        <h3 className="text-lg font-bold text-yellow-400 mb-1">多人跑步 · 魔方賽跑風格</h3>
        <p className="text-gray-400 text-sm mb-4 text-center">方塊地形、障礙跳躍、賽道上的★道具箱觸碰取得（衝刺／護盾／攻擊），可攻擊領先者，先到終點勝。</p>
        <p className="text-gray-500 text-xs mb-3">選擇參賽人數</p>
        <div className="flex gap-3 mb-6">
          {[2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPlayerCount(n)}
              className={`px-5 py-2.5 rounded-xl font-semibold transition-all ${
                playerCount === n ? 'bg-yellow-400 text-gray-900 ring-2 ring-yellow-300' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
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
    const blockCount = Math.ceil(TRACK_LENGTH_PX / BLOCK_SIZE)

    return (
      <div className="flex flex-col items-center w-full max-w-[360px]">
        <div className="flex justify-between items-start w-full mb-2">
          <button type="button" onClick={onBack} className="text-yellow-400 text-sm hover:underline opacity-80">← 返回</button>
          <div className="flex flex-wrap gap-1 justify-end max-w-[200px]">
            {runners.map((r) => (
              <span key={r.id} className={`text-xs font-bold px-1.5 py-0.5 rounded ${r.bg} ${r.text}`}>
                {RANK_LABELS[rankById[r.id] ?? 0]} {r.name}
              </span>
            ))}
          </div>
        </div>

        {/* 天空 + 賽道區（方塊地形、障礙物） */}
        <div
          className="relative rounded-xl overflow-hidden border-2 border-gray-600 mb-4 shadow-lg"
          style={{ width: TRACK_LENGTH_PX, height: runners.length * LANE_HEIGHT + 24 }}
        >
          {/* 天空背景 */}
          <div className="absolute inset-0 bg-gradient-to-b from-sky-400 to-sky-600" />
          <div className="relative" style={{ width: TRACK_LENGTH_PX, height: runners.length * LANE_HEIGHT }}>
            {runners.map((r, laneIndex) => (
              <div key={r.id} className="absolute left-0 right-0 flex" style={{ top: laneIndex * LANE_HEIGHT, height: LANE_HEIGHT }}>
                {/* 方塊地形：土 + 草 */}
                {Array.from({ length: blockCount }, (_, i) => (
                  <div
                    key={i}
                    className="relative shrink-0 border border-amber-800/50"
                    style={{ width: BLOCK_SIZE, height: LANE_HEIGHT }}
                  >
                    <div className="absolute inset-0 bg-amber-800/90" />
                    <div className="absolute left-0 right-0 top-0 h-2 bg-green-600 border-b border-green-500/80" />
                  </div>
                ))}
                {/* 障礙物（尖刺/方塊） */}
                {OBSTACLES.map((obs, oi) => (
                  <div
                    key={oi}
                    className="absolute top-0 bottom-0 flex items-end justify-center pb-0.5"
                    style={{ left: obs.x, width: obs.w, height: LANE_HEIGHT }}
                  >
                    <div className="w-full h-5 bg-gray-700 border-2 border-gray-500 rounded-t flex items-center justify-center">
                      <span className="text-red-500 text-xs">◆</span>
                    </div>
                  </div>
                ))}
                {/* 道具箱（觸碰取得，已取得則不顯示） */}
                {ITEM_BOXES.map((box) =>
                  !(r.collectedBoxes || []).includes(box.x) ? (
                    <div
                      key={box.x}
                      className="absolute top-1/2 left-0 -translate-y-1/2 flex items-center justify-center"
                      style={{ left: box.x, width: box.w, height: LANE_HEIGHT }}
                    >
                      <div className="w-6 h-6 rounded bg-yellow-400 border-2 border-yellow-500 flex items-center justify-center text-sm shadow">
                        ★
                      </div>
                    </div>
                  ) : null
                )}
                {/* 終點旗 */}
                <div
                  className="absolute top-0 bottom-0 w-1 bg-green-500 flex items-center justify-center"
                  style={{ left: TRACK_LENGTH_PX - 4 }}
                >
                  <span className="text-white text-[10px] font-bold -rotate-90 whitespace-nowrap">END</span>
                </div>
                {/* 跑者（護盾時外圈發光） */}
                <div
                  className={`absolute rounded-lg border-2 ${r.bg} ${r.border} flex items-center justify-center font-bold ${r.text} shadow-lg transition-all duration-75 ${
                    r.isJumping ? 'scale-110 shadow-xl' : ''
                  } ${r.stunnedUntil > performance.now() / 1000 ? 'opacity-70' : ''} ${
                    r.shieldUntil > performance.now() / 1000 ? 'ring-2 ring-cyan-400 ring-offset-1 ring-offset-gray-800' : ''
                  }`}
                  style={{
                    width: CUBE_SIZE,
                    height: CUBE_SIZE,
                    left: Math.max(0, r.x),
                    top: (LANE_HEIGHT - CUBE_SIZE) / 2,
                    transform: r.isJumping ? 'translateY(-6px)' : undefined
                  }}
                >
                  {r.name.charAt(0)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 操作：跳躍、衝刺、使用道具（魔方賽跑風格） */}
        <div className="flex flex-wrap justify-center gap-3 w-full">
          {runners.map((r) => {
            const itemInfo = ITEM_TYPES.find((it) => it.id === r.item)
            return (
              <div key={r.id} className="flex flex-col items-center gap-1">
                <span className={`text-xs font-semibold ${r.bg} ${r.text} px-2 py-0.5 rounded`}>
                  {r.name}
                  {itemInfo && <span className="ml-1" title={itemInfo.label}>{itemInfo.icon}</span>}
                </span>
                <div className="flex flex-wrap gap-2 justify-center">
                  <button
                    type="button"
                    onClick={() => jump(r.id)}
                    className="px-3 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-white text-sm font-medium border border-gray-500 touch-manipulation active:scale-95"
                    title={`跳躍 (${['Q','W','E','R'][r.id]})`}
                  >
                    ⬆ 跳躍
                  </button>
                  <button
                    type="button"
                    onClick={() => boost(r.id)}
                    className={`px-3 py-2 rounded-lg font-bold border-2 ${r.bg} ${r.border} ${r.text} hover:opacity-90 active:scale-95 touch-manipulation`}
                    title={`衝刺 (${r.id + 1})`}
                  >
                    ⚡ 衝刺
                  </button>
                  <button
                    type="button"
                    onClick={() => useItem(r.id)}
                    disabled={!r.item}
                    title={`使用道具 (${['A','S','D','F'][r.id]})`}
                    className={`px-3 py-2 rounded-lg text-sm font-bold border-2 touch-manipulation active:scale-95 ${
                      r.item ? 'bg-yellow-500/20 border-yellow-400 text-yellow-300 hover:bg-yellow-500/30' : 'bg-gray-700 border-gray-600 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {itemInfo ? `${itemInfo.icon} 使用` : '無道具'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-gray-500 text-[11px] mt-2">鍵盤：1～4 衝刺 · Q/W/E/R 跳躍 · A/S/D/F 使用道具</p>
      </div>
    )
  }

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
