// 魔方賽跑風格：卡通角色、3D 方塊場地、遊戲感 UI
import { useState, useEffect, useRef, useCallback } from 'react'

const TRACK_LENGTH_PX = 340
const BLOCK_SIZE = 22
const TRACK_HEIGHT = 88
const CUBE_SIZE = 40
const RUN_CYCLE_MS = 90
const BASE_SPEED = 98
const BOOST_FROM_ITEM = 140
const JUMP_DURATION = 0.4
const STUN_DURATION = 0.85
const ATTACK_STUN = 1.2
const SHIELD_DURATION = 2
const ITEM_BOOST_DURATION = 0.9

const OBSTACLES = [
  { x: 75, w: 24 },
  { x: 160, w: 24 },
  { x: 245, w: 24 }
]

const ITEM_BOXES = [
  { x: 100, w: 26 },
  { x: 185, w: 26 },
  { x: 270, w: 26 }
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
      <div className="flex flex-col items-center w-full max-w-[360px]">
        {/* 頂部：返回 + 遊戲標題 + 進度條（軌道感）+ 角色頭像與名次徽章 */}
        <div className="w-full mb-3">
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={onBack} className="px-2.5 py-1 rounded-lg bg-gray-700/80 text-gray-300 hover:bg-gray-600 text-xs border border-gray-600">← 返回</button>
            <span className="text-amber-400 font-black text-sm drop-shadow">魔方賽跑</span>
          </div>
          <div className="h-3 rounded-full overflow-hidden border-2 border-amber-900/50 bg-gray-800 shadow-inner" style={{ boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)' }}>
            <div
              className="h-full rounded-full transition-all duration-150 flex items-center justify-end pr-0.5"
              style={{
                width: `${progressPct}%`,
                background: 'linear-gradient(90deg, #22c55e 0%, #4ade80 50%, #86efac 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 0 8px rgba(34,197,94,0.4)'
              }}
            />
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

        {/* 單一賽道：所有人同場奔跑 - 天空+雲、3D 地、障礙、道具、終點、角色 */}
        <div
          className="relative rounded-2xl overflow-hidden mb-5 shadow-2xl border-4 border-amber-900/50"
          style={{
            width: TRACK_LENGTH_PX + 8,
            height: TRACK_HEIGHT + 36,
            boxShadow: 'inset 0 0 0 2px rgba(0,0,0,0.2), 0 12px 24px rgba(0,0,0,0.4)'
          }}
        >
          {/* 天空漸層 + 白雲 */}
          <div className="absolute inset-0 bg-gradient-to-b from-sky-300 via-sky-400 to-sky-500" />
          <div className="absolute top-2 left-[15%] w-12 h-6 rounded-full bg-white/70 shadow" />
          <div className="absolute top-4 right-[20%] w-10 h-5 rounded-full bg-white/60 shadow" />
          <div className="absolute bottom-[45%] left-[40%] w-8 h-4 rounded-full bg-white/50 shadow" />
          {/* 賽道主體：一張地圖 */}
          <div className="absolute left-1 right-1 bottom-1 top-8 rounded-xl overflow-hidden" style={{ width: TRACK_LENGTH_PX, height: TRACK_HEIGHT }}>
            {/* 3D 方塊地面（單一跑道） */}
            <div className="absolute left-0 top-0 flex" style={{ height: TRACK_HEIGHT }}>
              {Array.from({ length: blockCount }, (_, i) => (
                <div key={i} className="relative shrink-0" style={{ width: BLOCK_SIZE, height: TRACK_HEIGHT }}>
                  <div
                    className="absolute inset-0 rounded-sm"
                    style={{
                      background: 'linear-gradient(180deg, #6b8e23 0%, #5a7a1e 8px, #8B6914 8px, #6d4e0a 100%)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -1px 0 rgba(0,0,0,0.2)',
                      border: '1px solid rgba(0,0,0,0.15)'
                    }}
                  />
                </div>
              ))}
            </div>
            {/* 障礙：尖刺陷阱（全場共用） */}
            {OBSTACLES.map((obs, oi) => (
              <div key={oi} className="absolute bottom-0 flex flex-col items-center z-[5]" style={{ left: obs.x, width: obs.w, height: TRACK_HEIGHT }}>
                <div className="w-full h-2 rounded-t bg-stone-600 border border-stone-700 shadow-inner" />
                <div
                  className="w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-b-[18px] border-b-red-600 mt-0"
                  style={{ filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.3))' }}
                />
                <div className="w-full h-1 bg-red-800/80 rounded-b" />
              </div>
            ))}
            {/* 道具箱：任一玩家未撿即顯示 */}
            {ITEM_BOXES.map((box) => {
              const anyNotCollected = runners.some((r) => !(r.collectedBoxes || []).includes(box.x))
              if (!anyNotCollected) return null
              return (
                <div key={box.x} className="absolute top-1/2 left-0 -translate-y-1/2 flex items-center justify-center z-[6]" style={{ left: box.x, width: box.w, height: TRACK_HEIGHT }}>
                  <div
                    className="w-7 h-7 rounded-md flex items-center justify-center text-base border-2 border-amber-600"
                    style={{
                      background: 'linear-gradient(145deg, #fcd34d 0%, #f59e0b 50%, #d97706 100%)',
                      boxShadow: '0 0 12px rgba(251,191,36,0.6), inset 0 1px 0 rgba(255,255,255,0.5), 0 3px 6px rgba(0,0,0,0.25)'
                    }}
                  >
                    <span className="drop-shadow-sm">★</span>
                  </div>
                </div>
              )
            })}
            {/* 終點：旗桿 + 黑白格紋旗 + GOAL */}
            <div className="absolute top-0 bottom-0 flex items-end z-[5]" style={{ left: TRACK_LENGTH_PX - 32 }}>
              <div className="flex flex-col items-start h-full">
                <div className="text-[8px] font-black text-white bg-gray-900 px-1.5 py-0.5 rounded mb-0.5 border border-amber-600 shadow">GOAL</div>
                <div className="flex-1 flex items-stretch min-h-[24px]">
                  <div className="w-1 bg-gradient-to-b from-stone-400 to-stone-600 rounded-full shadow-inner" style={{ boxShadow: 'inset 0 0 2px rgba(0,0,0,0.3)' }} />
                  <div
                    className="w-5 flex-shrink-0 border-l-2 border-amber-900/30"
                    style={{
                      backgroundImage: 'linear-gradient(90deg, #fff 50%, #1a1a1a 50%), linear-gradient(#fff 50%, #1a1a1a 50%)',
                      backgroundSize: '3px 3px',
                      backgroundPosition: '0 0, 1.5px 1.5px',
                      boxShadow: '2px 0 4px rgba(0,0,0,0.2)'
                    }}
                  />
                </div>
              </div>
            </div>
            {/* 所有角色同場：依 x 排序繪製（領先者在最前），略錯開 Y 避免完全疊在一起 */}
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
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => jump(r.id)}
                    className="flex-1 py-2.5 rounded-xl text-gray-900 text-sm font-bold border-2 border-amber-600 touch-manipulation active:scale-95 transition-transform"
                    style={{ background: 'linear-gradient(180deg, #fde047 0%, #f59e0b 100%)', boxShadow: '0 2px 0 #b45309, 0 4px 8px rgba(0,0,0,0.2)' }}
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
