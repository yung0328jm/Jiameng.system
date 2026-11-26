import { useMemo, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { getCurrentUser } from '../utils/authStorage'
import { getPetAppearance, getWorldFishRoster, recordPetEat, tickPetBreeding } from '../utils/petStorage'
import { REALTIME_UPDATE_EVENT } from '../utils/supabaseRealtime'

const BUBBLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  left: `${4 + ((i * 17) % 92)}%`,
  size: `${7 + (i % 5) * 3}px`,
  duration: `${10 + (i % 7) * 2.2}s`,
  delay: `${-(i * 1.3)}s`
}))

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function isMobile() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
}

function layout() {
  const mobile = isMobile()
  const w = window.innerWidth
  const h = window.innerHeight
  return {
    mobile,
    w,
    h,
    cruise: mobile ? 52 : 78,
    dash: mobile ? 260 : 380,
    eatRange: mobile ? 22 : 32
  }
}

function baseFishSize(entry, index, mobile) {
  if (entry?.shape === 'ray') {
    return index % 2 === 0
      ? (mobile ? { width: 118, height: 66 } : { width: 176, height: 100 })
      : (mobile ? { width: 102, height: 58 } : { width: 154, height: 88 })
  }
  if (entry?.shape === 'giant') {
    return index % 2 === 0
      ? (mobile ? { width: 176, height: 50 } : { width: 300, height: 86 })
      : (mobile ? { width: 158, height: 44 } : { width: 268, height: 76 })
  }
  if (entry?.wide) {
    return index % 2 === 0
      ? (mobile ? { width: 132, height: 42 } : { width: 220, height: 70 })
      : (mobile ? { width: 114, height: 36 } : { width: 188, height: 60 })
  }
  return index % 2 === 0
    ? (mobile ? { width: 92, height: 48 } : { width: 168, height: 88 })
    : (mobile ? { width: 76, height: 40 } : { width: 140, height: 72 })
}

function fishSize(entry, index, mobile, scale = 1) {
  const base = baseFishSize(entry, index, mobile)
  const s = Math.max(0.28, Number(scale) || 1)
  return {
    width: Math.max(28, Math.round(base.width * s)),
    height: Math.max(16, Math.round(base.height * s))
  }
}

function loadLooks(roster) {
  const map = {}
  ;(roster || []).forEach((entry) => {
    const id = entry?.id || ''
    const owner = entry?.owner || getCurrentUser()
    const slot = entry?.growthSlotId || id
    map[id] = getPetAppearance(owner, slot, entry?.itemId, entry?.key)
  })
  return map
}

function clampFish(fish, L, size) {
  fish.x = Math.max(-size.width * 0.25, Math.min(L.w - size.width * 0.3, fish.x))
  fish.y = Math.max(8, Math.min(L.h - size.height - 8, fish.y))
}

function overlapAxes(sa, sb) {
  return {
    gx: (sa.width + sb.width) * 0.4,
    gy: (sa.height + sb.height) * 0.5
  }
}

function pickWander(fish, L, size, others = []) {
  const padX = 16
  const padY = 28
  const maxX = Math.max(40, L.w - size.width - padX * 2)
  const maxY = Math.max(40, L.h - size.height - padY * 2)
  let bestX = padX + Math.random() * maxX
  let bestY = padY + Math.random() * maxY
  let bestScore = -Infinity
  for (let k = 0; k < 12; k++) {
    const tx = padX + Math.random() * maxX
    const ty = padY + Math.random() * maxY
    const cx = tx + size.width * 0.5
    const cy = ty + size.height * 0.5
    let nearest = Infinity
    others.forEach((o) => {
      if (!o || o === fish) return
      const ox = (o.tx ?? o.x) + (o._w || 80) * 0.5
      const oy = (o.ty ?? o.y) + (o._h || 40) * 0.5
      const dx = cx - ox
      const dy = cy - oy
      nearest = Math.min(nearest, dx * dx + dy * dy)
    })
    const away = (tx - fish.x) ** 2 + (ty - fish.y) ** 2
    const score = nearest + away * 0.15
    if (score > bestScore) {
      bestScore = score
      bestX = tx
      bestY = ty
    }
  }
  fish.tx = bestX
  fish.ty = bestY
  fish.turnAt = performance.now() + 1600 + Math.random() * 4200
}

