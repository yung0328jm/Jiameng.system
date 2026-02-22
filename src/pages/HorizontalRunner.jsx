// 多人跑步橫向移動（魔方賽跑：自動前進 + 時機跳躍，不是狂按鈕）
import { useState, useEffect, useRef, useCallback } from 'react'

const TRACK_LENGTH_PX = 320
const BLOCK_SIZE = 20
const LANE_HEIGHT = 56
const CUBE_SIZE = 36
const BASE_SPEED = 98 // 跑者自動前進速度，不靠按鈕
const BOOST_FROM_ITEM = 140 // 僅道具「衝刺」使用時暫時加速
const JUMP_DURATION = 0.4
const STUN_DURATION = 0.85
const ATTACK_STUN = 1.2
const SHIELD_DURATION = 2
const ITEM_BOOST_DURATION = 0.9 // 衝刺道具生效時間

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

const RANK_LABELS = ['1st', '2nd', '3rd', '4th']

// 可選角色（魔方賽跑風格：各有名字與代表色）
const CHARACTERS = [
  { id: 0, name: '小紅', short: '紅', bg: 'bg-amber-500', border: 'border-amber-400', text: 'text-amber-900', headBg: 'bg-amber-300', bodyBg: 'bg-amber-600' },
  { id: 1, name: '小綠', short: '綠', bg: 'bg-emerald-500', border: 'border-emerald-400', text: 'text-emerald-900', headBg: 'bg-emerald-300', bodyBg: 'bg-emerald-600' },
  { id: 2, name: '小藍', short: '藍', bg: 'bg-sky-500', border: 'border-sky-400', text: 'text-sky-900', headBg: 'bg-sky-300', bodyBg: 'bg-sky-600' },
  { id: 3, name: '小粉', short: '粉', bg: 'bg-rose-500', border: 'border-rose-400', text: 'text-rose-900', headBg: 'bg-rose-300', bodyBg: 'bg-rose-600' }
]

