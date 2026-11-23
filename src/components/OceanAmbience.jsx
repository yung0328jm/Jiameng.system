import { useMemo, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { getCurrentUser } from '../utils/authStorage'
import { getAmbientFishRoster } from '../utils/fishSkinStorage'
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

function fishSize(wide, index, mobile) {
  if (wide) {
    return index % 2 === 0
      ? (mobile ? { width: 132, height: 42 } : { width: 220, height: 70 })
      : (mobile ? { width: 114, height: 36 } : { width: 188, height: 60 })
  }
  return index % 2 === 0
    ? (mobile ? { width: 92, height: 48 } : { width: 168, height: 88 })
    : (mobile ? { width: 76, height: 40 } : { width: 140, height: 72 })
}

function spawnFish(i, count, L, size) {
  const t = count <= 1 ? 0.35 : i / (count - 1)
  return {
    x: 18 + ((i * 97) % Math.max(60, L.w - size.width - 24)),
    y: 28 + t * Math.max(80, L.h * 0.72),
    face: i % 2 === 0 ? 1 : -1,
    tilt: 0,
    eatUntil: 0,
    tx: L.w * (0.2 + (i * 0.13) % 0.6),
    ty: 28 + t * Math.max(80, L.h * 0.72),
    turnAt: 0
  }
}

function pickWander(fish, L, size) {
  const padX = 16
  const padY = 28
  fish.tx = padX + Math.random() * Math.max(40, L.w - size.width - padX * 2)
  fish.ty = padY + Math.random() * Math.max(40, L.h - size.height - padY * 2)
  fish.turnAt = performance.now() + 1600 + Math.random() * 4200
}

function rosterKey(roster) {
  return (roster || []).map((f) => `${f.key}:${f.src}`).join('|')
}

function Betta({ src, variant, wide }) {
  return (
    <div className={`ocean-betta ocean-betta-${variant}${wide ? ' ocean-betta-wide' : ''}`}>
      <img src={src} alt="" className="ocean-betta-layer ocean-betta-body" draggable={false} />
      <img src={src} alt="" className="ocean-betta-layer ocean-betta-tail" draggable={false} />
    </div>
  )
}

export default function OceanAmbience() {
  const bubbles = useMemo(() => BUBBLES, [])
  const [food, setFood] = useState([])
  const [actors, setActors] = useState(() => getAmbientFishRoster(getCurrentUser()).map((f, i) => ({
    ...f,
    x: 40 + i * 80,
    y: 120 + i * 80,
    face: i % 2 === 0 ? 1 : -1,
    tilt: 0,
    dash: false,
    eating: false
  })))
  const sim = useRef(null)
  const rosterRef = useRef(getAmbientFishRoster(getCurrentUser()))

  useEffect(() => {
    const refresh = () => {
      const next = getAmbientFishRoster(getCurrentUser())
      if (rosterKey(rosterRef.current) === rosterKey(next)) return
      rosterRef.current = next
    }
    refresh()
    const onRt = (e) => {
      const key = e?.detail?.key
      if (key && key !== '__ALL__' && key !== 'jiameng_equipped_effects' && key !== 'jiameng_inventories' && key !== 'jiameng_items') return
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
    sim.current = {
      food: [],
      fish: startRoster.map((entry, i) => spawnFish(i, startRoster.length, L0, fishSize(entry.wide, i, L0.mobile)))
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

      while (state.fish.length < currentRoster.length) {
        const i = state.fish.length
        const size = fishSize(currentRoster[i]?.wide, i, L.mobile)
        state.fish.push(spawnFish(i, currentRoster.length, L, size))
      }
      if (state.fish.length > currentRoster.length) {
        state.fish.length = currentRoster.length
      }

      const tiltToward = (fish, dx, dy) => {
        const want = Math.atan2(dy, Math.abs(dx) + 8) * (180 / Math.PI)
        const clamped = Math.max(-58, Math.min(58, want))
        fish.tilt += (clamped - (fish.tilt || 0)) * Math.min(1, 9 * dt)
      }

      state.food = state.food.filter((p) => {
        p.vy += 90 * dt
        if (p.vy > 62) p.vy = 62
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.life -= dt
        return p.y < L.h + 20 && p.y > -40 && p.life > 0 && !p.eaten
      })

      state.fish.forEach((fish, i) => {
        const entry = currentRoster[i]
        const size = fishSize(entry?.wide, i, L.mobile)
        const mouthRatio = entry?.wide ? 0.9 : 0.84
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
            pickWander(fish, L, size)
            return
          }
          fish.dash = true
          fish.face = dx >= 0 ? 1 : -1
          tiltToward(fish, dx, dy)
          const speed = L.dash
          fish.x += (dx / dist) * speed * dt
          fish.y += (dy / dist) * speed * dt
        } else {
          fish.dash = false
          const dx = (fish.tx ?? fish.x) - fish.x
          const dy = (fish.ty ?? fish.y) - fish.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          if (!fish.turnAt || now > fish.turnAt || dist < 18) {
            pickWander(fish, L, size)
          }
          const wx = (fish.tx ?? fish.x) - fish.x
          const wy = (fish.ty ?? fish.y) - fish.y
          const wd = Math.sqrt(wx * wx + wy * wy) || 1
          fish.face = wx >= 0 ? 1 : -1
          tiltToward(fish, wx, wy)
          fish.x += (wx / wd) * L.cruise * dt
          fish.y += (wy / wd) * L.cruise * dt
          fish.x = Math.max(-size.width * 0.25, Math.min(L.w - size.width * 0.3, fish.x))
          fish.y = Math.max(8, Math.min(L.h - size.height - 8, fish.y))
        }
      })

      setFood(state.food.map((p) => ({ id: p.id, x: p.x, y: p.y })))
      setActors(state.fish.map((f, i) => {
        const entry = currentRoster[i] || {}
        return {
          id: entry.id || `fish-${i}`,
          src: entry.src,
          wide: !!entry.wide,
          variant: entry.variant || (i % 2 === 0 ? 'a' : 'b'),
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
            style={{ transform: `scaleX(${fish.face}) rotate(${fish.tilt || 0}deg)` }}
          >
            <div className="ocean-fish-bob">
              <Betta
                src={fish.src}
                variant={fish.variant}
                wide={fish.wide}
              />
            </div>
          </div>
        </div>
      ))}
    </div>,
    document.body
  )
}
