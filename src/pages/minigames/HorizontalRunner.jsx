// 3D 方塊賽道風格（參考生成圖）：立體賽道、紅欄杆、Q 版角色、問號方塊
import { useState, useEffect, useRef, useCallback } from 'react'

const TRACK_LENGTH_PX = 320
const BLOCK_W = 20
const BLOCK_DEPTH = 14
const TRACK_WIDTH = 56
const CUBE_SIZE = 32
const BASE_SPEED = 85
const JUMP_DURATION = 0.45
const JUMP_HEIGHT = 28
const OBSTACLES = [{ x: 80, w: 22 }, { x: 165, w: 22 }, { x: 250, w: 22 }]
const ITEM_BOXES = [{ x: 110, w: 24 }, { x: 195, w: 24 }, { x: 280, w: 24 }]
const PERSPECTIVE = 600
const TRACK_TILT_X = 22
const TRACK_TILT_Y = -3

const CHARACTERS = [
  { name: '小紅', skin: '#f5d0a9', hair: '#5c3317', shirt: '#e74c3c', short: '#2c3e50' },
  { name: '小藍', skin: '#f5d0a9', hair: '#1e3a5f', shirt: '#3498db', short: '#1a365d' }
]

const GROUND_Y = 28
function getGroundY() {
  return GROUND_Y
}

