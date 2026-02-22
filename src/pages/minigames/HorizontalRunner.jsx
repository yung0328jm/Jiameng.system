// 魔方賽跑風格：卡通角色、3D 方塊場地、遊戲感 UI
import { useState, useEffect, useRef, useCallback } from 'react'

const TRACK_LENGTH_PX = 360
const BLOCK_SIZE = 24
const TRACK_HEIGHT = 96
const BLOCK_DEPTH = 20
const CUBE_SIZE = 40
const RUN_CYCLE_MS = 90
const TRACK_3D_ANGLE = 16
const FENCE_HEIGHT = 12
const BASE_SPEED = 98
const BOOST_FROM_ITEM = 140
const JUMP_DURATION = 0.4
const STUN_DURATION = 0.85
const ATTACK_STUN = 1.2
const SHIELD_DURATION = 2
const ITEM_BOOST_DURATION = 0.9

const OBSTACLES = [
  { x: 70, w: 28, type: 'crate' },
  { x: 155, w: 28, type: 'spike' },
  { x: 240, w: 28, type: 'crate' }
]

const ITEM_BOXES = [
  { x: 105, w: 28 },
  { x: 190, w: 28 },
  { x: 275, w: 28 }
]

const ITEM_TYPES = [
  { id: 'boost', label: '衝刺', icon: '⚡' },
  { id: 'shield', label: '護盾', icon: '🛡' },
  { id: 'attack', label: '攻擊', icon: '💥' }
]

const RANK_LABELS = ['1st', '2nd', '3rd', '4th']

// 魔方賽跑風格角色：膚色、髮色、衣服色（卡通感）
const CHARACTERS = [
  { id: 0, name: '小紅', short: '紅', skin: '#f5d0a9', hair: '#5c3317', shirt: '#e74c3c', shortColor: '#2c3e50', bg: 'bg-red-500', border: 'border-red-400', text: 'text-red-900', headBg: 'bg-amber-200', bodyBg: 'bg-red-500' },
  { id: 1, name: '小綠', short: '綠', skin: '#f5d0a9', hair: '#1a472a', shirt: '#27ae60', shortColor: '#1e3a2a', bg: 'bg-emerald-500', border: 'border-emerald-400', text: 'text-emerald-900', headBg: 'bg-amber-200', bodyBg: 'bg-emerald-500' },
  { id: 2, name: '小藍', short: '藍', skin: '#f5d0a9', hair: '#1e3a5f', shirt: '#3498db', shortColor: '#1a365d', bg: 'bg-sky-500', border: 'border-sky-400', text: 'text-sky-900', headBg: 'bg-amber-200', bodyBg: 'bg-sky-500' },
  { id: 3, name: '小粉', short: '粉', skin: '#f5d0a9', hair: '#6b2d5c', shirt: '#e91e63', shortColor: '#4a1942', bg: 'bg-pink-500', border: 'border-pink-400', text: 'text-pink-900', headBg: 'bg-amber-200', bodyBg: 'bg-pink-500' }
]

