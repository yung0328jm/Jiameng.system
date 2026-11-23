import { useMemo, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

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

function fishLayout() {
  const mobile = isMobile()
  const w = window.innerWidth
  const h = window.innerHeight
  return {
    mobile,
    w,
    h,
    sizes: mobile
      ? [{ width: 92, height: 48 }, { width: 76, height: 40 }]
      : [{ width: 168, height: 88 }, { width: 140, height: 72 }],
    lanes: mobile ? [h * 0.07, h * 0.86] : [h * 0.16, h * 0.58],
    cruise: mobile ? 170 : 95,
    dash: mobile ? 520 : 430,
    eatRange: mobile ? 22 : 32
  }
}

function Betta({ src, variant }) {
  return (
    <div className={`ocean-betta ocean-betta-${variant}`}>
      <img src={src} alt="" className="ocean-betta-layer ocean-betta-body" draggable={false} />
      <img src={src} alt="" className="ocean-betta-layer ocean-betta-tail" draggable={false} />
    </div>
  )
}

export default function OceanAmbience() {
  const bubbles = useMemo(() => BUBBLES, [])
  const [food, setFood] = useState([])
  const [actors, setActors] = useState(() => ([
    { id: 'a', x: 40, y: 120, face: 1, dash: false, eating: false },
    { id: 'b', x: 220, y: 360, face: -1, dash: false, eating: false }
  ]))
  const sim = useRef(null)

  useEffect(() => {
    const layout = fishLayout()
    sim.current = {
      food: [],
      fish: [
        { x: 24, y: layout.lanes[0], face: 1, eatUntil: 0, target: null },
        { x: Math.max(80, layout.w * 0.45), y: layout.lanes[1], face: -1, eatUntil: 0, target: null }
      ]
    }

    let last = performance.now()
    let raf = 0

    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const L = fishLayout()
      const state = sim.current
      if (!state) return

      state.food = state.food.filter((p) => {
        p.vy += 220 * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.life -= dt
        return p.y < L.h + 20 && p.life > 0 && !p.eaten
      })

      state.fish.forEach((fish, i) => {
        const size = L.sizes[i]
        const mouthX = fish.face === 1 ? fish.x + size.width * 0.84 : fish.x + size.width * 0.16
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
            return
          }
          fish.dash = true
          fish.face = dx >= 0 ? 1 : -1
          const speed = L.dash
          fish.x += (dx / dist) * speed * dt
          fish.y += (dy / dist) * speed * dt
        } else {
          fish.dash = false
          const homeY = L.lanes[i]
          fish.y += (homeY - fish.y) * Math.min(1, 2.4 * dt)
          fish.x += fish.face * L.cruise * dt
          if (fish.x > L.w - size.width * 0.35) fish.face = -1
          if (fish.x < -size.width * 0.2) fish.face = 1
        }
      })

      setFood(state.food.map((p) => ({ id: p.id, x: p.x, y: p.y })))
      setActors(state.fish.map((f, i) => ({
        id: i === 0 ? 'a' : 'b',
        x: f.x,
        y: f.y,
        face: f.face,
        dash: f.dash,
        eating: now < f.eatUntil
      })))

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
        vx: (Math.random() - 0.5) * 40,
        vy: 40 + Math.random() * 50,
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
          <div className="ocean-fish-face" style={{ transform: `scaleX(${fish.face})` }}>
            <div className="ocean-fish-bob">
              <Betta
                src={fish.id === 'a' ? '/images/betta-a.png' : '/images/betta-b.png'}
                variant={fish.id}
              />
            </div>
          </div>
        </div>
      ))}
    </div>,
    document.body
  )
}