function steerAway(fish, size, others, strength) {
  let sx = 0
  let sy = 0
  const cx = fish.x + size.width * 0.5
  const cy = fish.y + size.height * 0.5
  others.forEach((o) => {
    if (!o || o === fish) return
    const ow = o._w || 80
    const oh = o._h || 40
    const ox = o.x + ow * 0.5
    const oy = o.y + oh * 0.5
    const { gx, gy } = overlapAxes(size, { width: ow, height: oh })
    const dx = cx - ox
    const dy = cy - oy
    const nx = dx / Math.max(8, gx * 1.35)
    const ny = dy / Math.max(8, gy * 1.35)
    const d2 = nx * nx + ny * ny
    if (d2 >= 1 || d2 === 0) return
    const falloff = 1 - Math.sqrt(d2)
    const dist = Math.sqrt(dx * dx + dy * dy) || 1
    sx += (dx / dist) * falloff
    sy += (dy / dist) * falloff
  })
  const mag = Math.sqrt(sx * sx + sy * sy)
  if (mag < 0.001) return { x: 0, y: 0 }
  return { x: (sx / mag) * strength, y: (sy / mag) * strength }
}

function separateFish(fishes, sizes, L) {
  const n = fishes.length
  for (let iter = 0; iter < 4; iter++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = fishes[i]
        const b = fishes[j]
        const sa = sizes[i]
        const sb = sizes[j]
        const dx = a.x + sa.width * 0.5 - (b.x + sb.width * 0.5)
        const dy = a.y + sa.height * 0.5 - (b.y + sb.height * 0.5)
        const { gx, gy } = overlapAxes(sa, sb)
        const nx = dx / Math.max(8, gx)
        const ny = dy / Math.max(8, gy)
        const d2 = nx * nx + ny * ny
        if (d2 >= 1) continue
        let dist = Math.sqrt(dx * dx + dy * dy)
        let ux = dx
        let uy = dy
        if (dist < 0.001) {
          ux = (i - j) || 1
          uy = 1.2
          dist = Math.sqrt(ux * ux + uy * uy)
        }
        ux /= dist
        uy /= dist
        const overlap = 1 - Math.sqrt(Math.max(d2, 1e-4))
        const mag = Math.max(gx, gy) * overlap * 0.42
        a.x += ux * mag
        a.y += uy * mag
        b.x -= ux * mag
        b.y -= uy * mag
      }
    }
  }
  fishes.forEach((fish, i) => clampFish(fish, L, sizes[i]))
}

function spawnFish(i, count, L, size) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, count))))
  const rows = Math.max(1, Math.ceil(count / cols))
  const col = i % cols
  const row = Math.floor(i / cols)
  const cellW = L.w / cols
  const cellH = Math.max(90, L.h * 0.72) / rows
  return {
    x: col * cellW + Math.max(10, (cellW - size.width) * 0.28),
    y: 24 + row * cellH + 10,
    face: i % 2 === 0 ? 1 : -1,
    tilt: 0,
    eatUntil: 0,
    tx: col * cellW + cellW * 0.45,
    ty: 24 + row * cellH + cellH * 0.4,
    turnAt: 0
  }
}

function rosterKey(roster) {
  return (roster || []).map((f) => `${f.id}:${f.key}:${f.src}:${f.owner || ''}`).join('|')
}

function Betta({ src, variant, wide, shape }) {
  return (
    <div className={`ocean-betta ocean-betta-${variant}${wide ? ' ocean-betta-wide' : ''}${shape === 'ray' ? ' ocean-betta-ray' : ''}${shape === 'giant' ? ' ocean-betta-giant' : ''}`}>
      <img src={src} alt="" className="ocean-betta-layer ocean-betta-body" draggable={false} />
      <img src={src} alt="" className="ocean-betta-layer ocean-betta-tail" draggable={false} />
    </div>
  )
}