/** 賽道上的角色造型：頭 + 身體，跳躍時上浮 */
function RunnerSprite({ character, isJumping, stunned, shield, boost, size = 36 }) {
  const c = character || CHARACTERS[0]
  return (
    <div
      className={`absolute flex flex-col items-center justify-end transition-all duration-100 ${
        stunned ? 'opacity-60' : ''
      } ${shield ? 'ring-2 ring-cyan-400 ring-offset-1 rounded-full' : ''} ${boost ? 'ring-2 ring-yellow-300 rounded-full' : ''}`}
      style={{
        width: size,
        height: size,
        transform: isJumping ? 'translateY(-8px)' : undefined
      }}
    >
      <div className={`w-3 h-3 rounded-full border-2 ${c.headBg} ${c.border} shrink-0`} />
      <div className={`w-4 h-3 rounded-sm ${c.bodyBg} border border-gray-800/30 -mt-0.5`} />
      <div className="flex gap-0.5 -mt-0.5">
        <div className={`w-1.5 h-2 rounded-b ${c.bodyBg}`} />
        <div className={`w-1.5 h-2 rounded-b ${c.bodyBg}`} />
      </div>
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
      <div className="flex flex-col items-center w-full max-w-[340px]">
        <div className="flex justify-between w-full mb-3">
          <button type="button" onClick={onBack} className="text-yellow-400 text-sm hover:underline">← 返回</button>
        </div>
        <h3 className="text-xl font-bold text-yellow-400 mb-1">魔方賽跑</h3>
        <p className="text-gray-400 text-sm mb-4 text-center">跑者自動前進，看準障礙按跳躍；★道具箱可取得衝刺／護盾／攻擊。</p>
        <p className="text-gray-500 text-xs mb-2">參賽人數</p>
        <div className="flex gap-3 mb-5">
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
        <p className="text-gray-500 text-xs mb-2">選擇角色（每位玩家選一個）</p>
        <div className="space-y-3 mb-6 w-full">
          {Array.from({ length: playerCount }, (_, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-gray-400 text-sm w-8">{i + 1}P</span>
              <div className="flex gap-2 flex-wrap">
                {CHARACTERS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCharacterFor(i, c.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                      characterPicks[i] === c.id
                        ? `${c.bg} ${c.text} ${c.border} ring-2 ring-offset-1 ring-offset-gray-800`
                        : 'bg-gray-700 border-gray-600 text-gray-400 hover:border-gray-500'
                    }`}
                  >
                    <span className={`w-6 h-6 rounded-full ${c.headBg} border-2 ${c.border}`} />
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
          className="px-8 py-3 bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold rounded-xl"
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
        {/* 頂部：返回 + 遊戲標題 + 進度條 + 角色頭像與名次 */}
        <div className="w-full mb-3">
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={onBack} className="text-yellow-400 text-sm hover:underline">← 返回</button>
            <span className="text-yellow-400 font-bold text-sm">魔方賽跑</span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden border border-gray-600">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-150"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-2 mt-2 justify-center">
            {runners.map((r) => (
              <div
                key={r.id}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border ${r.bg} ${r.border} ${r.text}`}
              >
                <span className={`w-5 h-5 rounded-full ${r.character?.headBg ?? r.bg} border border-current`} />
                <span className="text-xs font-bold">{RANK_LABELS[rankById[r.id] ?? 0]} {r.character?.name ?? r.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 賽道區：天空 + 方塊地形 + 障礙 + 道具箱 + 終點旗 + 角色 */}
        <div
          className="relative rounded-xl overflow-hidden border-2 border-gray-600 mb-4 shadow-xl"
          style={{ width: TRACK_LENGTH_PX, height: runners.length * LANE_HEIGHT + 28 }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-sky-400 to-sky-600" />
          <div className="relative" style={{ width: TRACK_LENGTH_PX, height: runners.length * LANE_HEIGHT }}>
            {runners.map((r, laneIndex) => (
              <div key={r.id} className="absolute left-0 right-0 flex" style={{ top: laneIndex * LANE_HEIGHT, height: LANE_HEIGHT }}>
                {Array.from({ length: blockCount }, (_, i) => (
                  <div key={i} className="relative shrink-0 border border-amber-800/50" style={{ width: BLOCK_SIZE, height: LANE_HEIGHT }}>
                    <div className="absolute inset-0 bg-amber-800/90" />
                    <div className="absolute left-0 right-0 top-0 h-2 bg-green-600 border-b border-green-500/80" />
                  </div>
                ))}
                {OBSTACLES.map((obs, oi) => (
                  <div key={oi} className="absolute top-0 bottom-0 flex items-end justify-center pb-0.5" style={{ left: obs.x, width: obs.w, height: LANE_HEIGHT }}>
                    <div className="w-full h-5 bg-gray-700 border-2 border-gray-500 rounded-t flex items-center justify-center">
                      <span className="text-red-500 text-xs">◆</span>
                    </div>
                  </div>
                ))}
                {ITEM_BOXES.map((box) =>
                  !(r.collectedBoxes || []).includes(box.x) ? (
                    <div key={box.x} className="absolute top-1/2 left-0 -translate-y-1/2 flex items-center justify-center" style={{ left: box.x, width: box.w, height: LANE_HEIGHT }}>
                      <div className="w-6 h-6 rounded bg-yellow-400 border-2 border-yellow-500 flex items-center justify-center text-sm shadow">★</div>
                    </div>
                  ) : null
                )}
                {/* 終點：旗桿 + 旗子 */}
                <div className="absolute top-0 bottom-0 flex items-stretch" style={{ left: TRACK_LENGTH_PX - 20 }}>
                  <div className="w-1 bg-gray-700" />
                  <div className="w-5 bg-green-500 border-l-2 border-green-600 flex items-center justify-center">
                    <span className="text-white text-[9px] font-bold">終點</span>
                  </div>
                </div>
                {/* 角色（跑者造型） */}
                <div
                  className="absolute left-0 top-0"
                  style={{
                    width: CUBE_SIZE,
                    height: LANE_HEIGHT,
                    left: Math.max(0, r.x),
                    top: (LANE_HEIGHT - CUBE_SIZE) / 2,
                    transform: r.isJumping ? 'translateY(-6px)' : undefined
                  }}
                >
                  <RunnerSprite
                    character={r.character}
                    isJumping={r.jumpEndAt > performance.now() / 1000}
                    stunned={r.stunnedUntil > performance.now() / 1000}
                    shield={r.shieldUntil > performance.now() / 1000}
                    boost={r.boostUntil > performance.now() / 1000}
                    size={CUBE_SIZE}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 底部：每位角色頭像 + 名字 + 跳躍 / 使用道具 */}
        <div className="flex flex-wrap justify-center gap-4 w-full">
          {runners.map((r) => {
            const itemInfo = ITEM_TYPES.find((it) => it.id === r.item)
            return (
              <div key={r.id} className={`rounded-xl border-2 ${r.border} ${r.bg} p-3 min-w-[140px]`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-8 h-8 rounded-full ${r.character?.headBg ?? r.bg} border-2 border-current flex items-center justify-center text-xs font-bold ${r.text}`}>
                    {r.character?.short ?? r.name.charAt(0)}
                  </span>
                  <div>
                    <div className="font-bold text-sm">{r.character?.name ?? r.name}</div>
                    {itemInfo && <span className="text-[10px]" title={itemInfo.label}>{itemInfo.icon} 道具</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => jump(r.id)} className="flex-1 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-gray-900 text-sm font-bold border border-yellow-600 touch-manipulation active:scale-95">⬆ 跳躍</button>
                  <button type="button" onClick={() => useItem(r.id)} disabled={!r.item} className={`flex-1 py-2 rounded-lg text-sm font-bold border-2 touch-manipulation ${r.item ? 'bg-yellow-500/30 border-yellow-400 text-yellow-200' : 'bg-gray-700/50 border-gray-600 text-gray-500 cursor-not-allowed'}`}>
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
    <div className="flex flex-col items-center w-full max-w-[320px]">
      <div className="flex justify-between w-full mb-3">
        <button type="button" onClick={onBack} className="text-yellow-400 text-sm hover:underline">← 返回</button>
      </div>
      <h3 className="text-xl font-bold text-yellow-400 mb-3">🏁 抵達終點</h3>
      {winnerRunner && (
        <div className={`flex items-center gap-3 px-6 py-4 rounded-2xl border-2 ${winnerRunner.border} ${winnerRunner.bg} ${winnerRunner.text} mb-4`}>
          <span className={`w-12 h-12 rounded-full ${winnerRunner.character?.headBg ?? winnerRunner.bg} border-2 border-current flex items-center justify-center text-xl font-bold`}>
            {winnerRunner.character?.short ?? winnerRunner.name.charAt(0)}
          </span>
          <div>
            <div className="text-lg font-bold">{winnerRunner.character?.name ?? winnerRunner.name} 獲勝</div>
            <div className="text-sm opacity-90">恭喜率先衝過終點</div>
          </div>
        </div>
      )}
      <button type="button" onClick={() => { setPhase('setup'); setRunners([]) }} className="px-6 py-2.5 bg-gray-600 hover:bg-gray-500 text-white rounded-lg text-sm">
        再玩一次
      </button>
    </div>
  )
}

export default HorizontalRunner