/** Q 版跑者：側面、跑步擺臂擺腿 */
function RunnerSprite({ character, isJumping, runPhase, size }) {
  const c = character || CHARACTERS[0]
  const s = size / 32
  return (
    <div
      className="absolute"
      style={{
        width: size,
        height: size,
        transform: isJumping ? 'scale(1.06) rotate(-2deg)' : `translateY(${runPhase === 1 ? -2 * s : 0}px)`,
        transition: 'transform 0.07s ease-out'
      }}
    >
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/5 h-1 rounded-full bg-black/20" />
      <div
        className="absolute rounded-full border border-amber-800/25"
        style={{ left: '50%', top: 0, width: size * 0.38, height: size * 0.38, backgroundColor: c.skin, transform: 'translateX(-50%)', boxShadow: 'inset -1px -1px 0 rgba(0,0,0,0.08)' }}
      />
      <div
        className="absolute rounded-full"
        style={{ left: '52%', top: size * 0.02, width: size * 0.28, height: size * 0.16, backgroundColor: c.hair, transform: 'translateX(-50%)', clipPath: 'ellipse(80% 50% at 50% 50%)' }}
      />
      <div
        className="absolute rounded-md border border-black/10"
        style={{ left: size * 0.32, top: size * 0.36, width: size * 0.42, height: size * 0.26, backgroundColor: c.shirt, transform: 'skewX(-4deg)', boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.2)' }}
      />
      <div
        className="absolute rounded-full"
        style={{
          left: size * 0.7, top: size * 0.4, width: size * 0.16, height: size * 0.1,
          backgroundColor: c.skin, transform: `rotate(${runPhase === 0 ? -22 : 10}deg)`, transition: 'transform 0.07s ease-out'
        }}
      />
      <div className="absolute rounded-b" style={{ left: size * 0.38, top: size * 0.6, width: size * 0.1, height: size * 0.2, backgroundColor: c.short, transform: `rotate(${runPhase === 0 ? 12 : -16}deg)`, transition: 'transform 0.07s ease-out' }} />
      <div className="absolute rounded-b" style={{ left: size * 0.54, top: size * 0.62, width: size * 0.1, height: size * 0.18, backgroundColor: c.short, transform: `rotate(${runPhase === 0 ? -18 : 14}deg)`, transition: 'transform 0.07s ease-out' }} />
    </div>
  )
}

export default function HorizontalRunner({ onBack }) {
  const [phase, setPhase] = useState('setup')
  const [playerCount, setPlayerCount] = useState(2)
  const [picks, setPicks] = useState([0, 1])
  const [runners, setRunners] = useState([])
  const [winner, setWinner] = useState(null)
  const rafRef = useRef(null)
  const lastRef = useRef(0)

  const initRunners = useCallback(() => {
    return Array.from({ length: playerCount }, (_, i) => ({
      id: i,
      character: CHARACTERS[picks[i] ?? i],
      x: 0,
      y: GROUND_Y,
      jumpEndAt: 0,
      jumpStartY: null,
      collectedBoxes: [],
      item: null
    }))
  }, [playerCount, picks])

  const startRace = () => {
    setRunners(initRunners())
    setWinner(null)
    setPhase('racing')
  }

  const jump = useCallback((id) => {
    if (phase !== 'racing') return
    const t = performance.now() / 1000
    setRunners((prev) =>
      prev.map((r) => (r.id === id ? { ...r, jumpEndAt: t + JUMP_DURATION, jumpStartY: r.y } : r))
    )
  }, [phase])

  useEffect(() => {
    if (phase !== 'racing' || runners.length === 0) return
    const tick = (now) => {
      const t = now / 1000
      const dt = Math.min((now - lastRef.current) / 1000, 0.06)
      lastRef.current = now

      setRunners((prev) => {
        let hasWinner = false
        let winnerId = null
        const next = prev.map((r) => {
          let x = r.x
          let item = r.item
          let boxes = r.collectedBoxes || []
          const jumping = r.jumpEndAt > t

          for (const box of ITEM_BOXES) {
            if (!item && x + CUBE_SIZE > box.x && x < box.x + box.w && !boxes.includes(box.x)) {
              boxes = [...boxes, box.x]
              item = ['boost', 'shield', 'attack'][Math.floor(Math.random() * 3)]
              break
            }
          }

          if (!jumping) {
            for (const obs of OBSTACLES) {
              if (x + CUBE_SIZE > obs.x && x < obs.x + obs.w) {
                x = Math.max(0, x - 8)
                break
              }
            }
          }

          x = Math.min(x + BASE_SPEED * dt, TRACK_LENGTH_PX - CUBE_SIZE)
          let y = getGroundY()
          if (jumping && r.jumpStartY != null) {
            const p = Math.min(1, Math.max(0, (t - (r.jumpEndAt - JUMP_DURATION)) / JUMP_DURATION))
            y = r.jumpStartY - 4 * JUMP_HEIGHT * p * (1 - p)
          }

          if (x >= TRACK_LENGTH_PX - CUBE_SIZE - 4 && !hasWinner) {
            hasWinner = true
            winnerId = r.id
          }
          return { ...r, x, y, item, collectedBoxes: boxes, jumpEndAt: r.jumpEndAt, jumpStartY: r.jumpStartY }
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
    lastRef.current = performance.now()
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [phase, runners.length])

  useEffect(() => {
    const onKey = (e) => {
      if (phase !== 'racing') return
      if (e.key === ' ' || e.key === 'q') { jump(0); e.preventDefault() }
      if (e.key === 'w') { jump(1); e.preventDefault() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, jump])

  const runPhase = Math.floor(performance.now() / 80) % 2
  const blockCount = Math.ceil(TRACK_LENGTH_PX / BLOCK_W)
  const leadingX = runners.length ? Math.max(...runners.map((r) => r.x)) : 0
  const progressPct = Math.min(100, (leadingX / (TRACK_LENGTH_PX - CUBE_SIZE)) * 100)

  if (phase === 'setup') {
    return (
      <div className="flex flex-col items-center w-full max-w-[340px]">
        <button type="button" onClick={onBack} className="self-start mb-2 text-yellow-400 text-sm hover:underline">← 返回</button>
        <h3 className="text-lg font-bold text-yellow-400 mb-1">3D 方塊賽跑</h3>
        <p className="text-gray-400 text-sm mb-4 text-center">自動前進，看準障礙按跳躍；? 方塊可取得道具。</p>
        <p className="text-gray-500 text-xs mb-2">參賽人數</p>
        <div className="flex gap-2 mb-4">
          {[2].map((n) => (
            <button key={n} type="button" onClick={() => setPlayerCount(n)} className="px-4 py-2 rounded-lg bg-yellow-500 text-gray-900 font-semibold">2 人</button>
          ))}
        </div>
        <p className="text-gray-500 text-xs mb-2">選擇角色</p>
        <div className="flex gap-2 mb-4">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-gray-400 text-sm">{i + 1}P</span>
              {CHARACTERS.map((c, j) => (
                <button
                  key={j}
                  type="button"
                  onClick={() => setPicks((p) => { const n = [...p]; n[i] = j; return n })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${picks[i] === j ? 'ring-2 ring-yellow-400' : 'bg-gray-600 text-gray-400'}`}
                  style={picks[i] === j ? { backgroundColor: c.shirt, color: '#fff' } : {}}
                >
                  {c.name}
                </button>
              ))}
            </div>
          ))}
        </div>
        <button type="button" onClick={startRace} className="px-8 py-3 bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold rounded-xl">開始賽跑</button>
      </div>
    )
  }

  if (phase === 'racing') {
    return (
      <div className="flex flex-col items-center w-full max-w-[360px]">
        <div className="w-full mb-2 flex justify-between items-center">
          <button type="button" onClick={onBack} className="text-yellow-400 text-sm hover:underline">← 返回</button>
          <span className="text-amber-400 font-bold text-sm">3D 方塊賽跑</span>
        </div>
        <div className="w-full h-2.5 rounded-full bg-gray-700 overflow-hidden border border-gray-600 mb-2">
          <div className="h-full rounded-full bg-green-500 transition-all duration-150" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="flex flex-wrap gap-2 mb-2 justify-center">
          {runners.map((r) => (
            <div key={r.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-700 text-white text-xs font-bold">
              <span className="w-5 h-5 rounded-full border border-white/50" style={{ backgroundColor: r.character?.skin }} />
              {r.character?.name}
            </div>
          ))}
        </div>

        {/* 3D 賽道：透視 + 方塊（草頂/土側）+ 紅欄杆 + 背景 */}
        <div
          className="relative rounded-2xl overflow-hidden mb-4"
          style={{
            width: TRACK_LENGTH_PX + 24,
            height: 140,
            perspective: PERSPECTIVE,
            boxShadow: '0 12px 24px rgba(0,0,0,0.3)'
          }}
        >
          {/* 背景：天空、雲、房子、樹 */}
          <div className="absolute inset-0 bg-gradient-to-b from-sky-200 via-sky-300 to-sky-400" />
          <div className="absolute top-1 left-[10%] w-12 h-6 rounded-full bg-white/80 shadow" />
          <div className="absolute top-4 right-[15%] w-10 h-5 rounded-full bg-white/70 shadow" />
          <div className="absolute right-3 bottom-[38%] flex flex-col items-end" style={{ transform: 'scale(0.9)' }}>
            <div className="w-9 h-5 rounded-t border border-red-900/30" style={{ background: 'linear-gradient(180deg, #dc2626 0%, #b91c1c 100%)' }} />
            <div className="w-10 h-6 border border-stone-300 bg-white" />
            <div className="flex gap-0.5 mt-0.5">
              <div className="w-3 h-4 rounded-full border border-green-800/40" style={{ background: '#22c55e' }} />
              <div className="w-4 h-4 rounded-full border border-green-800/40" style={{ background: '#4ade80' }} />
              <div className="w-2.5 h-3 rounded-sm border border-amber-800/50" style={{ background: '#78350f' }} />
            </div>
          </div>
          <div className="absolute left-[18%] bottom-[35%] flex items-end gap-0.5" style={{ transform: 'scale(0.75)' }}>
            <div className="w-5 h-5 rounded-full border border-green-800/40" style={{ background: '#16a34a' }} />
            <div className="w-3 h-4 rounded-sm border border-amber-800/50" style={{ background: '#92400e' }} />
          </div>

          {/* 賽道 3D 容器：傾斜以露出頂面與前緣 */}
          <div
            className="absolute left-2 right-2 rounded-xl overflow-visible"
            style={{
              width: TRACK_LENGTH_PX,
              height: TRACK_WIDTH + BLOCK_DEPTH + 16,
              bottom: 8,
              top: 12,
              transformStyle: 'preserve-3d',
              transform: `rotateX(${TRACK_TILT_X}deg) rotateY(${TRACK_TILT_Y}deg)`,
              transformOrigin: 'center bottom'
            }}
          >
            {/* 方塊賽道：每格有頂面(草) + 前緣(土) */}
            <div className="absolute flex" style={{ left: 0, bottom: 0, height: TRACK_WIDTH + BLOCK_DEPTH }}>
              {Array.from({ length: blockCount }, (_, i) => (
                <div key={i} className="shrink-0 flex flex-col" style={{ width: BLOCK_W, height: TRACK_WIDTH + BLOCK_DEPTH }}>
                  <div
                    className="flex-shrink-0 rounded-t-sm border border-green-800/20"
                    style={{
                      height: TRACK_WIDTH,
                      background: 'linear-gradient(180deg, #9ccc65 0%, #7cb342 25%, #558b2f 70%, #33691e 100%)',
                      boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.25), 1px 0 0 rgba(0,0,0,0.08)'
                    }}
                  />
                  <div
                    className="flex-shrink-0 rounded-b-sm border border-amber-900/40"
                    style={{
                      height: BLOCK_DEPTH,
                      background: 'linear-gradient(180deg, #a67c52 0%, #8B6914 30%, #6d4e0a 70%, #4a3520 100%)',
                      boxShadow: 'inset 2px 0 0 rgba(255,255,255,0.1), inset -2px 0 0 rgba(0,0,0,0.2)'
                    }}
                  />
                </div>
              ))}
            </div>

            {/* 紅欄杆（左側） */}
            <div
              className="absolute left-0 rounded-l top-0 z-[4]"
              style={{
                width: 8,
                height: TRACK_WIDTH + BLOCK_DEPTH,
                background: 'linear-gradient(90deg, #ef4444 0%, #dc2626 40%, #b91c1c 100%)',
                boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.3), 2px 0 4px rgba(0,0,0,0.2)',
                borderLeft: '2px solid #991b1b'
              }}
            />

            {/* 障礙：小方塊 */}
            {OBSTACLES.map((obs, i) => (
              <div key={i} className="absolute bottom-0 z-[5] flex flex-col items-center" style={{ left: obs.x, width: obs.w }}>
                <div className="w-full h-2 rounded-t bg-stone-500 border border-stone-600" />
                <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[14px] border-b-red-600" />
              </div>
            ))}

            {/* 問號方塊：稜鏡閃爍 */}
            {ITEM_BOXES.map((box) => {
              const show = runners.some((r) => !(r.collectedBoxes || []).includes(box.x))
              if (!show) return null
              return (
                <div key={box.x} className="absolute bottom-0 z-[6] flex items-center justify-center" style={{ left: box.x, width: box.w, height: TRACK_WIDTH + BLOCK_DEPTH }}>
                  <div
                    className="w-6 h-6 rounded flex items-center justify-center text-sm font-bold text-white/90"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255,120,180,0.6) 0%, rgba(120,200,255,0.6) 30%, rgba(150,255,150,0.6) 60%, rgba(255,220,120,0.6) 100%)',
                      boxShadow: '0 0 14px rgba(200,150,255,0.6), inset 0 0 10px rgba(255,255,255,0.4), 0 2px 8px rgba(0,0,0,0.2)',
                      border: '2px solid rgba(255,255,255,0.6)',
                      animation: 'shimmer 2s ease-in-out infinite'
                    }}
                  >
                    <style>{`@keyframes shimmer { 0%,100%{ filter: brightness(1); } 50%{ filter: brightness(1.15); } }`}</style>
                    ?
                  </div>
                </div>
              )
            })}

            {/* 終點 */}
            <div className="absolute bottom-0 right-0 z-[5] flex flex-col items-end" style={{ left: TRACK_LENGTH_PX - 26 }}>
              <div className="text-[8px] font-black text-white px-1.5 py-0.5 rounded border border-amber-500 bg-gray-900">GOAL</div>
              <div className="flex mt-0.5">
                <div className="w-1 bg-stone-600 rounded-full" />
                <div className="w-4 border-l-2 border-stone-600" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #fff 0, #fff 2px, #1a1a1a 2px, #1a1a1a 4px)' }} />
              </div>
            </div>

            {/* 角色 */}
            {runners.map((r) => (
              <div
                key={r.id}
                className="absolute z-10"
                style={{
                  left: Math.max(0, r.x),
                  top: TRACK_WIDTH - CUBE_SIZE - (GROUND_Y - (r.y ?? GROUND_Y)),
                  width: CUBE_SIZE,
                  height: CUBE_SIZE
                }}
              >
                <RunnerSprite
                  character={r.character}
                  isJumping={r.jumpEndAt > performance.now() / 1000}
                  runPhase={runPhase}
                  size={CUBE_SIZE}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-3 w-full">
          {runners.map((r) => (
            <div key={r.id} className="rounded-xl border-2 border-gray-600 bg-gray-700 p-2 min-w-[100px]">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="w-6 h-6 rounded-full border border-white/50" style={{ backgroundColor: r.character?.skin }} />
                <span className="text-white text-xs font-bold">{r.character?.name}</span>
              </div>
              <button type="button" onClick={() => jump(r.id)} className="w-full py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-gray-900 text-sm font-bold">⬆ 跳躍</button>
            </div>
          ))}
        </div>
        <p className="text-gray-500 text-[11px] mt-1">1P 空白/Q　2P W</p>
      </div>
    )
  }

  const win = runners.find((r) => r.id === winner)
  return (
    <div className="flex flex-col items-center w-full max-w-[320px]">
      <button type="button" onClick={onBack} className="self-start mb-2 text-yellow-400 text-sm hover:underline">← 返回</button>
      <h3 className="text-lg font-bold text-yellow-400 mb-3">🏁 抵達終點</h3>
      {win && (
        <div className="flex items-center gap-3 px-5 py-4 rounded-2xl border-2 border-yellow-500/50 bg-gray-700 mb-4">
          <span className="w-10 h-10 rounded-full border-2 border-white/50" style={{ backgroundColor: win.character?.skin }} />
          <div>
            <div className="text-white font-bold">{win.character?.name} 獲勝</div>
            <div className="text-gray-400 text-sm">恭喜率先衝過終點</div>
          </div>
        </div>
      )}
      <button type="button" onClick={() => { setPhase('setup'); setRunners([]) }} className="px-6 py-2.5 bg-gray-600 hover:bg-gray-500 text-white rounded-lg text-sm">再玩一次</button>
    </div>
  )
}