export default function OceanAmbience() {
  const bubbles = useMemo(() => BUBBLES, [])
  const [food, setFood] = useState([])
  const [actors, setActors] = useState(() => getWorldFishRoster(getCurrentUser()).map((f, i) => ({
    ...f,
    x: 40 + i * 80,
    y: 120 + i * 80,
    face: i % 2 === 0 ? 1 : -1,
    tilt: 0,
    dash: false,
    eating: false
  })))
  const sim = useRef(null)
  const rosterRef = useRef(getWorldFishRoster(getCurrentUser()))

  useEffect(() => {
    const refresh = () => {
      const next = getWorldFishRoster(getCurrentUser())
      if (rosterKey(rosterRef.current) === rosterKey(next)) return
      rosterRef.current = next
    }
    refresh()
    const onRt = (e) => {
      const key = e?.detail?.key
      if (
        key &&
        key !== '__ALL__' &&
        key !== 'jiameng_equipped_effects' &&
        key !== 'jiameng_inventories' &&
        key !== 'jiameng_items' &&
        key !== 'jiameng_pets'
      ) return
      refresh()
    }
    const timer = window.setInterval(refresh, 1200)
    window.addEventListener(REALTIME_UPDATE_EVENT, onRt)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener(REALTIME_UPDATE_EVENT, onRt)
    }
  }, [])

  useEffect(() => {
    const L0 = layout()
    const startRoster = rosterRef.current
    const startLooks = loadLooks(startRoster)
    sim.current = {
      food: [],
      looks: startLooks,
      looksAt: 0,
      fish: startRoster.map((entry, i) =>
        spawnFish(i, startRoster.length, L0, fishSize(entry, i, L0.mobile, startLooks[entry.id]?.scale))
      )
    }

    let last = performance.now()
    let raf = 0

    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const L = layout()
      const state = sim.current
      if (!state) return
      const currentRoster = rosterRef.current || []

      if (!state.looks || now - (state.looksAt || 0) > 2000) {
        tickPetBreeding(getCurrentUser())
        state.looks = loadLooks(currentRoster)
        state.looksAt = now
      }

      while (state.fish.length < currentRoster.length) {
        const i = state.fish.length
        const look = state.looks?.[currentRoster[i]?.id] || {}
        const size = fishSize(currentRoster[i], i, L.mobile, look.scale)
        state.fish.push(spawnFish(i, currentRoster.length, L, size))
      }
      if (state.fish.length > currentRoster.length) {
        state.fish.length = currentRoster.length
      }

      const aimAlong = (fish, vx, vy) => {
        const ax = Math.abs(vx)
        const ay = Math.abs(vy)
        if (ax > 0.12 && ax > ay * 0.34) {
          fish.face = vx >= 0 ? 1 : -1
        }
        const want = Math.atan2(vy, ax + 0.0001) * (180 / Math.PI)
        const maxTilt = ay >= ax * 0.65 ? 88 : 68
        const clamped = Math.max(-maxTilt, Math.min(maxTilt, want))
        fish.tilt += (clamped - (fish.tilt || 0)) * Math.min(1, 7 * dt)
      }

      state.food = state.food.filter((p) => {
        p.vy += 90 * dt
        if (p.vy > 62) p.vy = 62
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.life -= dt
        return p.y < L.h + 20 && p.y > -40 && p.life > 0 && !p.eaten
      })

      const sizes = currentRoster.map((entry, i) =>
        fishSize(entry, i, L.mobile, state.looks?.[entry?.id]?.scale)
      )
      state.fish.forEach((fish, i) => {
        const size = sizes[i]
        fish._w = size.width
        fish._h = size.height
      })

      state.fish.forEach((fish, i) => {
        const entry = currentRoster[i]
        const size = sizes[i]
        const others = state.fish
        const mouthRatio = entry?.shape === 'ray' ? 0.9 : (entry?.wide ? 0.9 : 0.84)
        const mouthX = fish.face === 1 ? fish.x + size.width * mouthRatio : fish.x + size.width * (1 - mouthRatio)
        const mouthY = fish.y + size.height * 0.5
        const live = state.food.filter((p) => !p.eaten)
        let target = null
        let best = Infinity
        live.forEach((p) => {
          const dx = p.x - mouthX
          const dy = p.y - mouthY
          const d = dx * dx + dy * dy
          if (d < best) {
            best = d
            target = p
          }
        })

        if (now < fish.eatUntil) {
          fish.dash = false
          fish.tilt += (0 - (fish.tilt || 0)) * Math.min(1, 8 * dt)
          return
        }

        if (target) {
          const dx = target.x - mouthX
          const dy = target.y - mouthY
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          if (dist < L.eatRange) {
            target.eaten = true
            fish.eatUntil = now + 220
            fish.dash = false
            recordPetEat(
              entry?.owner || getCurrentUser(),
              entry?.growthSlotId || entry?.id,
              entry?.itemId,
              entry?.key
            )
            state.looks = loadLooks(currentRoster)
            state.looksAt = now
            pickWander(fish, L, size, others)
            return
          }
          fish.dash = true
          const avoid = steerAway(fish, size, others, 0.55)
          let vx = dx / dist + avoid.x
          let vy = dy / dist + avoid.y
          const vd = Math.sqrt(vx * vx + vy * vy) || 1
          aimAlong(fish, vx, vy)
          fish.x += (vx / vd) * L.dash * dt
          fish.y += (vy / vd) * L.dash * dt
          clampFish(fish, L, size)
        } else {
          fish.dash = false
          const dx = (fish.tx ?? fish.x) - fish.x
          const dy = (fish.ty ?? fish.y) - fish.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          if (!fish.turnAt || now > fish.turnAt || dist < 18) {
            pickWander(fish, L, size, others)
          }
          const wx = (fish.tx ?? fish.x) - fish.x
          const wy = (fish.ty ?? fish.y) - fish.y
          const avoid = steerAway(fish, size, others, 0.85)
          let vx = wx + avoid.x * Math.max(40, dist)
          let vy = wy + avoid.y * Math.max(40, dist)
          const wd = Math.sqrt(vx * vx + vy * vy) || 1
          aimAlong(fish, vx, vy)
          fish.x += (vx / wd) * L.cruise * dt
          fish.y += (vy / wd) * L.cruise * dt
          clampFish(fish, L, size)
        }
      })

      separateFish(state.fish, sizes, L)

      setFood(state.food.map((p) => ({ id: p.id, x: p.x, y: p.y })))
      setActors(state.fish.map((f, i) => {
        const entry = currentRoster[i] || {}
        const look = state.looks?.[entry.id] || {}
        return {
          id: entry.id || `fish-${i}`,
          src: entry.src,
          wide: !!entry.wide,
          shape: entry.shape || 'fish',
          variant: entry.variant || (i % 2 === 0 ? 'a' : 'b'),
          filter: look.filter || '',
          x: f.x,
          y: f.y,
          face: f.face,
          tilt: f.tilt || 0,
          dash: f.dash,
          eating: now < f.eatUntil
        }
      }))

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)

    const onFeed = (e) => {
      const x = Number(e.detail?.x)
      const y = Number(e.detail?.y)
      if (!Number.isFinite(x) || !Number.isFinite(y) || !sim.current) return
      const next = Array.from({ length: 3 }, (_, i) => ({
        id: genId() + i,
        x: x + (Math.random() - 0.5) * 28,
        y: y + (Math.random() - 0.2) * 10,
        vx: (Math.random() - 0.5) * 18,
        vy: -42 - Math.random() * 28,
        life: 6,
        eaten: false
      }))
      sim.current.food = [...sim.current.food, ...next].slice(-18)
    }

    window.addEventListener('ocean-feed', onFeed)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('ocean-feed', onFeed)
    }
  }, [])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="ocean-ambience" aria-hidden>
      {bubbles.map((b) => (
        <span
          key={b.id}
          className="ocean-bubble"
          style={{
            left: b.left,
            width: b.size,
            height: b.size,
            WebkitAnimationDuration: b.duration,
            animationDuration: b.duration,
            WebkitAnimationDelay: b.delay,
            animationDelay: b.delay
          }}
        />
      ))}

      {food.map((p) => (
        <span
          key={p.id}
          className="ocean-feed"
          style={{ transform: `translate3d(${p.x}px, ${p.y}px, 0)` }}
        />
      ))}

      {actors.map((fish) => (
        <div
          key={fish.id}
          className={`ocean-fish-actor${fish.dash ? ' is-dash' : ''}${fish.eating ? ' is-eating' : ''}`}
          style={{ transform: `translate3d(${fish.x}px, ${fish.y}px, 0)` }}
        >
          <div
            className="ocean-fish-face"
            style={{
              transform: `scaleX(${fish.face}) rotate(${fish.tilt || 0}deg)`,
              filter: fish.filter || undefined,
              WebkitFilter: fish.filter || undefined
            }}
          >
            <div className="ocean-fish-bob">
              <Betta
                src={fish.src}
                variant={fish.variant}
                wide={fish.wide}
                shape={fish.shape}
              />
            </div>
          </div>
        </div>
      ))}
    </div>,
    document.body
  )
}