/** 魔方賽跑風格跑者：側面 Q 版、跑步循環動畫（手腳擺動 + 輕微起伏） */
function RunnerSprite({ character, isJumping, stunned, shield, boost, size = 40, runPhase = 0 }) {
  const c = character || CHARACTERS[0]
  const s = size / 40
  const isRunning = !stunned && !isJumping
  const leftLegRot = isRunning ? (runPhase === 0 ? 15 : -18) : 15
  const rightLegRot = isRunning ? (runPhase === 0 ? -20 : 12) : -20
  const armRot = isRunning ? (runPhase === 0 ? -25 : 12) : -25
  const bobY = isRunning ? (runPhase === 0 ? 0 : -2 * s) : 0
  const jumpY = isJumping ? -10 * s : 0
  const totalY = jumpY + bobY
  return (
    <div
      className={`absolute will-change-transform ${stunned ? 'opacity-70' : ''} ${shield ? 'drop-shadow-[0_0_8px_rgba(34,211,238,0.9)]' : ''} ${boost ? 'drop-shadow-[0_0_8px_rgba(250,204,21,0.9)]' : ''}`}
      style={{
        width: size,
        height: size,
        transition: isJumping ? 'none' : 'transform 0.08s ease-out',
        transform: totalY !== 0 ? `translateY(${totalY}px)${isJumping ? ' scale(1.05)' : ''}` : undefined
      }}
    >
      {/* 跑步動線（魔方賽跑參考：速度感） */}
      {isRunning && (
        <>
          <div className="absolute rounded-full border-2 border-white/40 pointer-events-none" style={{ left: -size * 0.5, top: size * 0.2, width: size * 0.5, height: size * 0.5 }} />
          <div className="absolute rounded-full border-2 border-white/30 pointer-events-none" style={{ left: -size * 0.7, top: size * 0.35, width: size * 0.4, height: size * 0.4 }} />
          <div className="absolute rounded-full border border-white/25 pointer-events-none" style={{ left: -size * 0.4, top: size * 0.5, width: size * 0.35, height: size * 0.35 }} />
        </>
      )}
      {/* 地面陰影 */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full bg-black/25"
        style={{ width: size * 0.6, height: size * 0.12 }}
      />
      {/* 頭（膚色 + 髮片） */}
      <div
        className="absolute rounded-full border-2 border-amber-800/30"
        style={{
          left: size * 0.5,
          top: 0,
          width: size * 0.4,
          height: size * 0.4,
          backgroundColor: c.skin,
          transform: 'translateX(-50%)',
          boxShadow: 'inset -2px -2px 0 rgba(0,0,0,0.1)'
        }}
      />
      <div
        className="absolute rounded-full border border-amber-900/20"
        style={{
          left: size * 0.52,
          top: size * 0.02,
          width: size * 0.32,
          height: size * 0.2,
          backgroundColor: c.hair,
          transform: 'translateX(-50%)',
          clipPath: 'ellipse(80% 50% at 50% 50%)'
        }}
      />
      {/* 身體（上衣） */}
      <div
        className="absolute rounded-md border-2 border-black/15"
        style={{
          left: size * 0.35,
          top: size * 0.38,
          width: size * 0.45,
          height: size * 0.28,
          backgroundColor: c.shirt,
          transform: 'skewX(-5deg)',
          boxShadow: 'inset 2px 0 0 rgba(255,255,255,0.2), inset -1px -1px 0 rgba(0,0,0,0.15)'
        }}
      />
      {/* 前臂（跑步擺臂，隨 runPhase 前後擺動） */}
      <div
        className="absolute rounded-full"
        style={{
          left: size * 0.72,
          top: size * 0.42,
          width: size * 0.18,
          height: size * 0.12,
          backgroundColor: c.skin,
          transform: `rotate(${armRot}deg)`,
          transition: 'transform 0.08s ease-out',
          boxShadow: '1px 1px 0 rgba(0,0,0,0.1)'
        }}
      />
      {/* 左腿（跑步循環） */}
      <div
        className="absolute rounded-b"
        style={{
          left: size * 0.42,
          top: size * 0.62,
          width: size * 0.12,
          height: size * 0.22,
          backgroundColor: c.shortColor,
          transform: `rotate(${leftLegRot}deg)`,
          transition: 'transform 0.08s ease-out',
          boxShadow: '1px 1px 0 rgba(0,0,0,0.15)'
        }}
      />
      {/* 右腿（跑步循環） */}
      <div
        className="absolute rounded-b"
        style={{
          left: size * 0.58,
          top: size * 0.66,
          width: size * 0.12,
          height: size * 0.2,
          backgroundColor: c.shortColor,
          transform: `rotate(${rightLegRot}deg)`,
          transition: 'transform 0.08s ease-out',
          boxShadow: '1px 1px 0 rgba(0,0,0,0.15)'
        }}
      />
    </div>
  )
}

function HorizontalRunner({ onBack }) {
  const [phase, setPhase] = useState('setup')
  const [playerCount, setPlayerCount] = useState(2)
  const [characterPicks, setCharacterPicks] = useState([0, 1, 0, 0])
  const [runners, setRunners] = useState([])
  const [winner, setWinner] = useState(null)
  const rafRef = useRef(null)
  const lastTimeRef = useRef(0)

  const initRunners = useCallback((count, picks) => {
    return Array.from({ length: count }, (_, i) => {
      const char = CHARACTERS[picks[i] ?? i]
      return {
        id: i,
        name: `${i + 1}P`,
        characterId: char?.id ?? i,
        character: char ?? CHARACTERS[i % CHARACTERS.length],
        x: 0,
        isJumping: false,
        jumpEndAt: 0,
        stunnedUntil: 0,
        shieldUntil: 0,
        boostUntil: 0,
        item: null,
        collectedBoxes: [],
        bg: char?.bg ?? CHARACTERS[i % CHARACTERS.length].bg,
        border: char?.border ?? CHARACTERS[i % CHARACTERS.length].border,
        text: char?.text ?? CHARACTERS[i % CHARACTERS.length].text
      }
    })
  }, [])

  const startRace = () => {
    const picks = characterPicks.slice(0, playerCount)
    setRunners(initRunners(playerCount, picks))
    setWinner(null)
    setPhase('racing')
  }

  const setCharacterFor = (playerIndex, characterId) => {
    setCharacterPicks((prev) => {
      const next = [...prev]
      next[playerIndex] = characterId
      return next
    })
  }

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
          r.id === runnerId ? { ...r, boostUntil: now + ITEM_BOOST_DURATION, item: null } : r
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
          let item = r.item
          let collectedBoxes = r.collectedBoxes || []
          const isJumping = r.jumpEndAt > t
          const stunned = r.stunnedUntil > t
          const shielded = r.shieldUntil > t
          const boosting = r.boostUntil > t
          const moveSpeed = stunned ? 0 : (boosting ? BOOST_FROM_ITEM : BASE_SPEED)

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

          if (!stunned && !isJumping && !shielded) {
            let hit = false
            for (const obs of OBSTACLES) {
              if (r.x + CUBE_SIZE > obs.x && r.x < obs.x + obs.w) {
                hit = true
                break
              }
            }
            if (hit) {
              x = Math.max(0, x - 6)
              if (r.stunnedUntil <= t) {
                return { ...r, x, stunnedUntil: t + STUN_DURATION, item, collectedBoxes, shieldUntil: r.shieldUntil, boostUntil: r.boostUntil }
              }
            }
          }
          if (!stunned) {
            x = Math.min(r.x + moveSpeed * dt, TRACK_LENGTH_PX - CUBE_SIZE)
          }

          if (x >= TRACK_LENGTH_PX - CUBE_SIZE - 2 && !hasWinner) {
            hasWinner = true
            winnerId = r.id
          }

          return {
            ...r,
            x,
            isJumping,
            jumpEndAt: r.jumpEndAt,
            stunnedUntil: r.stunnedUntil,
            shieldUntil: r.shieldUntil,
            boostUntil: r.boostUntil,
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
      if (k === ' ' || k === 'q') { jump(0); e.preventDefault() }
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
  }, [phase, jump, useItem])

  // 依 x 排序算出名次
  const ranked = [...runners].sort((a, b) => b.x - a.x)
  const rankById = {}
  ranked.forEach((r, i) => { rankById[r.id] = i })

  if (phase === 'setup') {
    return (
      <div className="flex flex-col items-center w-full max-w-[360px]">
        <div className="flex justify-between w-full mb-2">
          <button type="button" onClick={onBack} className="px-3 py-1.5 rounded-lg bg-gray-700/80 text-gray-300 hover:bg-gray-600 text-sm border border-gray-600">← 返回</button>
        </div>
        {/* 遊戲 Logo 風格標題 */}
        <div className="mb-4 px-6 py-3 rounded-2xl border-2 border-amber-500/60 shadow-lg" style={{ background: 'linear-gradient(180deg, #f59e0b 0%, #d97706 50%, #b45309 100%)', boxShadow: '0 4px 0 #92400e, 0 6px 12px rgba(0,0,0,0.3)' }}>
          <h2 className="text-2xl font-black text-amber-100 drop-shadow-md tracking-wide">魔方賽跑</h2>
          <p className="text-amber-200/90 text-xs mt-0.5">Cube Run</p>
        </div>
        <p className="text-gray-400 text-sm mb-4 text-center max-w-[280px]">跑者自動前進，看準障礙按跳躍；★ 道具箱可取得衝刺／護盾／攻擊。</p>
        <p className="text-amber-200/80 text-xs font-semibold mb-2 uppercase tracking-wider">參賽人數</p>
        <div className="flex gap-2 mb-5">
          {[2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPlayerCount(n)}
              className={`px-5 py-2.5 rounded-xl font-bold transition-all border-2 ${
                playerCount === n
                  ? 'bg-amber-400 text-gray-900 border-amber-300 shadow-lg shadow-amber-500/30 scale-105'
                  : 'bg-gray-600 text-gray-300 border-gray-500 hover:bg-gray-500 hover:border-gray-400'
              }`}
            >
              {n} 人
            </button>
          ))}
        </div>
        <p className="text-amber-200/80 text-xs font-semibold mb-2 uppercase tracking-wider">選擇角色（每位玩家選一個）</p>
        <div className="space-y-4 mb-6 w-full">
          {Array.from({ length: playerCount }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-amber-400 font-black text-sm w-8 h-8 rounded-full bg-gray-700 border-2 border-amber-500/50 flex items-center justify-center">{i + 1}P</span>
              <div className="flex gap-2 flex-wrap">
                {CHARACTERS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCharacterFor(i, c.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                      characterPicks[i] === c.id
                        ? `${c.bg} ${c.text} border-2 shadow-lg ring-2 ring-amber-300/50 ring-offset-2 ring-offset-gray-800`
                        : 'bg-gray-700/80 border-gray-600 text-gray-400 hover:border-gray-500 hover:bg-gray-600'
                    }`}
                  >
                    <span className="w-8 h-8 rounded-full border-2 flex items-center justify-center" style={{ backgroundColor: c.skin, borderColor: characterPicks[i] === c.id ? 'currentColor' : '#4b5563' }}>
                      <span className="w-4 h-3 rounded-full opacity-80" style={{ backgroundColor: c.hair }} />
                    </span>
                    <span>{c.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={startRace}
          className="px-10 py-3.5 rounded-2xl font-black text-lg text-amber-950 border-2 border-amber-300 shadow-lg transition-all hover:scale-105 active:scale-95"
          style={{ background: 'linear-gradient(180deg, #fcd34d 0%, #f59e0b 50%, #d97706 100%)', boxShadow: '0 4px 0 #b45309, 0 8px 20px rgba(245,158,11,0.4)' }}
        >
          開始賽跑
        </button>
      </div>
    )
  }

  if (phase === 'racing') {
    const blockCount = Math.ceil(TRACK_LENGTH_PX / BLOCK_SIZE)
    const leadingX = runners.length ? Math.max(...runners.map((r) => r.x)) : 0
    const progressPct = Math.min(100, Math.round((leadingX / (TRACK_LENGTH_PX - CUBE_SIZE)) * 100))

    return (
      <div className="flex flex-col items-center w-full max-w-[380px]">
        {/* 頂部：返回 + 遊戲標題 + 進度條（軌道感）+ 角色頭像與名次徽章 */}
        <div className="w-full mb-3">
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={onBack} className="px-2.5 py-1 rounded-lg bg-gray-700/80 text-gray-300 hover:bg-gray-600 text-xs border border-gray-600">← 返回</button>
            <span className="text-amber-400 font-black text-sm drop-shadow">魔方賽跑</span>
          </div>
          <div className="relative h-3.5 rounded-lg overflow-hidden border-2 border-stone-600 bg-stone-800 shadow-inner flex items-center" style={{ boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.4)' }}>
            <div
              className="h-full rounded-md transition-all duration-150 flex items-center justify-end pr-0.5 relative"
              style={{
                width: `${progressPct}%`,
                background: 'linear-gradient(90deg, #16a34a 0%, #22c55e 40%, #4ade80 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 0 10px rgba(34,197,94,0.5)'
              }}
            >
              {progressPct > 5 && progressPct < 98 && (
                <span className="absolute right-0.5 w-4 h-4 rounded-full border-2 border-white shadow bg-amber-400" style={{ transform: 'translateY(-50%)' }} />
              )}
            </div>
            <span className="absolute right-2 text-xs opacity-70">🏁</span>
          </div>
          <div className="flex flex-wrap gap-2 mt-2 justify-center">
            {runners.map((r) => (
              <div
                key={r.id}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border-2 shadow-md ${r.bg} ${r.border} ${r.text}`}
                style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.25)' }}
              >
                <span className="relative flex">
                  <span
                    className="w-7 h-7 rounded-full border-2 border-current flex items-center justify-center"
                    style={{ backgroundColor: r.character?.skin ?? '#f5d0a9' }}
                  >
                    <span className="w-3 h-2.5 rounded-full opacity-80" style={{ backgroundColor: r.character?.hair ?? '#5c3317' }} />
                  </span>
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-amber-400 text-[9px] font-black text-amber-900 flex items-center justify-center border border-amber-600 shadow">
                    {RANK_LABELS[rankById[r.id] ?? 0].replace('st', '').replace('nd', '').replace('rd', '').replace('th', '')}
                  </span>
                </span>
                <span className="text-xs font-bold">{r.character?.name ?? r.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 魔方賽跑風格：立體方塊賽道 + 背景層 + 紅欄杆 + 箭頭紋 + 稜鏡道具箱 */}
        <div
          className="relative rounded-2xl overflow-hidden mb-5 shadow-2xl"
          style={{
            width: TRACK_LENGTH_PX + 12,
            height: TRACK_HEIGHT + BLOCK_DEPTH + 56,
            perspective: 800,
            boxShadow: '0 0 0 3px rgba(0,0,0,0.15), 0 16px 32px rgba(0,0,0,0.35)'
          }}
        >
          {/* 背景層：天空 + 白雲 + 遠景（紅頂屋、樹） */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-sky-200 via-sky-300 to-sky-400" />
          <div className="absolute top-1 left-[12%] w-14 h-7 rounded-full bg-white/80 shadow-md" />
          <div className="absolute top-5 right-[18%] w-11 h-6 rounded-full bg-white/70 shadow" />
          <div className="absolute top-3 left-[45%] w-9 h-5 rounded-full bg-white/60 shadow" />
          {/* 遠景：紅頂白牆屋 + 樹 */}
          <div className="absolute right-2 bottom-[42%] flex flex-col items-end gap-0.5 opacity-90" style={{ transform: 'scale(0.85)' }}>
            <div className="w-10 h-6 rounded-t border border-amber-900/30" style={{ background: 'linear-gradient(180deg, #dc2626 0%, #b91c1c 100%)' }} />
            <div className="w-11 h-7 border-x border-b border-stone-300 bg-white" />
            <div className="flex gap-1 mt-1">
              <div className="w-4 h-5 rounded-full border border-green-800/40" style={{ background: 'linear-gradient(180deg, #22c55e 0%, #15803d 100%)' }} />
              <div className="w-5 h-5 rounded-full border border-green-800/40" style={{ background: 'linear-gradient(180deg, #4ade80 0%, #16a34a 100%)' }} />
              <div className="w-3 h-4 rounded-full border border-amber-800/50" style={{ background: 'linear-gradient(90deg, #a16207 0%, #713f12 100%)' }} />
            </div>
          </div>
          <div className="absolute left-[20%] bottom-[38%] flex items-end gap-0.5 opacity-85" style={{ transform: 'scale(0.7)' }}>
            <div className="w-6 h-6 rounded-full border border-green-800/40" style={{ background: 'linear-gradient(145deg, #22c55e 0%, #166534 100%)' }} />
            <div className="w-4 h-5 rounded-sm border border-amber-800/50" style={{ background: 'linear-gradient(90deg, #92400e 0%, #78350f 100%)' }} />
          </div>
          <div className="absolute right-[35%] bottom-[40%] flex items-end gap-0.5 opacity-80" style={{ transform: 'scale(0.6)' }}>
            <div className="w-5 h-5 rounded-full border border-green-800/40" style={{ background: 'linear-gradient(145deg, #16a34a 0%, #14532d 100%)' }} />
            <div className="w-3 h-4 rounded-sm border border-amber-800/50" style={{ background: '#78350f' }} />
          </div>

          {/* 3D 賽道主體：透視傾斜，露出頂面 + 前緣 */}
          <div
            className="absolute left-1.5 right-1.5 rounded-xl overflow-visible"
            style={{
              width: TRACK_LENGTH_PX,
              height: TRACK_HEIGHT + BLOCK_DEPTH + FENCE_HEIGHT,
              bottom: 1,
              top: 10,
              transformStyle: 'preserve-3d',
              transform: `rotateX(${TRACK_3D_ANGLE}deg)`,
              transformOrigin: 'center bottom'
            }}
          >
            {/* 立體方塊地面：每格頂面(草) + 前緣(土) + 左側面陰影 */}
            <div className="absolute left-0 flex" style={{ bottom: 0, height: TRACK_HEIGHT + BLOCK_DEPTH }}>
              {Array.from({ length: blockCount }, (_, i) => (
                <div
                  key={i}
                  className="relative shrink-0"
                  style={{
                    width: BLOCK_SIZE,
                    height: TRACK_HEIGHT + BLOCK_DEPTH,
                    transformStyle: 'preserve-3d'
                  }}
                >
                  {/* 頂面：草地 + 箭頭紋（參考圖黑色/深綠 V 字） */}
                  <div
                    className="absolute left-0 right-0 top-0 rounded-t-sm overflow-hidden"
                    style={{
                      height: TRACK_HEIGHT,
                      background: `
                        linear-gradient(180deg, #9ccc65 0%, #7cb342 12%, #558b2f 50%, #33691e 100%),
                        repeating-linear-gradient(105deg, transparent 0, transparent 6px, rgba(0,0,0,0.12) 6px, rgba(0,0,0,0.12) 8px),
                        repeating-linear-gradient(75deg, transparent 0, transparent 6px, rgba(0,0,0,0.08) 6px, rgba(0,0,0,0.08) 8px)
                      `,
                      boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.2), 1px 0 0 rgba(0,0,0,0.08)',
                      border: '1px solid rgba(0,0,0,0.12)',
                      borderBottom: 'none'
                    }}
                  />
                  {/* 前緣：土色立體面 */}
                  <div
                    className="absolute left-0 right-0 bottom-0 rounded-b-sm"
                    style={{
                      height: BLOCK_DEPTH,
                      background: 'linear-gradient(180deg, #a67c52 0%, #8B6914 20%, #6d4e0a 55%, #4a3520 100%)',
                      boxShadow: 'inset 3px 0 0 rgba(255,255,255,0.1), inset -3px 0 0 rgba(0,0,0,0.3), 0 3px 6px rgba(0,0,0,0.25)',
                      border: '1px solid rgba(0,0,0,0.35)'
                    }}
                  />
                </div>
              ))}
            </div>

            {/* 跑道邊界：紅欄杆（參考圖） */}
            <div className="absolute left-0 top-0 h-3 z-[4]" style={{ width: TRACK_LENGTH_PX, background: 'linear-gradient(180deg, #ef4444 0%, #dc2626 40%, #b91c1c 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 2px 4px rgba(0,0,0,0.2)', borderBottom: '2px solid #991b1b' }} />
            <div className="absolute left-0 bottom-0 h-3 z-[4]" style={{ width: TRACK_LENGTH_PX, background: 'linear-gradient(0deg, #ef4444 0%, #dc2626 40%, #b91c1c 100%)', boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.2), 0 -2px 4px rgba(0,0,0,0.2)', borderTop: '2px solid #991b1b' }} />

            {/* 障礙：木箱（棕色+深色綁帶） / 尖刺 */}
            {OBSTACLES.map((obs, oi) => (
              <div key={oi} className="absolute bottom-0 flex flex-col items-center z-[5]" style={{ left: obs.x, width: obs.w, height: TRACK_HEIGHT + BLOCK_DEPTH }}>
                {obs.type === 'crate' ? (
                  <div className="w-full h-10 rounded-sm border-2 border-amber-900/60 flex items-center justify-center" style={{ background: 'linear-gradient(145deg, #a16207 0%, #78350f 50%, #713f12 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 4px 8px rgba(0,0,0,0.3)' }}>
                    <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, transparent 0%, transparent 45%, rgba(0,0,0,0.35) 50%, transparent 55%)', backgroundSize: '100% 100%' }} />
                    <div className="w-3/4 h-0.5 rounded-full bg-amber-950/80" />
                    <div className="absolute w-0.5 h-full bg-amber-950/70 left-1/2 -translate-x-1/2" />
                  </div>
                ) : (
                  <>
                    <div className="w-full h-2 rounded-t bg-stone-600 border border-stone-700 shadow-inner" />
                    <div className="w-0 h-0 border-l-[11px] border-l-transparent border-r-[11px] border-r-transparent border-b-[20px] border-b-red-600" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }} />
                    <div className="w-full h-1 bg-red-900/90 rounded-b" />
                  </>
                )}
              </div>
            ))}

            {/* 道具箱：稜鏡/彩虹閃爍方塊（參考圖） */}
            {ITEM_BOXES.map((box) => {
              const anyNotCollected = runners.some((r) => !(r.collectedBoxes || []).includes(box.x))
              if (!anyNotCollected) return null
              return (
                <div key={box.x} className="absolute top-1/2 left-0 -translate-y-1/2 flex items-center justify-center z-[6]" style={{ left: box.x, width: box.w, height: TRACK_HEIGHT }}>
                  <div
                    className="w-8 h-8 rounded-md flex items-center justify-center text-lg relative overflow-hidden"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255,100,150,0.5) 0%, rgba(100,200,255,0.5) 25%, rgba(150,255,150,0.5) 50%, rgba(255,220,100,0.5) 75%, rgba(200,150,255,0.5) 100%)',
                      boxShadow: '0 0 20px rgba(200,150,255,0.6), 0 0 40px rgba(100,200,255,0.3), inset 0 0 20px rgba(255,255,255,0.4), 0 4px 12px rgba(0,0,0,0.25)',
                      border: '2px solid rgba(255,255,255,0.6)',
                      animation: 'shimmer 2.5s ease-in-out infinite'
                    }}
                  >
                    <style>{`@keyframes shimmer { 0%,100%{ filter: brightness(1) hue-rotate(0deg); } 50%{ filter: brightness(1.2) hue-rotate(15deg); } }`}</style>
                    <span className="drop-shadow-md z-10">?</span>
                  </div>
                </div>
              )
            })}

            {/* 終點：旗桿 + 黑白格紋 + GOAL */}
            <div className="absolute top-0 bottom-0 flex items-end z-[5]" style={{ left: TRACK_LENGTH_PX - 36 }}>
              <div className="flex flex-col items-start h-full">
                <div className="text-[9px] font-black text-white px-2 py-0.5 rounded border-2 border-amber-500 shadow-lg" style={{ background: 'linear-gradient(180deg, #1f2937 0%, #111827 100%)' }}>GOAL</div>
                <div className="flex-1 flex items-stretch min-h-[28px]">
                  <div className="w-1.5 bg-gradient-to-b from-stone-500 to-stone-700 rounded-full shadow-inner" />
                  <div className="w-6 border-l-2 border-stone-600" style={{ backgroundImage: 'linear-gradient(90deg, #fff 50%, #1a1a1a 50%), linear-gradient(#fff 50%, #1a1a1a 50%)', backgroundSize: '4px 4px', backgroundPosition: '0 0, 2px 2px', boxShadow: '2px 0 6px rgba(0,0,0,0.25)' }} />
                </div>
              </div>
            </div>

            {/* 角色：同場、依 x 排序 */}
            {[...runners]
              .sort((a, b) => a.x - b.x)
              .map((r, sortedIndex) => {
                const now = performance.now() / 1000
                const runPhase = Math.floor((performance.now() / 1000) * (1000 / RUN_CYCLE_MS)) % 2
                const baseTop = (TRACK_HEIGHT - CUBE_SIZE) / 2
                const offsetY = r.id * 5
                return (
                  <div
                    key={r.id}
                    className="absolute left-0 top-0"
                    style={{
                      width: CUBE_SIZE,
                      height: CUBE_SIZE,
                      left: Math.max(0, r.x),
                      top: baseTop + offsetY,
                      zIndex: 10 + sortedIndex
                    }}
                  >
                    <RunnerSprite
                      character={r.character}
                      isJumping={r.jumpEndAt > now}
                      stunned={r.stunnedUntil > now}
                      shield={r.shieldUntil > now}
                      boost={r.boostUntil > now}
                      size={CUBE_SIZE}
                      runPhase={runPhase}
                    />
                  </div>
                )
              })}
          </div>
        </div>

        {/* 底部：每位角色卡片 + 手遊風按鈕（跳躍 / 道具） */}
        <div className="flex flex-wrap justify-center gap-3 w-full">
          {runners.map((r) => {
            const itemInfo = ITEM_TYPES.find((it) => it.id === r.item)
            return (
              <div key={r.id} className={`rounded-2xl border-2 shadow-lg p-3 min-w-[130px] ${r.border} ${r.bg} ${r.text}`} style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.25)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-8 h-8 rounded-full border-2 border-current flex items-center justify-center text-xs font-bold shadow-inner" style={{ backgroundColor: r.character?.skin ?? '#f5d0a9' }}>
                    <span className="w-4 h-3 rounded-full opacity-80" style={{ backgroundColor: r.character?.hair ?? '#5c3317' }} />
                  </span>
                  <div>
                    <div className="font-bold text-sm">{r.character?.name ?? r.name}</div>
                    {itemInfo && <span className="text-[10px] opacity-90" title={itemInfo.label}>{itemInfo.icon} {itemInfo.label}</span>}
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  <button
                    type="button"
                    onClick={() => jump(r.id)}
                    className="flex-1 py-2.5 text-gray-900 text-sm font-bold border-2 border-amber-500 touch-manipulation active:scale-95 transition-transform flex items-center justify-center"
                    style={{
                      clipPath: 'polygon(28% 0%, 72% 0%, 100% 50%, 72% 100%, 28% 100%, 0% 50%)',
                      background: 'linear-gradient(180deg, #fef3c7 0%, #fcd34d 30%, #f59e0b 100%)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5), 0 3px 0 #b45309, 0 6px 12px rgba(0,0,0,0.25)'
                    }}
                  >
                    ⬆ 跳躍
                  </button>
                  <button
                    type="button"
                    onClick={() => useItem(r.id)}
                    disabled={!r.item}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 touch-manipulation transition-all ${r.item ? 'border-amber-400 bg-amber-500/40 text-amber-100 shadow' : 'bg-gray-700/50 border-gray-600 text-gray-500 cursor-not-allowed'}`}
                  >
                    {itemInfo ? itemInfo.icon : '—'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-gray-500 text-[11px] mt-2">1P 空白/Q 跳躍 · 2P W · 3P E · 4P R · A/S/D/F 使用道具</p>
      </div>
    )
  }

  const winnerRunner = runners.find((r) => r.id === winner)
  return (
    <div className="flex flex-col items-center w-full max-w-[340px]">
      <div className="flex justify-between w-full mb-2">
        <button type="button" onClick={onBack} className="px-3 py-1.5 rounded-lg bg-gray-700/80 text-gray-300 hover:bg-gray-600 text-sm border border-gray-600">← 返回</button>
      </div>
      <div className="mb-4 px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/50">
        <h3 className="text-lg font-black text-amber-400">🏁 抵達終點</h3>
      </div>
      {winnerRunner && (
        <div className={`flex items-center gap-4 px-6 py-5 rounded-2xl border-2 shadow-xl mb-4 ${winnerRunner.border} ${winnerRunner.bg} ${winnerRunner.text}`} style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
          <span className="w-14 h-14 rounded-full border-2 border-current flex items-center justify-center text-2xl font-bold shadow-inner" style={{ backgroundColor: winnerRunner.character?.skin ?? '#f5d0a9' }}>
            <span className="w-7 h-5 rounded-full opacity-80" style={{ backgroundColor: winnerRunner.character?.hair ?? '#5c3317' }} />
          </span>
          <div>
            <div className="text-xl font-black">{winnerRunner.character?.name ?? winnerRunner.name} 獲勝</div>
            <div className="text-sm opacity-90">恭喜率先衝過終點！</div>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => { setPhase('setup'); setRunners([]) }}
        className="px-8 py-3 rounded-2xl font-bold text-amber-100 border-2 border-amber-500/60 hover:bg-amber-500/30 transition-all"
        style={{ background: 'linear-gradient(180deg, #78716c 0%, #57534e 100%)', boxShadow: '0 4px 0 #44403c, 0 6px 12px rgba(0,0,0,0.3)' }}
      >
        再玩一次
      </button>
    </div>
  )
}

export default HorizontalRunner
